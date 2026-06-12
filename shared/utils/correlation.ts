/**
 * Guid generation for correlation ids and $batch boundaries.
 */

export function newGuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback v4 generator for hosts without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Boundary token for multipart $batch requests, e.g. "batch_<guid>". */
export function newBatchBoundary(): string {
  return `batch_${newGuid()}`;
}
