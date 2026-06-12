import type { Unsubscribe } from "./Observable";

/**
 * Collects unsubscribe functions so teardown is one call.
 *
 * ViewModels hold one tracker, add every subscription to it, and call
 * `dispose()` from the app/PCF teardown path. After dispose, `isDisposed`
 * guards async callbacks from touching dead state:
 *
 *   const rows = await context.webAPI.retrieveMultipleRecords(...);
 *   if (this.tracker.isDisposed) return;   // host already gone
 *   this.gridRows.value = rows;
 */
export class SubscriptionTracker {
  private subscriptions: Unsubscribe[] = [];
  private disposed = false;

  /** Registers one or more unsubscribe functions for later disposal. */
  add(...unsubscribes: Unsubscribe[]): void {
    if (this.disposed) {
      // Late registration after dispose: release immediately.
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      return;
    }
    this.subscriptions.push(...unsubscribes);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Unsubscribes everything and flips the disposed flag. Idempotent. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
  }
}
