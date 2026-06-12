/**
 * Minimal pub/sub primitive for host-owned values.
 *
 * Ownership contract: the HOST (ViewModel, smart control, PCF root) creates
 * Observables and writes to them. Presentational controls only subscribe and
 * re-render, they never own or mirror these values into React state.
 */

export type Unsubscribe = () => void;

export type ObservableCallback<T> = (newValue: T, oldValue: T) => void;

/** Anything a component can subscribe to (Observable or ObservableEvent). */
export interface ISubscribable {
  // Declared as a method (not a property) so implementations with richer
  // callback signatures (newValue/oldValue, payload) stay assignable.
  subscribe(callback: () => void): Unsubscribe;
}

export class Observable<T> implements ISubscribable {
  private _value: T;
  private readonly listeners = new Set<ObservableCallback<T>>();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }

  set value(next: T) {
    this.setValue(next);
  }

  /**
   * Sets the value and notifies subscribers. No-ops when the new value is
   * identical (Object.is), use {@link notify} after in-place mutation.
   */
  setValue(next: T): void {
    if (Object.is(next, this._value)) {
      return;
    }
    const previous = this._value;
    this._value = next;
    // Copy before iterating: a callback may unsubscribe (or subscribe) mid-notify.
    for (const listener of [...this.listeners]) {
      listener(next, previous);
    }
  }

  /**
   * Notifies subscribers without changing the reference, for the rare case
   * where an array/object was mutated in place. Prefer assigning a new value.
   */
  notify(): void {
    for (const listener of [...this.listeners]) {
      listener(this._value, this._value);
    }
  }

  /**
   * Subscribes to value changes. Returns the unsubscribe function, hand it
   * to a SubscriptionTracker or call it in componentWillUnmount/destroy.
   */
  subscribe(callback: ObservableCallback<T>, options?: { immediate?: boolean }): Unsubscribe {
    this.listeners.add(callback);
    if (options?.immediate) {
      callback(this._value, this._value);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  /** Number of active subscriptions, used by tests and leak diagnostics. */
  get subscriberCount(): number {
    return this.listeners.size;
  }
}

/**
 * Convenience type for props that accept either a fixed value or a live
 * Observable. Presentational controls use this so static stories stay simple.
 */
export type OrObservable<T> = T | Observable<T>;

export function isObservable<T>(candidate: OrObservable<T>): candidate is Observable<T> {
  return candidate instanceof Observable;
}

/** Unwraps an OrObservable to its current value. */
export function valueOf<T>(candidate: OrObservable<T>): T {
  return isObservable(candidate) ? candidate.value : candidate;
}
