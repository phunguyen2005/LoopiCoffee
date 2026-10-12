import { ApplicationError } from "./errors.ts";

type FieldType = "string" | "number" | "boolean" | "money";

export async function readObject(request: Request, fields: Record<string, FieldType> = {}) {
  let body: unknown;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65_536) {
          await reader.cancel();
          throw new ApplicationError("Nội dung yêu cầu quá lớn.", 413, "body_too_large");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch {
    throw new ApplicationError("Nội dung yêu cầu phải là JSON hợp lệ.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApplicationError("Nội dung yêu cầu phải là một đối tượng.");
  }
  const record = body as Record<string, unknown>;
  for (const [key, type] of Object.entries(fields)) {
    const value = record[key];
    if (value === undefined) continue;
    const valid = type === "money"
      ? typeof value === "number" || typeof value === "string"
      : typeof value === type;
    if (!valid || (typeof value === "number" && !Number.isFinite(value))) {
      throw new ApplicationError(`Trường ${key} không hợp lệ.`);
    }
  }
  return record;
}
