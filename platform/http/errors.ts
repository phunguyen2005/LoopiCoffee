export class ApplicationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function apiHandler<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApplicationError) {
        return Response.json({ error: error.message, code: error.code }, { status: error.status });
      }
      const requestId = crypto.randomUUID();
      // Do not log request bodies, tokens, or database error text containing PII.
      console.error(JSON.stringify({ event: "request.failed", requestId, errorType: error instanceof Error ? error.name : "unknown" }));
      return Response.json({ error: "Không thể hoàn tất yêu cầu. Vui lòng thử lại.", requestId }, { status: 500 });
    }
  };
}
