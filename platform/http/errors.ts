export class ApplicationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string | number | boolean>;

  constructor(
    message: string,
    status = 400,
    code = "invalid_request",
    details?: Record<string, string | number | boolean>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiHandler<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      const response = await handler(...args);
      if (!response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", "private, no-store");
      }
      return response;
    } catch (error) {
      if (error instanceof ApplicationError) {
        return Response.json(
          { error: error.message, code: error.code, ...error.details },
          { status: error.status, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      const requestId = crypto.randomUUID();
      // Do not log request bodies, tokens, or database error text containing PII.
      console.error(JSON.stringify({ event: "request.failed", requestId, errorType: error instanceof Error ? error.name : "unknown", errorMessage: error instanceof Error ? error.message : String(error) }));
      return Response.json(
        { error: "Không thể hoàn tất yêu cầu. Vui lòng thử lại.", requestId },
        { status: 500, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  };
}
