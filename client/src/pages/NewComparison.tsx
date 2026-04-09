import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Plus, Trash2, FileImage, ArrowRight, RotateCcw, Eye
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  seq: number;
  barcode: string;
  itemName: string;
  quantity: number;
}

interface OrderData {
  orderNo: string;
  storeName: string;
  items: OrderItem[];
}

interface ItemComparisonResult {
  barcode: string;
  itemName: string;
  purchaseQty: number | null;
  shipmentQty: number | null;
  status: "match" | "mismatch" | "missing";
  diffNote: string;
  source?: "purchase_only" | "shipment_only" | "both";
}

interface ComparisonSummary {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyOrder = (): OrderData => ({
  orderNo: "",
  storeName: "",
  items: [{ seq: 1, barcode: "", itemName: "", quantity: 1 }],
});

function StatusBadge({ status }: { status: "match" | "mismatch" | "missing" }) {
  if (status === "match") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      <CheckCircle2 className="h-3 w-3" /> 一致
    </span>
  );
  if (status === "mismatch") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
      <AlertTriangle className="h-3 w-3" /> 差異
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">
      <XCircle className="h-3 w-3" /> 缺漏
    </span>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({
  label, orderType, onExtracted, imageUrl, isLoading
}: {
  label: string;
  orderType: "purchase" | "shipment";
  onExtracted: (data: OrderData, imageUrl: string) => void;
  imageUrl: string | null;
  isLoading: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extractMutation = trpc.comparison.extractFromImage.useMutation();

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("請上傳圖片檔案");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("圖片大小不得超過 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const result = await extractMutation.mutateAsync({
          imageBase64: base64,
          mimeType: file.type,
          orderType,
        });
        onExtracted(result.orderData, result.imageUrl);
        toast.success(`${label} OCR 擷取成功`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "OCR 解析失敗";
        toast.error(msg);
      }
    };
    reader.readAsDataURL(file);
  }, [extractMutation, label, onExtracted, orderType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const isProcessing = extractMutation.isPending || isLoading;

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden
        ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-white/2"}
        ${imageUrl ? "border-solid border-border/50" : ""}
      `}
      style={{ minHeight: "200px" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
      />
      {isProcessing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">AI 正在解析圖片...</p>
        </div>
      ) : null}
      {imageUrl ? (
        <div className="relative">
          <img src={imageUrl} alt={label} className="w-full h-48 object-cover opacity-60" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm">
            <FileImage className="h-6 w-6 text-primary mb-2" />
            <p className="text-xs text-muted-foreground">點擊重新上傳</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">拖曳或點擊上傳圖片，AI 自動擷取資訊</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Order Editor ─────────────────────────────────────────────────────────────

function OrderEditor({
  title, data, onChange, accent
}: {
  title: string;
  data: OrderData;
  onChange: (data: OrderData) => void;
  accent: string;
}) {
  const addItem = () => {
    onChange({
      ...data,
      items: [...data.items, { seq: data.items.length + 1, barcode: "", itemName: "", quantity: 1 }],
    });
  };

  const removeItem = (idx: number) => {
    onChange({ ...data, items: data.items.filter((_, i) => i !== idx) });
  };

  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    const items = [...data.items];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ ...data, items });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={`px-5 py-4 border-b border-border ${accent}`}>
        <h3 className="font-semibold text-sm tracking-wide text-foreground">{title}</h3>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">訂單編號</label>
            <Input
              value={data.orderNo}
              onChange={e => onChange({ ...data, orderNo: e.target.value })}
              placeholder="例：W20260408011"
              className="h-9 text-sm bg-input border-border"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">門市／客戶名稱</label>
            <Input
              value={data.storeName}
              onChange={e => onChange({ ...data, storeName: e.target.value })}
              placeholder="例：K050 內湖東湖店"
              className="h-9 text-sm bg-input border-border"
            />
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-1">
            <span className="col-span-1 text-xs text-muted-foreground">#</span>
            <span className="col-span-4 text-xs text-muted-foreground">條碼</span>
            <span className="col-span-5 text-xs text-muted-foreground">品項名稱</span>
            <span className="col-span-1 text-xs text-muted-foreground text-center">數量</span>
            <span className="col-span-1"></span>
          </div>
          {data.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center group">
              <span className="col-span-1 text-xs text-muted-foreground text-center">{idx + 1}</span>
              <Input
                value={item.barcode}
                onChange={e => updateItem(idx, "barcode", e.target.value)}
                placeholder="條碼"
                className="col-span-4 h-8 text-xs bg-input border-border font-mono"
              />
              <Input
                value={item.itemName}
                onChange={e => updateItem(idx, "itemName", e.target.value)}
                placeholder="品項名稱"
                className="col-span-5 h-8 text-xs bg-input border-border"
              />
              <Input
                type="number"
                min={0}
                value={item.quantity}
                onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                className="col-span-1 h-8 text-xs bg-input border-border text-center"
              />
              <button
                onClick={() => removeItem(idx)}
                className="col-span-1 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addItem}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-1"
          >
            <Plus className="h-3.5 w-3.5" />
            新增品項
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Comparison Result ────────────────────────────────────────────────────────

function ComparisonResult({
  summary, recordId, onReset
}: {
  summary: ComparisonSummary;
  recordId: number;
  onReset: () => void;
}) {
  const [, setLocation] = useLocation();

  const overallIcon = summary.overallStatus === "all_match"
    ? <CheckCircle2 className="h-6 w-6 text-emerald-400" />
    : <AlertTriangle className="h-6 w-6 text-amber-400" />;

  const overallLabel = summary.overallStatus === "all_match"
    ? "所有品項完全一致" : "發現差異，請確認";

  const overallBg = summary.overallStatus === "all_match"
    ? "bg-emerald-500/10 border-emerald-500/20"
    : "bg-amber-500/10 border-amber-500/20";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overall status banner */}
      <div className={`rounded-xl border p-5 flex items-center gap-4 ${overallBg}`}>
        {overallIcon}
        <div className="flex-1">
          <p className="font-semibold text-foreground">{overallLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            共 {summary.totalItems} 項 · 一致 {summary.matchCount} · 差異 {summary.mismatchCount} · 缺漏 {summary.missingCount}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset} className="gap-2 border-border">
            <RotateCcw className="h-3.5 w-3.5" /> 重新比對
          </Button>
          <Button size="sm" onClick={() => setLocation(`/history/${recordId}`)} className="gap-2 bg-primary text-primary-foreground">
            <Eye className="h-3.5 w-3.5" /> 查看詳情
          </Button>
        </div>
      </div>

      {/* Store name comparison */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block"></span>
          門市名稱比對
        </h3>
        <div className="grid grid-cols-2 gap-4 items-center">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">採購單門市</p>
            <p className="text-sm font-medium text-foreground">{summary.purchaseStoreName || "—"}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">出貨單客戶</p>
            <p className="text-sm font-medium text-foreground">{summary.shipmentCustomerName || "—"}</p>
          </div>
        </div>
        <div className="mt-3 flex justify-center">
          <StatusBadge status={summary.storeNameMatch} />
        </div>
      </div>

      {/* Items comparison table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block"></span>
            品項比對明細
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">條碼</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">品項名稱</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">採購數量</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">出貨數量</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">比對結果</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">說明</th>
              </tr>
            </thead>
            <tbody>
              {summary.items.map((item, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-border/50 transition-colors hover:bg-muted/20
                    ${item.status === "mismatch" ? "bg-amber-500/5" : ""}
                    ${item.status === "missing" ? "bg-red-500/5" : ""}
                  `}
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{item.barcode}</td>
                  <td className="px-4 py-3.5 text-xs text-foreground max-w-48 truncate">{item.itemName}</td>
                  <td className="px-4 py-3.5 text-center text-sm font-medium">
                    {item.purchaseQty !== null ? (
                      <span className={item.status === "mismatch" ? "text-amber-400" : "text-foreground"}>
                        {item.purchaseQty}
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-center text-sm font-medium">
                    {item.shipmentQty !== null ? (
                      <span className={item.status === "mismatch" ? "text-amber-400" : "text-foreground"}>
                        {item.shipmentQty}
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{item.diffNote || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Step = "upload" | "edit" | "result";

export default function NewComparison() {
  const [step, setStep] = useState<Step>("upload");
  const [purchaseData, setPurchaseData] = useState<OrderData>(emptyOrder());
  const [shipmentData, setShipmentData] = useState<OrderData>(emptyOrder());
  const [purchaseImageUrl, setPurchaseImageUrl] = useState<string | null>(null);
  const [shipmentImageUrl, setShipmentImageUrl] = useState<string | null>(null);
  const [comparisonResult, setComparisonResult] = useState<{ summary: ComparisonSummary; recordId: number } | null>(null);

  const compareMutation = trpc.comparison.compare.useMutation();

  const handlePurchaseExtracted = (data: OrderData, url: string) => {
    setPurchaseData(data);
    setPurchaseImageUrl(url);
    if (shipmentImageUrl) setStep("edit");
  };

  const handleShipmentExtracted = (data: OrderData, url: string) => {
    setShipmentData(data);
    setShipmentImageUrl(url);
    if (purchaseImageUrl) setStep("edit");
  };

  const handleCompare = async () => {
    if (!purchaseData.storeName && !purchaseData.orderNo) {
      toast.error("請填寫採購單資訊");
      return;
    }
    if (!shipmentData.storeName && !shipmentData.orderNo) {
      toast.error("請填寫出貨單資訊");
      return;
    }
    try {
      const result = await compareMutation.mutateAsync({
        purchaseData,
        shipmentData,
        purchaseImageUrl: purchaseImageUrl ?? undefined,
        shipmentImageUrl: shipmentImageUrl ?? undefined,
      });
      setComparisonResult({ summary: result.summary as ComparisonSummary, recordId: result.recordId });
      setStep("result");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "比對失敗";
      toast.error(msg);
    }
  };

  const handleReset = () => {
    setPurchaseData(emptyOrder());
    setShipmentData(emptyOrder());
    setPurchaseImageUrl(null);
    setShipmentImageUrl(null);
    setComparisonResult(null);
    setStep("upload");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">新增比對</h1>
        <p className="text-sm text-muted-foreground mt-1">上傳採購單與出貨單圖片，AI 自動擷取資訊並比對差異</p>
      </div>

      {/* Step indicator */}
      {step !== "result" && (
        <div className="flex items-center gap-3 text-xs">
          {([
            { key: "upload" as Step, label: "上傳圖片" },
            { key: "edit" as Step, label: "確認資料" },
            { key: "result" as Step, label: "比對結果" },
          ] as const).map((s, i) => (
            <div key={s.key} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 ${(step as string) === s.key ? "text-primary" : (step as string) === "result" || ((step as string) === "edit" && i === 0) ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-medium
                  ${step === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </span>
                {s.label}
              </div>
              {i < 2 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
            </div>
          ))}
        </div>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-400 inline-block"></span>
                採購單
              </h3>
              <UploadZone
                label="上傳採購單圖片"
                orderType="purchase"
                onExtracted={handlePurchaseExtracted}
                imageUrl={purchaseImageUrl}
                isLoading={false}
              />
              {purchaseImageUrl && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 採購單已擷取
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-violet-400 inline-block"></span>
                出貨單
              </h3>
              <UploadZone
                label="上傳出貨單圖片"
                orderType="shipment"
                onExtracted={handleShipmentExtracted}
                imageUrl={shipmentImageUrl}
                isLoading={false}
              />
              {shipmentImageUrl && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 出貨單已擷取
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Separator className="flex-1 bg-border/50" />
            <span className="text-xs text-muted-foreground">或</span>
            <Separator className="flex-1 bg-border/50" />
          </div>

          <Button
            variant="outline"
            className="w-full border-border hover:border-primary/50 gap-2"
            onClick={() => setStep("edit")}
          >
            <Plus className="h-4 w-4" />
            手動輸入訂單資料
          </Button>
        </div>
      )}

      {/* Step: Edit */}
      {step === "edit" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <OrderEditor
              title="採購單資料"
              data={purchaseData}
              onChange={setPurchaseData}
              accent="bg-blue-500/5"
            />
            <OrderEditor
              title="出貨單資料"
              data={shipmentData}
              onChange={setShipmentData}
              accent="bg-violet-500/5"
            />
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")} className="border-border gap-2">
              <RotateCcw className="h-4 w-4" /> 重新上傳
            </Button>
            <Button
              onClick={handleCompare}
              disabled={compareMutation.isPending}
              className="bg-primary text-primary-foreground gap-2 px-8"
            >
              {compareMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> 比對中...</>
              ) : (
                <><ArrowRight className="h-4 w-4" /> 開始比對</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Result */}
      {step === "result" && comparisonResult && (
        <ComparisonResult
          summary={comparisonResult.summary}
          recordId={comparisonResult.recordId}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
