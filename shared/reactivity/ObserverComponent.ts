import * as React from "react";
import { isObservable, type ISubscribable, type OrObservable, type Unsubscribe } from "./Observable";

/**
 * Base class for controls that render host-owned Observables.
 *
 * Subclasses call `this.observe(...)` once (constructor or componentDidMount)
 * with every Observable/ObservableEvent they render from. The base class
 * re-renders on change and tears everything down on unmount, the safety
 * rules are enforced by structure, not memory.
 *
 * Contract notes:
 * - Observable props are usually identity-stable for the component's lifetime
 *   (hosts own them; they don't get recreated per render). A control that can be
 *   reused at the same tree position with a DIFFERENT bound Observable (e.g. a
 *   field whose `value` prop changes) calls `reobserve(...)` from
 *   componentDidUpdate to re-subscribe, so it never keeps listening to the old
 *   one. SmartFieldBase does this for you.
 * - A subclass that defines its own componentWillUnmount MUST call
 *   `super.componentWillUnmount()`.
 */
export abstract class ObserverComponent<P = object, S = object> extends React.Component<P, S> {
  private observerSubscriptions: Unsubscribe[] = [];
  private observerDisposed = false;

  /** True once the component has unmounted, guard async callbacks with this. */
  protected get isDisposed(): boolean {
    return this.observerDisposed;
  }

  /**
   * Subscribes this component to the given sources and re-renders on change.
   * Plain values (non-observables) and undefined are accepted and skipped, so
   * `OrObservable<T>` props can be passed straight through.
   */
  protected observe(...sources: Array<OrObservable<unknown> | ISubscribable | undefined | null>): void {
    for (const source of sources) {
      if (!source || typeof source !== "object") {
        continue;
      }
      const subscribable = isObservable(source as OrObservable<unknown>)
        ? (source as ISubscribable)
        : typeof (source as ISubscribable).subscribe === "function"
          ? (source as ISubscribable)
          : undefined;
      if (!subscribable) {
        continue;
      }
      const unsubscribe = subscribable.subscribe(() => {
        if (!this.observerDisposed) {
          this.forceUpdate();
        }
      });
      this.observerSubscriptions.push(unsubscribe);
    }
  }

  /**
   * Drops the current subscriptions and subscribes to a fresh set, for a
   * component reused at the same tree position whose Observable props changed
   * identity. Call from componentDidUpdate with the component's full source set.
   * Plain controls that bind stable props never need this.
   */
  protected reobserve(
    ...sources: Array<OrObservable<unknown> | ISubscribable | undefined | null>
  ): void {
    for (const unsubscribe of this.observerSubscriptions) {
      unsubscribe();
    }
    this.observerSubscriptions = [];
    this.observe(...sources);
  }

  override componentWillUnmount(): void {
    this.observerDisposed = true;
    for (const unsubscribe of this.observerSubscriptions) {
      unsubscribe();
    }
    this.observerSubscriptions = [];
  }
}
