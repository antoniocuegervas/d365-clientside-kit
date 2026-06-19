/**
 * Minimal pub/sub primitive for host-owned values.
 *
 * Ownership contract: the HOST (ViewModel, smart control, PCF root) creates
 * Observables and writes to them. Presentational controls only subscribe and
 * re-render, they never own or mirror these values into React state.
 */

export type Unsubscribe = () => void;

/**
 * Freezes object/array values in non-production builds so an accidental
 * in-place mutation (for example `obs.value.push(x)`) throws at the mutation
 * site instead of silently no-op'ing past the Object.is guard. Webpack's mode
 * replaces `process.env.NODE_ENV`, so the whole branch is dropped from
 * production bundles, leaving a pass-through. Shallow by design: it catches the
 * common array/object edits without the cost of a deep walk.
 */
function freezeInDev<T>(value: T): T {
  if (process.env.NODE_ENV !== "production" && value !== null && typeof value === "object") {
    Object.freeze(value);
  }
  return value;
}

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
   * identical (Object.is). Observable values are immutable snapshots: to change
   * part of a list or object, assign a new reference or use {@link update}, do
   * not mutate the held value in place (that slips past the Object.is guard).
   */
  setValue(next: T): void {
    if (Object.is(next, this._value)) {
      return;
    }
    const previous = this._value;
    this._value = freezeInDev(next);
    // Copy before iterating: a callback may unsubscribe (or subscribe) mid-notify.
    for (const listener of [...this.listeners]) {
      listener(this._value, previous);
    }
  }

  /**
   * Derives the next value from the current one and assigns it, the safe way to
   * change part of a list or object: `list.update(rows => [...rows, row])`.
   * Returning a new reference keeps the Object.is guard meaningful and avoids
   * the silent no-op an in-place edit would cause.
   */
  update(fn: (current: T) => T): void {
    this.setValue(fn(this._value));
  }

  /**
   * Notifies subscribers without changing the reference, a low-level escape
   * hatch for the rare value you deliberately keep mutable and edit in place.
   * Prefer {@link update} or assigning a new value: those stay compatible with
   * the dev-build freeze, this does not (an assigned value is frozen).
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
