export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "LOCKED"
  | "BAD_REQUEST";

/** Expected, user-presentable failure. Anything else is treated as an internal error and never shown verbatim. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "You don't have permission to do that.") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Record") => new AppError("NOT_FOUND", `${what} not found.`);
