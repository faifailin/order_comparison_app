import { z } from "zod";
import * as XLSX from "xlsx";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type MessageContent } from "./_core/llm";
import { storagePut } from "./storage";
import {
  createComparisonRecord,
  updateComparisonRecord,
  getComparisonRecordById,
  listComparisonRecords,
  createOrderItems,
  getOrderItemsByComparisonId,
} from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  seq: number;
  itemNo: string;   // 貨號（內部品號）
  barcode: string;  // 國際條碼
  itemName: string;
  quantity: number;
}

export interface OrderData {
  orderNo: string;
  storeName: string;
  items: OrderItem[];
}

export interface ItemComparisonResult {
  matchKey: string;       // 比對鍵（條碼優先，無條碼則用貨號）
  matchKeyType: "barcode" | "itemNo";  // 比對依據
  barcode: string;
  itemNo: string;
  itemName: string;
  purchaseQty: number | null;
  shipmentQty: number | null;
  status: "match" | "mismatch" | "missing";
  diffNote: string;
  source?: "purchase_only" | "shipment_only" | "both";
}

export interface ComparisonSummary {
  storeNameMatch: "match" | "mismatch" | "missing";
  purchaseStoreName: string;
  shipmentCustomerName: string;
  items: ItemComparisonResult[];
  overallStatus: "all_match" | "has_diff" | "error";
  totalItems: number;
  matchCount: number;
  mismatchCount: number;
  missingCount: number;
}

// ─── Excel Parser ────────────────────────────────────────────────────────────

/**
 * 解析蜜比出貨單 Excel 格式
 * 欄位順序：品牌 | 品類 | 品項 | 貨號 | 條碼 | 數量 | 進貨單價 | 小計
 * Row 1: 標題列（蜜比有限公司 出貨單）
 * Row 2: 訂單資訊（訂單日期、訂單編號、店家名稱、通路商）
 * Row 3: 欄位標題
 * Row 4+: 品項資料（直到「合計」列）
 */
function extractOrderFromExcel(buffer: Buffer): OrderData {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel 檔案無工作表");
  const ws = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

  // 從 Row 2 解析訂單資訊（index 1）
  const infoRow = String(rows[1]?.[0] ?? "");
  let orderNo = "";
  let storeName = "";

  // 解析格式：「訂單日期：...　訂單編號：ORD-xxx　店家名稱：xxx　通路商：xxx」
  const orderNoMatch = infoRow.match(/訂單編號[：:](\S+)/);
  const storeNameMatch = infoRow.match(/店家名稱[：:]([^\s　]+)/);
  if (orderNoMatch) orderNo = orderNoMatch[1].trim();
  if (storeNameMatch) storeName = storeNameMatch[1].trim();

  // 從 Row 4 開始解析品項（index 3），遇到「合計」列停止
  const items: OrderItem[] = [];
  let seq = 1;
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const firstCell = String(row[0] ?? "").trim();
    if (firstCell === "合計" || firstCell === "") continue;

    // 欄位：品牌(0) | 品類(1) | 品項(2) | 貨號(3) | 條碼(4) | 數量(5)
    const itemNo = String(row[3] ?? "").trim();
    const rawBarcode = String(row[4] ?? "").trim();
    // 條碼可能是浮點數字串（如 "8809398927997.0"），需轉為整數字串
    const barcode = rawBarcode ? String(Math.round(Number(rawBarcode))) : "";
    const brandName = String(row[0] ?? "").trim();
    const category = String(row[1] ?? "").trim();
    const variant = String(row[2] ?? "").trim();
    const itemName = [brandName, category, variant].filter(Boolean).join(" ");
    const quantity = Number(row[5] ?? 0);

    if (!itemNo && !barcode && !itemName) continue;

    items.push({ seq: seq++, itemNo, barcode, itemName, quantity });
  }

  return { orderNo, storeName, items };
}

// ─── OCR Helper ───────────────────────────────────────────────────────────────

