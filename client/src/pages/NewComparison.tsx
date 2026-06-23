import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, XCircle,
  Plus, Trash2, FileImage, ArrowRight, RotateCcw, Eye, Tag
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  seq: number;
  itemNo: string;   // 貨號
  barcode: string;  // 國際條碼
  itemName: string;
  quantity: number;
}

interface OrderData {
  orderNo: string;
  storeName: string;
  items: OrderItem[];
}

interface ItemComparisonResult {
  matchKey: string;
  matchKeyType: "barcode" | "itemNo";
  barcode: string;
  itemNo: string;
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
  items: [{ seq: 1, itemNo: "", barcode: "", itemName: "", quantity: 1 }],
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
  label, orderType, onExtracted, fileUrl, isLoading
}: {
  label: string;
  orderType: "purchase" | "shipment";
  onExtracted: (data: OrderData, fileUrl: string) => void;
  fileUrl: string | null;
  isLoading: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const extractImageMutation = trpc.comparison.extractFromImage.useMutation();
  const extractExcelMutation = trpc.comparison.extractFromExcel.useMutation();

  const isExcelFile = (file: File) =>
    file.name.endsWith(".xlsx") || file.name.endsWith(".xls") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel";

  const processFile = useCallback(async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error("檔案大小不得超過 20MB"); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        if (isExcelFile(file)) {
          const result = await extractExcelMutation.mutateAsync({
            fileBase64: base64, fileName: file.name, orderType,
          });
          setUploadedFileName(file.name);
          onExtracted(result.orderData as OrderData, result.fileUrl);
          toast.success(`${label} Excel 解析成功`);
        } else if (file.type.startsWith("image/")) {
          const result = await extractImageMutation.mutateAsync({
            imageBase64: base64, mimeType: file.type, orderType,
          });
          setUploadedFileName(null);
          onExtracted(result.orderData as OrderData, result.imageUrl);
          toast.success(`${label} OCR 擷取成功`);
        } else {
          toast.error("請上傳圖片（JPG/PNG）或 Excel 檔案（.xlsx）");
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "解析失敗");
      }
    };
    reader.readAsDataURL(file);
  }, [extractImageMutation, extractExcelMutation, label, onExtracted, orderType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const isProcessing = extractImageMutation.isPending || extractExcelMutation.isPending || isLoading;
  const isExcelUploaded = uploadedFileName !== null && fileUrl !== null;

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden
        ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-white/2"}
        ${fileUrl ? "border-solid border-border/50" : ""}`}
      style={{ minHeight: "180px" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && fileRef.current?.click()}
    >
      <input ref={fileRef} type="file" accept="image/*,.xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />
      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">
            {isExcelUploaded ? "Excel 解析中..." : "AI 正在解析圖片..."}
          </p>
        </div>
      )}
      {fileUrl ? (
        isExcelUploaded ? (
          <div className="flex flex-col items-center justify-center p-8 gap-3">
            <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-emerald-400">Excel 解析完成</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[160px]">{uploadedFileName}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">點擊重新上傳</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <img src={fileUrl} alt={label} className="w-full h-40 object-cover opacity-60" />
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm">
              <FileImage className="h-6 w-6 text-primary mb-2" />
              <p className="text-xs text-muted-foreground">點擊重新上傳</p>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center p-8 gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">圖片（JPG/PNG）或 Excel（.xlsx）</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">拖曳或點擊上傳，AI 自動擷取資訊</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Order Editor ─────────────────────────────────────────────────────────────

function OrderEditor({ title, data, onChange, accent }: {
  title: string; data: OrderData; onChange: (data: OrderData) => void; accent: string;
}) {
  const addItem = () => onChange({
    ...data,
    items: [...data.items, { seq: data.items.length + 1, itemNo: "", barcode: "", itemName: "", quantity: 1 }],
  });

  const removeItem = (idx: number) => onChange({ ...data, items: data.items.filter((_, i) => i !== idx) });

  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    const items = [...data.items];
    items[idx] = { ...items[idx], [field]: value } as OrderItem;
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
            <Input value={data.orderNo} onChange={e => onChange({ ...data, orderNo: e.target.value })}
              placeholder="例：W20260408011" className="h-9 text-sm bg-input border-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">門市／客戶名稱</label>
            <Input value={data.storeName} onChange={e => onChange({ ...data, storeName: e.target.value })}
              placeholder="例：K050 內湖東湖店" className="h-9 text-sm bg-input border-border" />
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div className="space-y-2">
          {/* Header */}
          <div className="grid gap-2 px-1" style={{ gridTemplateColumns: "20px 80px 110px 1fr 44px 24px" }}>
            <span className="text-xs text-muted-foreground">#</span>
            <span className="text-xs text-muted-foreground">貨號</span>
            <span className="text-xs text-muted-foreground">條碼</span>
            <span className="text-xs text-muted-foreground">品項名稱</span>
            <span className="text-xs text-muted-foreground text-center">數量</span>
            <span></span>
          </div>
          {data.items.map((item, idx) => (
            <div key={idx} className="grid gap-2 items-center group" style={{ gridTemplateColumns: "20px 80px 110px 1fr 44px 24px" }}>
              <span className="text-xs text-muted-foreground text-center">{idx + 1}</span>
              <Input value={item.itemNo} onChange={e => updateItem(idx, "itemNo", e.target.value)}
                placeholder="貨號" className="h-8 text-xs bg-input border-border font-mono" />
              <Input value={item.barcode} onChange={e => updateItem(idx, "barcode", e.target.value)}
                placeholder="條碼" className="h-8 text-xs bg-input border-border font-mono" />
              <Input value={item.itemName} onChange={e => updateItem(idx, "itemName", e.target.value)}
                placeholder="品項名稱" className="h-8 text-xs bg-input border-border" />
              <Input type="number" min={0} value={item.quantity}
                onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                className="h-8 text-xs bg-input border-border text-center" />
              <button onClick={() => removeItem(idx)}
                className="h-8 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button onClick={addItem}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-1">
            <Plus className="h-3.5 w-3.5" /> 新增品項
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Comparison Result ────────────────────────────────────────────────────────

function ComparisonResult({ summary, recordId, onReset }: {
  summary: ComparisonSummary; recordId: number; onReset: () => void;
}) {
  const [, navigate] = useLocation();
  const isAllMatch = summary.overallStatus === "all_match";

  return (
    <div className="space-y-5">
      {/* Overall status banner */}
      <div className={`rounded-xl border p-5 ${isAllMatch
        ? "bg-emerald-500/8 border-emerald-500/25"
        : "bg-amber-500/8 border-amber-500/25"}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {isAllMatch
              ? <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              : <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0" />}
            <div>
              <p className={`text-base font-semibold ${isAllMatch ? "text-emerald-400" : "text-amber-400"}`}>
                {isAllMatch ? "兩張訂單完全一致" : "發現差異，請確認"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                共 {summary.totalItems} 項 · 一致 {summary.matchCount} · 差異 {summary.mismatchCount} · 缺漏 {summary.missingCount}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-border gap-1.5 text-xs"
              onClick={() => navigate(`/history/${recordId}`)}>
              <Eye className="h-3.5 w-3.5" /> 查看詳情
            </Button>
            <Button variant="outline" size="sm" className="border-border gap-1.5 text-xs" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" /> 重新比對
            </Button>
          </div>
        </div>
      </div>

      {/* Store name comparison */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">門市名稱比對</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1 rounded-lg bg-blue-500/8 border border-blue-500/20 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">採購單門市</p>
            <p className="text-sm font-medium text-foreground">{summary.purchaseStoreName || "（未填寫）"}</p>
          </div>
          <StatusBadge status={summary.storeNameMatch} />
          <div className="flex-1 rounded-lg bg-violet-500/8 border border-violet-500/20 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">出貨單客戶</p>
            <p className="text-sm font-medium text-foreground">{summary.shipmentCustomerName || "（未填寫）"}</p>
          </div>
        </div>
      </div>

      {/* Items comparison */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">品項比對明細</h3>
        </div>
        <div className="divide-y divide-border/50">
          {summary.items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">無品項資料</div>
          ) : summary.items.map((item, idx) => (
            <div key={idx} className={`px-5 py-3.5 flex items-center gap-4 ${
              item.status === "mismatch" ? "bg-amber-500/4" :
              item.status === "missing" ? "bg-red-500/4" : ""}`}>
              <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                {/* 顯示貨號與條碼，並標示比對依據 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {item.itemNo && (
                    <span className={`inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded ${
                      item.matchKeyType === "itemNo"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-muted-foreground"}`}>
                      {item.matchKeyType === "itemNo" && <Tag className="h-2.5 w-2.5" />}
                      {item.itemNo}
                    </span>
                  )}
                  {item.barcode && (
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      item.matchKeyType === "barcode"
                        ? "bg-primary/15 text-primary/80 border border-primary/20"
                        : "text-muted-foreground"}`}>
                      {item.barcode}
                    </span>
                  )}
                  {item.matchKeyType === "itemNo" && (
                    <span className="text-xs text-amber-400/70">（以貨號比對）</span>
                  )}
                </div>
                <p className="text-sm text-foreground truncate mt-0.5">{item.itemName || "（未知品項）"}</p>
              </div>
              <div className="flex items-center gap-6 shrink-0">
                <div className="text-center w-16">
                  <p className="text-xs text-muted-foreground mb-0.5">採購數量</p>
                  <p className="text-sm font-semibold text-blue-400">
                    {item.purchaseQty !== null ? item.purchaseQty : "—"}
                  </p>
                </div>
                <div className="text-center w-16">
                  <p className="text-xs text-muted-foreground mb-0.5">出貨數量</p>
                  <p className="text-sm font-semibold text-violet-400">
                    {item.shipmentQty !== null ? item.shipmentQty : "—"}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            </div>
          ))}
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
  const [purchaseFileUrl, setPurchaseFileUrl] = useState<string | null>(null);
  const [shipmentFileUrl, setShipmentFileUrl] = useState<string | null>(null);
  const [comparisonResult, setComparisonResult] = useState<{ summary: ComparisonSummary; recordId: number } | null>(null);

  const compareMutation = trpc.comparison.compare.useMutation();

  const handlePurchaseExtracted = (data: OrderData, url: string) => {
    setPurchaseData(data); setPurchaseFileUrl(url); setStep("edit");
  };
  const handleShipmentExtracted = (data: OrderData, url: string) => {
    setShipmentData(data); setShipmentFileUrl(url); setStep("edit");
  };

  const handleCompare = async () => {
    try {
      const result = await compareMutation.mutateAsync({
        purchaseData,
        shipmentData,
        purchaseImageUrl: purchaseFileUrl ?? undefined,
        shipmentImageUrl: shipmentFileUrl ?? undefined,
      });
      setComparisonResult({ summary: result.summary as ComparisonSummary, recordId: result.recordId });
      setStep("result");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "比對失敗");
    }
  };

  const handleReset = () => {
    setPurchaseData(emptyOrder()); setShipmentData(emptyOrder());
    setPurchaseFileUrl(null); setShipmentFileUrl(null);
    setComparisonResult(null); setStep("upload");
  };

  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "上傳圖片" },
    { key: "edit", label: "確認資料" },
    { key: "result", label: "比對結果" },
  ];
  const currentStepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">新增比對</h1>
          <p className="text-sm text-muted-foreground mt-1">上傳採購單與出貨單圖片，AI 自動擷取資訊並比對差異</p>
        </div>
        {step !== "upload" && (
          <Button variant="outline" size="sm" onClick={handleReset} className="border-border gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" /> 重新開始
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 transition-colors ${
              i === currentStepIndex ? "text-primary font-medium" :
              i < currentStepIndex ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                i === currentStepIndex ? "bg-primary text-primary-foreground" :
                i < currentStepIndex ? "bg-muted text-muted-foreground" : "bg-muted/50 text-muted-foreground/40"}`}>
                {i < currentStepIndex ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className={`h-3 w-3 ${i < currentStepIndex ? "text-muted-foreground" : "text-muted-foreground/25"}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-400 inline-block"></span>採購單
              </h3>
              <UploadZone label="上傳採購單" orderType="purchase"
                onExtracted={handlePurchaseExtracted} fileUrl={purchaseFileUrl} isLoading={false} />
              {purchaseFileUrl && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 採購單已擷取
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-violet-400 inline-block"></span>出貨單
              </h3>
              <UploadZone label="上傳出貨單" orderType="shipment"
                onExtracted={handleShipmentExtracted} fileUrl={shipmentFileUrl} isLoading={false} />
              {shipmentFileUrl && (
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
          <Button variant="outline" className="w-full border-border hover:border-primary/50 gap-2"
            onClick={() => setStep("edit")}>
            <Plus className="h-4 w-4" /> 手動輸入訂單資料
          </Button>
        </div>
      )}

      {/* ── Step 2: Edit & Compare ── */}
      {step === "edit" && (
        <div className="space-y-5">
          {/* Supplemental upload if not both uploaded */}
          {(!purchaseFileUrl || !shipmentFileUrl) && (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-3 font-medium">
                {!purchaseFileUrl && !shipmentFileUrl
                  ? "尚未上傳任何檔案，您可以繼續上傳或直接手動填寫資料"
                  : !purchaseFileUrl ? "採購單尚未上傳，可繼續上傳或手動填寫"
                  : "出貨單尚未上傳，可繼續上傳或手動填寫"}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {!purchaseFileUrl && (
                  <div className="space-y-2">
                    <p className="text-xs text-blue-400 font-medium flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 inline-block"></span>採購單
                    </p>
                    <UploadZone label="上傳採購單" orderType="purchase"
                      onExtracted={(data, url) => { setPurchaseData(data as OrderData); setPurchaseFileUrl(url); }}
                      fileUrl={purchaseFileUrl} isLoading={false} />
                  </div>
                )}
                {!shipmentFileUrl && (
                  <div className="space-y-2">
                    <p className="text-xs text-violet-400 font-medium flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-400 inline-block"></span>出貨單
                    </p>
                    <UploadZone label="上傳出貨單" orderType="shipment"
                      onExtracted={(data, url) => { setShipmentData(data as OrderData); setShipmentFileUrl(url); }}
                      fileUrl={shipmentFileUrl} isLoading={false} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order editors */}
          <div className="grid grid-cols-2 gap-5">
            <OrderEditor title="採購單資料" data={purchaseData} onChange={setPurchaseData} accent="bg-blue-500/5" />
            <OrderEditor title="出貨單資料" data={shipmentData} onChange={setShipmentData} accent="bg-violet-500/5" />
          </div>

          {/* Hint */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Tag className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
            比對優先使用條碼；若品項無條碼，則自動改用貨號進行比對
          </div>

          {/* Action buttons */}
          <div className="flex justify-between items-center pt-1">
            <Button variant="outline" onClick={() => setStep("upload")} className="border-border gap-2">
              <RotateCcw className="h-4 w-4" /> 返回上傳
            </Button>
            <Button onClick={handleCompare} disabled={compareMutation.isPending} size="lg"
              className="bg-primary text-primary-foreground gap-2 px-10 font-semibold">
              {compareMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> 比對中...</>
                : <><ArrowRight className="h-4 w-4" /> 開始比對</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === "result" && comparisonResult && (
        <ComparisonResult summary={comparisonResult.summary} recordId={comparisonResult.recordId} onReset={handleReset} />
      )}
    </div>
  );
}
