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
    for (const listener of [...this.listeners]) {
      listener(payload);
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}
