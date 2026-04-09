import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 比對紀錄主表
 * 儲存每次採購單 vs 出貨單的比對結果
 */
export const comparisonRecords = mysqlTable("comparison_records", {
  id: int("id").autoincrement().primaryKey(),
  /** 採購單編號 */
  purchaseOrderNo: varchar("purchaseOrderNo", { length: 128 }),
  /** 出貨單編號 */
  shipmentOrderNo: varchar("shipmentOrderNo", { length: 128 }),
  /** 採購單門市名稱 */
  purchaseStoreName: varchar("purchaseStoreName", { length: 256 }),
  /** 出貨單客戶名稱 */
  shipmentCustomerName: varchar("shipmentCustomerName", { length: 256 }),
  /** 門市名稱比對結果 */
  storeNameMatch: mysqlEnum("storeNameMatch", ["match", "mismatch", "missing"]).default("missing"),
  /** 整體比對狀態 */
  overallStatus: mysqlEnum("overallStatus", ["all_match", "has_diff", "error"]).default("has_diff").notNull(),
  /** 採購單圖片 URL */
  purchaseImageUrl: text("purchaseImageUrl"),
  /** 出貨單圖片 URL */
  shipmentImageUrl: text("shipmentImageUrl"),
  /** 採購單原始 OCR JSON */
  purchaseRawData: json("purchaseRawData"),
  /** 出貨單原始 OCR JSON */
  shipmentRawData: json("shipmentRawData"),
  /** 比對結果摘要 JSON */
  comparisonSummary: json("comparisonSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ComparisonRecord = typeof comparisonRecords.$inferSelect;
export type InsertComparisonRecord = typeof comparisonRecords.$inferInsert;

/**
 * 訂單品項明細表
 * 儲存每筆比對紀錄中的品項比對結果
 */
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  comparisonId: int("comparisonId").notNull(),
  /** 品項來源：purchase=採購單, shipment=出貨單 */
  source: mysqlEnum("source", ["purchase", "shipment"]).notNull(),
  /** 序號 */
  seq: int("seq"),
  /** 國際條碼 */
  barcode: varchar("barcode", { length: 64 }),
  /** 品項名稱 */
  itemName: text("itemName"),
  /** 數量 */
  quantity: int("quantity"),
  /** 比對狀態：match=一致, mismatch=差異, missing=缺漏 */
  matchStatus: mysqlEnum("matchStatus", ["match", "mismatch", "missing"]).default("missing"),
  /** 差異說明 */
  diffNote: text("diffNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;
