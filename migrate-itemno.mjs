import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await conn.execute("ALTER TABLE `order_items` ADD `itemNo` varchar(64)");
  console.log("✅ Migration done: added itemNo column");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("ℹ️  Column itemNo already exists, skipping.");
  } else {
    console.error("❌ Migration failed:", e.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
