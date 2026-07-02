import { Observable, type ISubscribable, type ObservableCallback, type Unsubscribe } from "./Observable";

/**
 * In development builds, locks the list and each item in it so an accidental
 * edit (like `rows.value[0].selected = true`) throws right where you wrote it,
 * instead of quietly doing nothing and leaving the grid showing old data. A
 * plain Observable only locks the list itself, not the items inside it, which is
 * why that kind of edit slips through unnoticed. Shipped builds skip this
 * entirely: webpack strips the whole block out, so it costs nothing in
 * production. It locks one level deep (the list and its items), not deeper, to
 * keep it cheap on big grids.
 */
function freezeArrayInDev<T>(value: readonly T[]): readonly T[] {
  if (process.env.NODE_ENV !== "production") {
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        Object.freeze(item);
      }
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * An Observable for a list, the kind a grid or list view shows. Use it for a
 * list the host owns (a ViewModel, a smart control, a PCF root): the host fills
 * and changes it, the controls read it and re-render.
 *
 * Why it exists. A plain `Observable<string[]>` only re-renders the view when
 * you hand it a whole new list. If you reach in and change one item in place,
 * like `rows.value[0].selected = true`, nothing happens: the view does not
 * refresh, and in development it does not even warn you. That is an easy mistake
 * with grid rows. This class avoids it: change the list through its methods
 * (`push`, `removeAt`, `updateAt`, and so on) and the view always refreshes, and
 * in development an accidental in-place edit throws instead of going unnoticed.
 *
 * Read the list with `value`, and treat what you get back as read-only: do not
 * edit it directly, change it through the methods. You can pass it to
 * `observe(...)` and a SubscriptionTracker just like an Observable.
 */
export class ObservableArray<T> implements ISubscribable {
  private _value: readonly T[];
  private readonly listeners = new Set<ObservableCallback<readonly T[]>>();

  constructor(initial: readonly T[] = []) {
    this._value = freezeArrayInDev(initial.slice());
  }

  /** The current list. Read-only: change it through the methods, not by editing this. */
  get value(): readonly T[] {
    return this._value;
  }

  get length(): number {
    return this._value.length;
  }

  set value(next: readonly T[]) {
    this.setValue(next);
  }

  /**
   * Replaces the whole list. Does nothing if you pass back the exact list it
   * already holds; otherwise it stores its own copy and refreshes the view.
   */
  setValue(next: readonly T[]): void {
    if (Object.is(next, this._value)) {
      return;
    }
    this.commit(next.slice());
  }

  /** Builds the next list from the current one and stores it. */
  update(fn: (current: readonly T[]) => readonly T[]): void {
    const next = fn(this._value);
    // Same short-circuit as setValue: an updater returning the list unchanged
    // is a no-op, not a fresh notification (and render) for every subscriber.
    if (Object.is(next, this._value)) {
      return;
    }
    this.commit(next.slice());
  }

  //#region Methods that change the list (each one refreshes the view)

  push(...items: T[]): void {
    if (items.length === 0) {
      return;
    }
    this.commit([...this._value, ...items]);
  }

  pop(): T | undefined {
    if (this._value.length === 0) {
      return undefined;
    }
    const next = this._value.slice();
    const removed = next.pop();
    this.commit(next);
    return removed;
  }

  unshift(...items: T[]): void {
    if (items.length === 0) {
      return;
    }
    this.commit([...items, ...this._value]);
  }

  shift(): T | undefined {
    if (this._value.length === 0) {
      return undefined;
    }
    const next = this._value.slice();
    const removed = next.shift();
    this.commit(next);
    return removed;
  }

  insertAt(index: number, ...items: T[]): void {
    if (items.length === 0) {
      return;
    }
    const next = this._value.slice();
    next.splice(index, 0, ...items);
    this.commit(next);
  }

  removeAt(index: number): T | undefined {
    if (index < 0 || index >= this._value.length) {
      return undefined;
    }
    const next = this._value.slice();
    const [removed] = next.splice(index, 1);
    this.commit(next);
    return removed;
  }

  /** Replaces the item at `index` with a different one. */
  replaceAt(index: number, item: T): void {
    if (index < 0 || index >= this._value.length || Object.is(this._value[index], item)) {
      return;
    }
    const next = this._value.slice();
    next[index] = item;
    this.commit(next);
  }

  /**
   * Changes one item: your function gets the current item and returns the
   * updated version. Return a new object, do not edit the one you are given (in
   * development that throws). Example, marking a row selected:
   * `rows.updateAt(i, row => ({ ...row, selected: true }))`.
   */
  updateAt(index: number, fn: (current: T) => T): void {
    if (index < 0 || index >= this._value.length) {
      return;
    }
    this.replaceAt(index, fn(this._value[index]));
  }

  /**
   * Like `updateAt`, but for every item the test matches, for example clearing
   * selection on all rows at once. Same rule: return a new object, do not edit
   * the one you are given.
   */
  replaceWhere(matches: (item: T, index: number) => boolean, fn: (item: T) => T): void {
    let changed = false;
    const next = this._value.map((item, index) => {
      if (!matches(item, index)) {
        return item;
      }
      const replacement = fn(item);
      if (!Object.is(replacement, item)) {
        changed = true;
      }
      return replacement;
    });
    if (changed) {
      this.commit(next);
    }
  }

  /** Removes every item the test matches, and returns the ones it removed. */
  remove(matches: (item: T, index: number) => boolean): T[] {
    const removed: T[] = [];
    const next: T[] = [];
    this._value.forEach((item, index) => {
      if (matches(item, index)) {
        removed.push(item);
      } else {
        next.push(item);
      }
    });
    if (removed.length > 0) {
      this.commit(next);
    }
    return removed;
  }

  /** Removes the first item that is the same object as `item`. Returns true if it was there. */
  removeItem(item: T): boolean {
    const index = this._value.findIndex((candidate) => Object.is(candidate, item));
    if (index === -1) {
      return false;
    }
    this.removeAt(index);
    return true;
  }

  /** Moves the item at `from` to `to`, sliding the rest along. */
  move(from: number, to: number): void {
    const length = this._value.length;
    if (from < 0 || from >= length || to < 0 || to >= length || from === to) {
      return;
    }
    const next = this._value.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.commit(next);
  }

  /** Sorts into a new list, leaving the current one alone. */
  sort(compare?: (a: T, b: T) => number): void {
    if (this._value.length < 2) {
      return;
    }
    this.commit(this._value.slice().sort(compare));
  }

  /** Reverses into a new list, leaving the current one alone. */
  reverse(): void {
    if (this._value.length < 2) {
      return;
    }
    this.commit(this._value.slice().reverse());
  }

  /** Empties the list (does nothing if it is already empty). */
  clear(): void {
    if (this._value.length === 0) {
      return;
    }
    this.commit([]);
  }

  //#endregion

  /**
   * Starts listening for changes. Returns a function that stops listening: give
   * it to a SubscriptionTracker, or call it when you tear down. Works the same
   * as Observable.subscribe.
   */
  subscribe(
    callback: ObservableCallback<readonly T[]>,
    options?: { immediate?: boolean }
  ): Unsubscribe {
    this.listeners.add(callback);
    if (options?.immediate) {
      callback(this._value, this._value);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  /** How many listeners are attached. Used by tests to check none were left behind. */
  get subscriberCount(): number {
    return this.listeners.size;
  }

  private commit(next: readonly T[]): void {
    const previous = this._value;
    this._value = freezeArrayInDev(next);
    // Copy the listeners first: one of them might add or remove a listener while
    // we are still looping over them. Each call is isolated: the list is already
    // committed, so one throwing subscriber must not starve the rest.
    for (const listener of [...this.listeners]) {
      try {
        listener(this._value, previous);
      } catch (error) {
        console.error("ObservableArray subscriber threw", error);
      }
    }
  }
}

/**
 * A list prop a control can take three ways: a plain array (a fixed list, handy
 * for stories), an `Observable` of an array (the existing reactive list), or an
 * `ObservableArray` (the reactive list with safe per-item changes). Use it for
 * the list props a host might fill with an `ObservableArray`, grid rows being
 * the case that matters.
 */
export type OrObservableList<T> = readonly T[] | Observable<T[]> | ObservableArray<T>;

/** Reads the current array out of an {@link OrObservableList}, whichever of the three it holds. */
export function valueOfList<T>(source: OrObservableList<T>): readonly T[] {
  if (source instanceof ObservableArray) {
    return source.value;
  }
  if (source instanceof Observable) {
    return source.value;
  }
  return source;
}
