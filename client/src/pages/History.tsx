import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, AlertTriangle, XCircle, ClipboardList,
  ChevronRight, Calendar, Hash, Store
} from "lucide-react";

function OverallStatusBadge({ status }: { status: string }) {
  if (status === "all_match") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      <CheckCircle2 className="h-3 w-3" /> 完全一致
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
      <AlertTriangle className="h-3 w-3" /> 有差異
    </span>
  );
}

export default function History() {
  const [, setLocation] = useLocation();
  const { data: records, isLoading } = trpc.comparison.list.useQuery({ limit: 50, offset: 0 });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">歷史紀錄</h1>
          <p className="text-sm text-muted-foreground mt-1">查詢過去的比對紀錄</p>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!records || records.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">歷史紀錄</h1>
          <p className="text-sm text-muted-foreground mt-1">查詢過去的比對紀錄</p>
        </div>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <ClipboardList className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">尚無比對紀錄</p>
            <p className="text-xs text-muted-foreground mt-1">前往「新增比對」開始第一次比對</p>
          </div>
          <Button
            onClick={() => setLocation("/")}
            className="bg-primary text-primary-foreground gap-2 mt-2"
          >
            <ClipboardList className="h-4 w-4" />
            新增比對
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">歷史紀錄</h1>
          <p className="text-sm text-muted-foreground mt-1">共 {records.length} 筆比對紀錄</p>
        </div>
        <Button
          onClick={() => setLocation("/")}
          className="bg-primary text-primary-foreground gap-2"
          size="sm"
        >
          <ClipboardList className="h-4 w-4" />
          新增比對
        </Button>
      </div>

      <div className="space-y-3">
        {records.map((record) => {
          const summary = record.comparisonSummary as {
            totalItems?: number;
            matchCount?: number;
            mismatchCount?: number;
            missingCount?: number;
          } | null;

          return (
            <button
              key={record.id}
              onClick={() => setLocation(`/history/${record.id}`)}
              className="w-full text-left rounded-xl border border-border bg-card hover:bg-card/80 hover:border-primary/30 transition-all duration-200 p-5 group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-3">
                  {/* Status & order numbers */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <OverallStatusBadge status={record.overallStatus} />
                    {record.purchaseOrderNo && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="h-3 w-3" />
                        {record.purchaseOrderNo}
                      </span>
                    )}
                    {record.shipmentOrderNo && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="h-3 w-3" />
                        {record.shipmentOrderNo}
                      </span>
                    )}
                  </div>

                  {/* Store names */}
                  <div className="flex items-center gap-2 text-sm">
                    <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground font-medium truncate">
                      {record.purchaseStoreName || "—"}
                    </span>
                    {record.shipmentCustomerName && record.shipmentCustomerName !== record.purchaseStoreName && (
                      <>
                        <span className="text-muted-foreground/40 text-xs">vs</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {record.shipmentCustomerName}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Stats */}
                  {summary && (
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        一致 {summary.matchCount ?? 0}
                      </span>
                      {(summary.mismatchCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          差異 {summary.mismatchCount}
                        </span>
                      )}
                      {(summary.missingCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <XCircle className="h-3 w-3" />
                          缺漏 {summary.missingCount}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground/50">
                        共 {summary.totalItems ?? 0} 項
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                      <Calendar className="h-3 w-3" />
                      {new Date(record.createdAt).toLocaleDateString("zh-TW", {
                        year: "numeric", month: "2-digit", day: "2-digit"
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {new Date(record.createdAt).toLocaleTimeString("zh-TW", {
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
