export class ClearCacheUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClearCacheUsageError";
  }
}