async function extractOrderFromImage(imageBase64: string, mimeType: string, orderType: "purchase" | "shipment"): Promise<OrderData> {
  const systemPrompt = orderType === "purchase"
    ? `你是一個專業的採購單 OCR 解析助手。請從圖片中擷取採購單資訊，包含：採購單編號、門市名稱、以及所有品項（貨號、條碼、品項名稱、數量）。支援格式包含一般採購單與愛吾兒等通路商格式。`
    : `你是一個專業的出貨單 OCR 解析助手。請從圖片中擷取出貨單資訊，包含：銷貨單號、客戶名稱、以及所有品項（貨號、國際條碼、品名規格、數量）。支援蜜比有限公司出貨單格式，客戶名稱可能包含「愛吾兒」、「卡多摩」等通路商名稱。`;

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const response = await invokeLLM({
    messages: [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: ([
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
          {
            type: "text",
            text: `請仔細分析這張${orderType === "purchase" ? "採購單" : "出貨單"}圖片，擷取所有資訊並以 JSON 格式回傳。
格式如下：
{
  "orderNo": "訂單編號",
  "storeName": "${orderType === "purchase" ? "門市名稱" : "客戶名稱"}",
  "items": [
    {
      "seq": 序號(數字),
      "itemNo": "貨號（如 GPSS-0351，若無則填空字串）",
      "barcode": "國際條碼（通常為13位數字，若無則填空字串）",
      "itemName": "品項名稱",
      "quantity": 數量(數字)
    }
  ]
}
注意：
- 貨號（itemNo）通常出現在表格的「貨號」或「貨號」欄位，格式如 GPSS-0351
- 條碼（barcode）通常為13位數字，出現在「國際條碼」欄位
- 若某欄位圖片中不存在，請填入空字串 ""
- 數量請擷取純數字
- 如有贈品或金額為0的品項（如紙卡類），仍需列入
- 只回傳 JSON，不要加任何說明文字`,
          },
        ] as MessageContent[]),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "order_data",
        strict: true,
        schema: {
          type: "object",
          properties: {
            orderNo: { type: "string" },
            storeName: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  seq: { type: "number" },
                  itemNo: { type: "string" },
                  barcode: { type: "string" },
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                },
                required: ["seq", "itemNo", "barcode", "itemName", "quantity"],
                additionalProperties: false,
              },
            },
          },
          required: ["orderNo", "storeName", "items"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) throw new Error("OCR 解析失敗：無回應內容");
  const content = typeof rawContent === "string"
    ? rawContent
    : rawContent.map(p => (p.type === "text" ? p.text : "")).join("");

  try {
    return JSON.parse(content) as OrderData;
  } catch {
    throw new Error("OCR 解析失敗：JSON 格式錯誤");
  }
}

// ─── Comparison Logic ─────────────────────────────────────────────────────────

/**
 * 取得品項的比對鍵：優先使用條碼，無條碼時改用貨號
 */
function getMatchKey(item: OrderItem): { key: string; type: "barcode" | "itemNo" } | null {
  const barcode = item.barcode?.trim();
  if (barcode) return { key: barcode, type: "barcode" };
  const itemNo = item.itemNo?.trim();
  if (itemNo) return { key: itemNo, type: "itemNo" };
  return null;
}

function compareOrders(purchase: OrderData, shipment: OrderData): ComparisonSummary {
  // 比對門市名稱
  const pStore = purchase.storeName?.trim() ?? "";
  const sStore = shipment.storeName?.trim() ?? "";
  let storeNameMatch: "match" | "mismatch" | "missing" = "missing";
  if (pStore && sStore) {
    const normalize = (s: string) => s.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
    const pNorm = normalize(pStore);
    const sNorm = normalize(sStore);
    storeNameMatch = (pNorm === sNorm || sNorm.includes(pNorm) || pNorm.includes(sNorm))
      ? "match"
      : "mismatch";
  }

  // 建立比對索引（條碼優先，無條碼用貨號）
  const purchaseMap = new Map<string, { item: OrderItem; keyType: "barcode" | "itemNo" }>();
  const shipmentMap = new Map<string, { item: OrderItem; keyType: "barcode" | "itemNo" }>();

  for (const item of purchase.items) {
    const mk = getMatchKey(item);
    if (mk) purchaseMap.set(mk.key, { item, keyType: mk.type });
  }
  for (const item of shipment.items) {
    const mk = getMatchKey(item);
    if (mk) shipmentMap.set(mk.key, { item, keyType: mk.type });
  }

  const allKeys = new Set([...Array.from(purchaseMap.keys()), ...Array.from(shipmentMap.keys())]);
  const itemResults: ItemComparisonResult[] = [];

  for (const key of Array.from(allKeys)) {
    const pEntry = purchaseMap.get(key);
    const sEntry = shipmentMap.get(key);
    const keyType = pEntry?.keyType ?? sEntry?.keyType ?? "barcode";

    if (pEntry && sEntry) {
      const pItem = pEntry.item;
      const sItem = sEntry.item;
      const qtyMatch = pItem.quantity === sItem.quantity;
      itemResults.push({
        matchKey: key,
        matchKeyType: keyType,
        barcode: pItem.barcode || sItem.barcode,
        itemNo: pItem.itemNo || sItem.itemNo,
        itemName: pItem.itemName || sItem.itemName,
        purchaseQty: pItem.quantity,
        shipmentQty: sItem.quantity,
        status: qtyMatch ? "match" : "mismatch",
        diffNote: qtyMatch ? "" : `採購數量 ${pItem.quantity}，出貨數量 ${sItem.quantity}`,
        source: "both",
      });
    } else if (pEntry && !sEntry) {
      const pItem = pEntry.item;
      itemResults.push({
        matchKey: key,
        matchKeyType: keyType,
        barcode: pItem.barcode,
        itemNo: pItem.itemNo,
        itemName: pItem.itemName,
        purchaseQty: pItem.quantity,
        shipmentQty: null,
        status: "missing",
        diffNote: "出貨單缺少此品項",
        source: "purchase_only",
      });
    } else if (!pEntry && sEntry) {
      const sItem = sEntry.item;
      itemResults.push({
        matchKey: key,
        matchKeyType: keyType,
        barcode: sItem.barcode,
        itemNo: sItem.itemNo,
        itemName: sItem.itemName,
        purchaseQty: null,
        shipmentQty: sItem.quantity,
        status: "missing",
        diffNote: "採購單缺少此品項",
        source: "shipment_only",
      });
    }
  }

  // 排序：依採購單序號排列
  itemResults.sort((a, b) => {
    const aSeq = purchase.items.find(i => getMatchKey(i)?.key === a.matchKey)?.seq ?? 999;
    const bSeq = purchase.items.find(i => getMatchKey(i)?.key === b.matchKey)?.seq ?? 999;
    return aSeq - bSeq;
  });

  const matchCount = itemResults.filter(i => i.status === "match").length;
  const mismatchCount = itemResults.filter(i => i.status === "mismatch").length;
  const missingCount = itemResults.filter(i => i.status === "missing").length;

  const overallStatus: "all_match" | "has_diff" | "error" =
    storeNameMatch === "match" && mismatchCount === 0 && missingCount === 0
      ? "all_match"
      : "has_diff";

  return {
    storeNameMatch,
    purchaseStoreName: pStore,
    shipmentCustomerName: sStore,
    items: itemResults,
    overallStatus,
    totalItems: itemResults.length,
    matchCount,
    mismatchCount,
    missingCount,
  };
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const OrderItemSchema = z.object({
  seq: z.number(),
  itemNo: z.string().default(""),
  barcode: z.string().default(""),
  itemName: z.string(),
  quantity: z.number(),
});

const OrderDataSchema = z.object({
  orderNo: z.string(),
  storeName: z.string(),
  items: z.array(OrderItemSchema),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  comparison: router({
    /**
     * 上傳圖片並透過 AI OCR 擷取訂單資訊
     */
    extractFromImage: publicProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.string().default("image/jpeg"),
        orderType: z.enum(["purchase", "shipment"]),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.mimeType.includes("png") ? "png" : "jpg";
        const fileKey = `orders/${input.orderType}-${Date.now()}.${ext}`;
        // OCR uses base64 directly — no public URL needed
        const orderData = await extractOrderFromImage(input.imageBase64, input.mimeType, input.orderType);
        // Store file locally for record-keeping
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        return { orderData, imageUrl: url };
      }),

    /**
     * 上傳 Excel 檔案並解析訂單資訊（支援蜜比出貨單 xlsx 格式）
     */
    extractFromExcel: publicProcedure
      .input(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        orderType: z.enum(["purchase", "shipment"]),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        // 上傳至 S3 保存原始檔案
        const fileKey = `orders/${input.orderType}-${Date.now()}.xlsx`;
        const { url } = await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        const orderData = extractOrderFromExcel(buffer);
        return { orderData, fileUrl: url };
      }),

    /**
     * 執行比對並儲存結果
     */
    compare: publicProcedure
      .input(z.object({
        purchaseData: OrderDataSchema,
        shipmentData: OrderDataSchema,
        purchaseImageUrl: z.string().optional(),
        shipmentImageUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const summary = compareOrders(input.purchaseData, input.shipmentData);

        const recordId = await createComparisonRecord({
          purchaseOrderNo: input.purchaseData.orderNo,
          shipmentOrderNo: input.shipmentData.orderNo,
          purchaseStoreName: summary.purchaseStoreName,
          shipmentCustomerName: summary.shipmentCustomerName,
          storeNameMatch: summary.storeNameMatch,
          overallStatus: summary.overallStatus,
          purchaseImageUrl: input.purchaseImageUrl ?? null,
          shipmentImageUrl: input.shipmentImageUrl ?? null,
          purchaseRawData: input.purchaseData as unknown as Record<string, unknown>,
          shipmentRawData: input.shipmentData as unknown as Record<string, unknown>,
          comparisonSummary: summary as unknown as Record<string, unknown>,
        });

        // 儲存採購單品項
        const purchaseItems = input.purchaseData.items.map(item => ({
          comparisonId: recordId,
          source: "purchase" as const,
          seq: item.seq,
          itemNo: item.itemNo || null,
          barcode: item.barcode || null,
          itemName: item.itemName,
          quantity: item.quantity,
          matchStatus: summary.items.find(r => r.matchKey === (item.barcode?.trim() || item.itemNo?.trim()))?.status ?? "missing",
          diffNote: summary.items.find(r => r.matchKey === (item.barcode?.trim() || item.itemNo?.trim()))?.diffNote ?? "",
        }));

        // 儲存出貨單品項
        const shipmentItems = input.shipmentData.items.map(item => ({
          comparisonId: recordId,
          source: "shipment" as const,
          seq: item.seq,
          itemNo: item.itemNo || null,
          barcode: item.barcode || null,
          itemName: item.itemName,
          quantity: item.quantity,
          matchStatus: summary.items.find(r => r.matchKey === (item.barcode?.trim() || item.itemNo?.trim()))?.status ?? "missing",
          diffNote: summary.items.find(r => r.matchKey === (item.barcode?.trim() || item.itemNo?.trim()))?.diffNote ?? "",
        }));

        await createOrderItems([...purchaseItems, ...shipmentItems]);

        return { recordId, summary };
      }),

    /**
     * 取得歷史比對紀錄列表
     */
    list: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        const records = await listComparisonRecords(input.limit, input.offset);
        return records;
      }),

    /**
     * 取得單筆比對紀錄詳情
     */
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const record = await getComparisonRecordById(input.id);
        if (!record) throw new Error("紀錄不存在");
        const items = await getOrderItemsByComparisonId(input.id);
        return { record, items };
      }),
  }),
});

export type AppRouter = typeof appRouter;
