import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock context ─────────────────────────────────────────────────────────────

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Pure comparison logic (replicated from routers.ts for unit testing) ──────

function getMatchKey(item: { barcode: string; itemNo: string }): { key: string; type: "barcode" | "itemNo" } | null {
  const barcode = item.barcode?.trim();
  if (barcode) return { key: barcode, type: "barcode" };
  const itemNo = item.itemNo?.trim();
  if (itemNo) return { key: itemNo, type: "itemNo" };
  return null;
}

type TestItem = { seq: number; itemNo: string; barcode: string; itemName: string; quantity: number };
type TestOrder = { storeName: string; items: TestItem[] };

function compareOrders(purchase: TestOrder, shipment: TestOrder) {
  const pStore = purchase.storeName?.trim() ?? "";
  const sStore = shipment.storeName?.trim() ?? "";
  let storeNameMatch: "match" | "mismatch" | "missing" = "missing";
  if (pStore && sStore) {
    const normalize = (s: string) => s.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
    const pNorm = normalize(pStore);
    const sNorm = normalize(sStore);
    storeNameMatch = (pNorm === sNorm || sNorm.includes(pNorm) || pNorm.includes(sNorm)) ? "match" : "mismatch";
  }

  const purchaseMap = new Map<string, { item: TestItem; keyType: "barcode" | "itemNo" }>();
  const shipmentMap = new Map<string, { item: TestItem; keyType: "barcode" | "itemNo" }>();
  for (const item of purchase.items) {
    const mk = getMatchKey(item);
    if (mk) purchaseMap.set(mk.key, { item, keyType: mk.type });
  }
  for (const item of shipment.items) {
    const mk = getMatchKey(item);
    if (mk) shipmentMap.set(mk.key, { item, keyType: mk.type });
  }

  const allKeys = new Set([...Array.from(purchaseMap.keys()), ...Array.from(shipmentMap.keys())]);
  const items: Array<{
    matchKey: string; matchKeyType: "barcode" | "itemNo";
    status: "match" | "mismatch" | "missing";
    purchaseQty: number | null; shipmentQty: number | null;
    source?: "purchase_only" | "shipment_only" | "both";
  }> = [];

  for (const key of Array.from(allKeys)) {
    const pEntry = purchaseMap.get(key);
    const sEntry = shipmentMap.get(key);
    const keyType = pEntry?.keyType ?? sEntry?.keyType ?? "barcode";
    if (pEntry && sEntry) {
      const qtyMatch = pEntry.item.quantity === sEntry.item.quantity;
      items.push({ matchKey: key, matchKeyType: keyType, status: qtyMatch ? "match" : "mismatch",
        purchaseQty: pEntry.item.quantity, shipmentQty: sEntry.item.quantity, source: "both" });
    } else if (pEntry) {
      items.push({ matchKey: key, matchKeyType: keyType, status: "missing",
        purchaseQty: pEntry.item.quantity, shipmentQty: null, source: "purchase_only" });
    } else if (sEntry) {
      items.push({ matchKey: key, matchKeyType: keyType, status: "missing",
        purchaseQty: null, shipmentQty: sEntry.item.quantity, source: "shipment_only" });
    }
  }

  const matchCount = items.filter(i => i.status === "match").length;
  const mismatchCount = items.filter(i => i.status === "mismatch").length;
  const missingCount = items.filter(i => i.status === "missing").length;
  const overallStatus = storeNameMatch === "match" && mismatchCount === 0 && missingCount === 0 ? "all_match" : "has_diff";

  return { storeNameMatch, items, overallStatus, matchCount, mismatchCount, missingCount };
}

// ─── Store name comparison tests ──────────────────────────────────────────────

describe("compareOrders - store name", () => {
  it("matches when store names are identical", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [] },
      { storeName: "內湖東湖店", items: [] }
    );
    expect(result.storeNameMatch).toBe("match");
    expect(result.overallStatus).toBe("all_match");
  });

  it("matches when shipment name contains purchase name (abbreviated)", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [] },
      { storeName: "台灣卡多摩嬰童館-卡多摩內湖東湖店", items: [] }
    );
    expect(result.storeNameMatch).toBe("match");
  });

  it("mismatches when store names are different", () => {
    const result = compareOrders(
      { storeName: "台北中華店", items: [] },
      { storeName: "內湖東湖店", items: [] }
    );
    expect(result.storeNameMatch).toBe("mismatch");
  });

  it("returns missing when either store name is empty", () => {
    const result = compareOrders(
      { storeName: "", items: [] },
      { storeName: "內湖東湖店", items: [] }
    );
    expect(result.storeNameMatch).toBe("missing");
  });
});

