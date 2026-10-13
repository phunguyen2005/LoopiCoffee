import { ApplicationError } from "./errors.ts";

type FieldType = "string" | "number" | "boolean" | "money";

export const DEFAULT_JSON_MAX_BYTES = 65_536;
export const ATTENDANCE_ACTION_MAX_BYTES = 3_145_728;

export interface ReadObjectOptions {
  maxBytes?: number;
  allowEmpty?: boolean;
}

export async function readObject(
  request: Request,
  fields: Record<string, FieldType> = {},
  options?: ReadObjectOptions | number,
) {
  let body: unknown;
  const maxBytes = typeof options === "number" ? options : (options?.maxBytes ?? DEFAULT_JSON_MAX_BYTES);
  const allowEmpty = typeof options === "object" ? Boolean(options?.allowEmpty) : false;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApplicationError("Nội dung yêu cầu quá lớn.", 413, "body_too_large");
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ApplicationError("Nội dung yêu cầu quá lớn.", 413, "body_too_large");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }

  if (size === 0) {
    if (allowEmpty) return {};
    throw new ApplicationError("Thiếu nội dung yêu cầu.", 400, "missing_body");
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch {
    throw new ApplicationError("Nội dung yêu cầu phải là JSON hợp lệ.", 400, "invalid_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApplicationError("Nội dung yêu cầu phải là một đối tượng.", 400, "invalid_body");
  }
  const record = body as Record<string, unknown>;
  for (const [key, type] of Object.entries(fields)) {
    const value = record[key];
    if (value === undefined) continue;
    const valid = type === "money"
      ? typeof value === "number" || typeof value === "string"
      : typeof value === type;
    if (!valid || (typeof value === "number" && !Number.isFinite(value))) {
      throw new ApplicationError(`Trường ${key} không hợp lệ.`, 400, "invalid_field");
    }
  }
  return record;
}
