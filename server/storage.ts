import fs from "fs/promises";
import path from "path";
import { ENV } from "./_core/env";

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const filePath = path.join(path.resolve(ENV.storageDir), relKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  const url = `/uploads/${relKey.replace(/\\/g, "/")}`;
  return { key: relKey, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return { key: relKey, url: `/uploads/${relKey.replace(/\\/g, "/")}` };
}
