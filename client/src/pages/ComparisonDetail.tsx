import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, XCircle, ArrowLeft,
  Calendar, Hash, Store, Image as ImageIcon, ClipboardList, Tag
} from "lucide-react";

interface ComparisonSummary {
  storeNameMatch: "match" | "mismatch" | "missing";
  purchaseStoreName: string;
  shipmentCustomerName: string;
  items: Array<{
    matchKey: string;
    matchKeyType: "barcode" | "itemNo";
    barcode: string;
    itemNo: string;
    itemName: string;
    purchaseQty: number | null;
    shipmentQty: number | null;
    status: "match" | "mismatch" | "missing";
    diffNote: string;
    source?: string;
  }>;
  overallStatus: "all_match" | "has_diff" | "error";
  totalItems: number;
  matchCount: number;
  mismatchCount: number;
  missingCount: number;
}

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

export default function ComparisonDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id ?? "0");

  const { data, isLoading, error } = trpc.comparison.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-card border border-border rounded-xl animate-pulse" />
        <div className="h-64 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-24 gap-4">
        <XCircle className="h-12 w-12 text-destructive/50" />
        <p className="text-sm text-muted-foreground">找不到此比對紀錄</p>
        <Button variant="outline" onClick={() => setLocation("/history")} className="gap-2 border-border">
          <ArrowLeft className="h-4 w-4" /> 返回歷史紀錄
        </Button>
      </div>
    );
  }

  const { record } = data;
  const summary = record.comparisonSummary as ComparisonSummary | null;

  const overallBg = record.overallStatus === "all_match"
    ? "bg-emerald-500/10 border-emerald-500/20"
    : "bg-amber-500/10 border-amber-500/20";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button & header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/history")}
          className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">比對詳情</h1>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(record.createdAt).toLocaleString("zh-TW")}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              ID #{record.id}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setLocation("/")}
          className="bg-primary text-primary-foreground gap-2"
        >
          <ClipboardList className="h-4 w-4" />
          新增比對
        </Button>
      </div>

      {/* Overall status */}
      {summary && (
        <div className={`rounded-xl border p-5 flex items-center gap-4 ${overallBg}`}>
          {record.overallStatus === "all_match"
            ? <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
            : <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0" />
          }
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {record.overallStatus === "all_match" ? "所有品項完全一致" : "發現差異，請確認"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              共 {summary.totalItems} 項 · 一致 {summary.matchCount} · 差異 {summary.mismatchCount} · 缺漏 {summary.missingCount}
            </p>
          </div>
        </div>
      )}

      {/* Order info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400 inline-block"></span>
            採購單
          </h3>
          <div className="space-y-2">
            {record.purchaseOrderNo && (
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-mono text-foreground">{record.purchaseOrderNo}</span>
              </div>
            )}
            {record.purchaseStoreName && (
              <div className="flex items-center gap-2">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">{record.purchaseStoreName}</span>
              </div>
            )}
          </div>
          {record.purchaseImageUrl && (
            <a href={record.purchaseImageUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-primary hover:underline">
              <ImageIcon className="h-3.5 w-3.5" /> 查看原始圖片
            </a>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-400 inline-block"></span>
            出貨單
          </h3>
          <div className="space-y-2">
            {record.shipmentOrderNo && (
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-mono text-foreground">{record.shipmentOrderNo}</span>
              </div>
            )}
            {record.shipmentCustomerName && (
              <div className="flex items-center gap-2">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">{record.shipmentCustomerName}</span>
              </div>
            )}
          </div>
          {record.shipmentImageUrl && (
            <a href={record.shipmentImageUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-primary hover:underline">
              <ImageIcon className="h-3.5 w-3.5" /> 查看原始圖片
            </a>
          )}
        </div>
      </div>

      {/* Store name comparison */}
      {summary && (
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
      )}

      {/* Items comparison table */}
      {summary && (
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
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">貨號</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">條碼</th>
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
                    <td className="px-5 py-3.5 font-mono text-xs">
                      {item.itemNo ? (
                        <span className={item.matchKeyType === "itemNo"
                          ? "text-amber-300 inline-flex items-center gap-1"
                          : "text-muted-foreground"}>
                          {item.matchKeyType === "itemNo" && <Tag className="h-2.5 w-2.5" />}
                          {item.itemNo}
                        </span>
                      ) : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs">
                      {item.barcode ? (
                        <span className={item.matchKeyType === "barcode"
                          ? "text-primary/80"
                          : "text-muted-foreground"}>
                          {item.barcode}
                        </span>
                      ) : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground max-w-48">
                      <span className="line-clamp-2">{item.itemName}</span>
                    </td>
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
      )}
    </div>
  );
}
