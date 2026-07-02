import type { ISubscribable, Unsubscribe } from "./Observable";

/**
 * Fire-and-forget event channel, refresh commands, toolbar clicks,
 * "record saved" pings. Carries a payload but holds no current value.
 */
export class ObservableEvent<TPayload = void> implements ISubscribable {
  private readonly listeners = new Set<(payload: TPayload) => void>();

  subscribe(callback: (payload: TPayload) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  publish(payload: TPayload): void {
    // Each call is isolated: one throwing subscriber must not starve the rest
    // of an event they are owed, nor blow up the publisher.
    for (const listener of [...this.listeners]) {
      try {
        listener(payload);
      } catch (error) {
        console.error("ObservableEvent subscriber threw", error);
      }
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}