// ─── Barcode-based comparison tests ──────────────────────────────────────────

describe("compareOrders - barcode matching", () => {
  it("matches items with same barcode and same quantity", () => {
    const item: TestItem = { seq: 1, itemNo: "GPSS-0351", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 2 };
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [item] },
      { storeName: "內湖東湖店", items: [{ ...item }] }
    );
    expect(result.items[0]?.status).toBe("match");
    expect(result.items[0]?.matchKeyType).toBe("barcode");
    expect(result.overallStatus).toBe("all_match");
  });

  it("flags mismatch when quantities differ", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 2 }] },
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 1 }] }
    );
    expect(result.items[0]?.status).toBe("mismatch");
    expect(result.mismatchCount).toBe(1);
  });

  it("flags missing when item only in purchase", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 1 }] },
      { storeName: "內湖東湖店", items: [] }
    );
    expect(result.items[0]?.status).toBe("missing");
    expect(result.items[0]?.source).toBe("purchase_only");
  });

  it("flags missing when item only in shipment", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [] },
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 1 }] }
    );
    expect(result.items[0]?.status).toBe("missing");
    expect(result.items[0]?.source).toBe("shipment_only");
  });

  it("handles empty items gracefully", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [] },
      { storeName: "內湖東湖店", items: [] }
    );
    expect(result.items).toHaveLength(0);
    expect(result.overallStatus).toBe("all_match");
  });
});

// ─── ItemNo fallback comparison tests ────────────────────────────────────────

describe("compareOrders - itemNo fallback matching (無條碼改用貨號)", () => {
  it("uses itemNo when barcode is empty", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "GPSS-0351", barcode: "", itemName: "GIO Pillow S", quantity: 1 }] },
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "GPSS-0351", barcode: "", itemName: "GIO Pillow S", quantity: 1 }] }
    );
    expect(result.items[0]?.matchKeyType).toBe("itemNo");
    expect(result.items[0]?.status).toBe("match");
    expect(result.overallStatus).toBe("all_match");
  });

  it("prefers barcode over itemNo when both exist", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "GPSS-0351", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 1 }] },
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "GPSS-0351", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 1 }] }
    );
    expect(result.items[0]?.matchKeyType).toBe("barcode");
  });

  it("detects mismatch via itemNo when quantities differ", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "GPSS-0351", barcode: "", itemName: "GIO Pillow S", quantity: 2 }] },
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "GPSS-0351", barcode: "", itemName: "GIO Pillow S", quantity: 1 }] }
    );
    expect(result.items[0]?.matchKeyType).toBe("itemNo");
    expect(result.items[0]?.status).toBe("mismatch");
    expect(result.mismatchCount).toBe(1);
  });

  it("treats items with no barcode AND no itemNo as unmatched (skipped)", () => {
    const result = compareOrders(
      { storeName: "內湖東湖店", items: [{ seq: 1, itemNo: "", barcode: "", itemName: "Unknown", quantity: 1 }] },
      { storeName: "內湖東湖店", items: [] }
    );
    // Items with no key are skipped from comparison
    expect(result.items).toHaveLength(0);
  });

  it("real-world: extra shipment item with no barcode/itemNo is ignored", () => {
    const result = compareOrders(
      { storeName: "台北中華店", items: [
        { seq: 1, itemNo: "", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 1 },
      ]},
      { storeName: "台北中華店", items: [
        { seq: 1, itemNo: "", barcode: "8809398925368", itemName: "GIO Pillow S", quantity: 1 },
        { seq: 6, itemNo: "", barcode: "", itemName: "冰淇淋杯紙卡", quantity: 1 }, // no key, ignored
      ]}
    );
    expect(result.matchCount).toBe(1);
    expect(result.missingCount).toBe(0);
    expect(result.overallStatus).toBe("all_match");
  });
});

// ─── Auth router tests ────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
    const ctx: TrpcContext = {
      user: {
        id: 1, openId: "test-user", email: "test@example.com",
        name: "Test User", loginMethod: "manus", role: "user",
        createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies).toHaveLength(1);
  });
});
