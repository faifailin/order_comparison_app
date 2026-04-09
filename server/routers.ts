import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
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

export interface OrderData {
  orderNo: string;
  storeName: string;
  items: Array<{
    seq: number;
    barcode: string;
    itemName: string;
    quantity: number;
  }>;
}

export interface ItemComparisonResult {
  barcode: string;
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

// ─── OCR Helper ───────────────────────────────────────────────────────────────

async function extractOrderFromImage(imageUrl: string, orderType: "purchase" | "shipment"): Promise<OrderData> {
  const systemPrompt = orderType === "purchase"
    ? `你是一個專業的採購單 OCR 解析助手。請從圖片中擷取採購單資訊，包含：採購單編號、門市名稱、以及所有品項（條碼、品項名稱、數量）。`
    : `你是一個專業的出貨單 OCR 解析助手。請從圖片中擷取出貨單資訊，包含：銷貨單號、客戶名稱、以及所有品項（國際條碼、品名規格、數量）。`;

  const response = await invokeLLM({
    messages: [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: ([
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
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
      "barcode": "條碼",
      "itemName": "品項名稱",
      "quantity": 數量(數字)
    }
  ]
}
注意：
- 條碼請完整擷取，通常為13位數字
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
                  barcode: { type: "string" },
                  itemName: { type: "string" },
                  quantity: { type: "number" },
                },
                required: ["seq", "barcode", "itemName", "quantity"],
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

function compareOrders(purchase: OrderData, shipment: OrderData): ComparisonSummary {
  // 比對門市名稱
  const pStore = purchase.storeName?.trim() ?? "";
  const sStore = shipment.storeName?.trim() ?? "";
  let storeNameMatch: "match" | "mismatch" | "missing" = "missing";
  if (pStore && sStore) {
    // 模糊比對：判斷是否包含相同的核心門市名稱
    const normalize = (s: string) => s.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
    const pNorm = normalize(pStore);
    const sNorm = normalize(sStore);
    storeNameMatch = (pNorm === sNorm || sNorm.includes(pNorm) || pNorm.includes(sNorm))
      ? "match"
      : "mismatch";
  }

  // 建立條碼索引
  const purchaseMap = new Map<string, typeof purchase.items[0]>();
  const shipmentMap = new Map<string, typeof shipment.items[0]>();

  for (const item of purchase.items) {
    if (item.barcode) purchaseMap.set(item.barcode.trim(), item);
  }
  for (const item of shipment.items) {
    if (item.barcode) shipmentMap.set(item.barcode.trim(), item);
  }

  const allBarcodes = new Set([...Array.from(purchaseMap.keys()), ...Array.from(shipmentMap.keys())]);
  const itemResults: ItemComparisonResult[] = [];

  for (const barcode of Array.from(allBarcodes)) {
    const pItem = purchaseMap.get(barcode);
    const sItem = shipmentMap.get(barcode);

    if (pItem && sItem) {
      const qtyMatch = pItem.quantity === sItem.quantity;
      itemResults.push({
        barcode,
        itemName: pItem.itemName || sItem.itemName,
        purchaseQty: pItem.quantity,
        shipmentQty: sItem.quantity,
        status: qtyMatch ? "match" : "mismatch",
        diffNote: qtyMatch ? "" : `採購數量 ${pItem.quantity}，出貨數量 ${sItem.quantity}`,
        source: "both",
      });
    } else if (pItem && !sItem) {
      itemResults.push({
        barcode,
        itemName: pItem.itemName,
        purchaseQty: pItem.quantity,
        shipmentQty: null,
        status: "missing",
        diffNote: "出貨單缺少此品項",
        source: "purchase_only",
      });
    } else if (!pItem && sItem) {
      itemResults.push({
        barcode,
        itemName: sItem.itemName,
        purchaseQty: null,
        shipmentQty: sItem.quantity,
        status: "missing",
        diffNote: "採購單缺少此品項",
        source: "shipment_only",
      });
    }
  }

  // 排序：先顯示有條碼的、再依序號排列
  itemResults.sort((a, b) => {
    const aSeq = purchase.items.find(i => i.barcode === a.barcode)?.seq ?? 999;
    const bSeq = purchase.items.find(i => i.barcode === b.barcode)?.seq ?? 999;
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
  barcode: z.string(),
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
        // 將 base64 轉換為 Buffer 並上傳至 S3
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.mimeType.includes("png") ? "png" : "jpg";
        const fileKey = `orders/${input.orderType}-${Date.now()}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        // 呼叫 OCR
        const orderData = await extractOrderFromImage(url, input.orderType);
        return { orderData, imageUrl: url };
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

        // 儲存主紀錄
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
          barcode: item.barcode,
          itemName: item.itemName,
          quantity: item.quantity,
          matchStatus: summary.items.find(r => r.barcode === item.barcode)?.status ?? "missing",
          diffNote: summary.items.find(r => r.barcode === item.barcode)?.diffNote ?? "",
        }));

        // 儲存出貨單品項
        const shipmentItems = input.shipmentData.items.map(item => ({
          comparisonId: recordId,
          source: "shipment" as const,
          seq: item.seq,
          barcode: item.barcode,
          itemName: item.itemName,
          quantity: item.quantity,
          matchStatus: summary.items.find(r => r.barcode === item.barcode)?.status ?? "missing",
          diffNote: summary.items.find(r => r.barcode === item.barcode)?.diffNote ?? "",
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
