/**
 * A tiny publish/subscribe helper for values the host owns.
 *
 * Ownership contract: the HOST (ViewModel, smart control, PCF root) creates
 * Observables and writes to them. Presentational controls only subscribe and
 * re-render, they never own or mirror these values into React state.
 */

export type Unsubscribe = () => void;

/**
 * In development builds, locks object/array values so an accidental edit in
 * place (for example `obs.value.push(x)`) throws right where you wrote it,
 * instead of quietly doing nothing because the value still looks unchanged.
 * Shipped builds skip this: webpack strips the whole block out, so it costs
 * nothing in production. It locks only the top level, which catches the common
 * array/object edits without the cost of looking all the way down.
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
   * Sets the value and tells subscribers. Does nothing when the new value is the
   * same one it already holds. Observable values are meant to be replaced, not
   * edited in place: to change part of a list or object, assign a new value or
   * use {@link update}; editing the held value directly goes unnoticed.
   */
  setValue(next: T): void {
    if (Object.is(next, this._value)) {
      return;
    }
    const previous = this._value;
    const current = freezeInDev(next);
    this._value = current;
    // Copy the listeners first: one of them might add or remove a listener while
    // we are still calling them. Pass the snapshot pair (current/previous) rather
    // than re-reading this._value, so if a listener re-enters setValue the
    // remaining listeners still get THIS change's old/new pair, not a newer value
    // paired with the old previous.
    for (const listener of [...this.listeners]) {
      listener(current, previous);
    }
  }

  /**
   * Builds the next value from the current one and assigns it, the safe way to
   * change part of a list or object: `list.update(rows => [...rows, row])`.
   * Returning a new value is what lets the change be noticed; editing the old
   * one in place would quietly do nothing.
   */
  update(fn: (current: T) => T): void {
    this.setValue(fn(this._value));
  }

  /**
   * Tells subscribers without giving the value a new identity, a low-level
   * option for the rare value you deliberately keep editable and change in
   * place. Prefer {@link update} or assigning a new value: those work with the
   * development lock, this does not (an assigned value is locked).
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
