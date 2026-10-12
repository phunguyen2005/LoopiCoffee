export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("Máy chủ trả về dữ liệu không hợp lệ.", response.status);
  }
  if (!response.ok) {
    const error = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new ApiError(
      typeof error.error === "string" ? error.error : "Không thể hoàn tất yêu cầu.",
      response.status,
      typeof error.code === "string" ? error.code : undefined,
    );
  }
  return payload as T;
}
