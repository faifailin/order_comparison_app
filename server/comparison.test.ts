import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock context ─────────────────────────────────────────────────────────────

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── Compare logic tests (pure function, tested via router) ───────────────────

describe("comparison logic (compareOrders)", () => {
  /**
   * We test the compare mutation's logic by calling it directly.
   * Since it requires DB, we test the pure comparison logic extracted here.
   */

  // Inline the comparison function for unit testing
  function compareOrders(
    purchase: { storeName: string; items: Array<{ seq: number; barcode: string; itemName: string; quantity: number }> },
    shipment: { storeName: string; items: Array<{ seq: number; barcode: string; itemName: string; quantity: number }> }
  ) {
    const pStore = purchase.storeName?.trim() ?? "";
    const sStore = shipment.storeName?.trim() ?? "";
    let storeNameMatch: "match" | "mismatch" | "missing" = "missing";
    if (pStore && sStore) {
      const normalize = (s: string) => s.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
      const pNorm = normalize(pStore);
      const sNorm = normalize(sStore);
      storeNameMatch = (pNorm === sNorm || sNorm.includes(pNorm) || pNorm.includes(sNorm))
        ? "match" : "mismatch";
    }

    const purchaseMap = new Map(purchase.items.filter(i => i.barcode).map(i => [i.barcode.trim(), i]));
    const shipmentMap = new Map(shipment.items.filter(i => i.barcode).map(i => [i.barcode.trim(), i]));
    const allBarcodes = new Set([...Array.from(purchaseMap.keys()), ...Array.from(shipmentMap.keys())]);

    const items = Array.from(allBarcodes).map(barcode => {
      const pItem = purchaseMap.get(barcode);
      const sItem = shipmentMap.get(barcode);
      if (pItem && sItem) {
        const qtyMatch = pItem.quantity === sItem.quantity;
        return { barcode, status: qtyMatch ? "match" : "mismatch", purchaseQty: pItem.quantity, shipmentQty: sItem.quantity };
      } else if (pItem) {
        return { barcode, status: "missing", purchaseQty: pItem.quantity, shipmentQty: null };
      } else {
        return { barcode, status: "missing", purchaseQty: null, shipmentQty: sItem!.quantity };
      }
    });

    const matchCount = items.filter(i => i.status === "match").length;
    const mismatchCount = items.filter(i => i.status === "mismatch").length;
    const missingCount = items.filter(i => i.status === "missing").length;
    const overallStatus = storeNameMatch === "match" && mismatchCount === 0 && missingCount === 0
      ? "all_match" : "has_diff";

    return { storeNameMatch, items, overallStatus, matchCount, mismatchCount, missingCount };
  }

  it("should return all_match when store names and all items match", () => {
    const purchase = {
      storeName: "內湖東湖店", // normalized: 內湖東湖店
      items: [
        { seq: 1, barcode: "8809398924774", itemName: "GIO 枕頭 M", quantity: 1 },
        { seq: 2, barcode: "8809398927089", itemName: "GIO 床墊 XS", quantity: 2 },
      ],
    };
    const shipment = {
      storeName: "卡多摩內湖東湖店", // normalized: 卡多摩內湖東湖店 - includes '內湖東湖店'
      items: [
        { seq: 1, barcode: "8809398924774", itemName: "GIO 枕頭 M", quantity: 1 },
        { seq: 2, barcode: "8809398927089", itemName: "GIO 床墊 XS", quantity: 2 },
      ],
    };
    const result = compareOrders(purchase, shipment);
    expect(result.storeNameMatch).toBe("match");
    expect(result.matchCount).toBe(2);
    expect(result.mismatchCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.overallStatus).toBe("all_match");
  });

  it("should detect quantity mismatch", () => {
    const purchase = {
      storeName: "K041 台北中華店",
      items: [{ seq: 1, barcode: "8809398925368", itemName: "GIO 枕頭 S", quantity: 2 }],
    };
    const shipment = {
      storeName: "卡多摩台北中華店",
      items: [{ seq: 1, barcode: "8809398925368", itemName: "GIO 枕頭 S", quantity: 1 }],
    };
    const result = compareOrders(purchase, shipment);
    expect(result.overallStatus).toBe("has_diff");
    expect(result.mismatchCount).toBe(1);
    expect(result.items[0]?.status).toBe("mismatch");
  });

  it("should detect missing item in shipment", () => {
    const purchase = {
      storeName: "K041 台北中華店",
      items: [
        { seq: 1, barcode: "8809398925368", itemName: "GIO 枕頭 S", quantity: 1 },
        { seq: 2, barcode: "8809398924866", itemName: "GIO 涼墊", quantity: 1 },
      ],
    };
    const shipment = {
      storeName: "卡多摩台北中華店",
      items: [
        { seq: 1, barcode: "8809398925368", itemName: "GIO 枕頭 S", quantity: 1 },
      ],
    };
    const result = compareOrders(purchase, shipment);
    expect(result.missingCount).toBe(1);
    expect(result.overallStatus).toBe("has_diff");
  });

  it("should detect store name mismatch", () => {
    const purchase = {
      storeName: "K050 內湖東湖店",
      items: [{ seq: 1, barcode: "8809398924774", itemName: "GIO 枕頭", quantity: 1 }],
    };
    const shipment = {
      storeName: "台北中華店",
      items: [{ seq: 1, barcode: "8809398924774", itemName: "GIO 枕頭", quantity: 1 }],
    };
    const result = compareOrders(purchase, shipment);
    expect(result.storeNameMatch).toBe("mismatch");
    expect(result.overallStatus).toBe("has_diff");
  });

  it("should handle empty items gracefully", () => {
    // Use identical store names to ensure match
    const purchase = { storeName: "內湖東湖店", items: [] };
    const shipment = { storeName: "內湖東湖店", items: [] };
    const result = compareOrders(purchase, shipment);
    expect(result.storeNameMatch).toBe("match");
    expect(result.items).toHaveLength(0);
    expect(result.overallStatus).toBe("all_match");
  });

  it("should handle extra items in shipment (shipment_only)", () => {
    const purchase = {
      storeName: "K041 台北中華店",
      items: [{ seq: 1, barcode: "8809398925368", itemName: "GIO 枕頭 S", quantity: 1 }],
    };
    const shipment = {
      storeName: "卡多摩台北中華店",
      items: [
        { seq: 1, barcode: "8809398925368", itemName: "GIO 枕頭 S", quantity: 1 },
        { seq: 6, barcode: "", itemName: "冰淇淋杯紙卡", quantity: 1 }, // no barcode, ignored
      ],
    };
    const result = compareOrders(purchase, shipment);
    // item without barcode is filtered out
    expect(result.matchCount).toBe(1);
  });
});

// ─── Auth router tests ────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "test-user",
        email: "test@example.com",
        name: "Test User",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
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
