import * as React from "react";
import { isObservable, type ISubscribable, type OrObservable, type Unsubscribe } from "./Observable";

/**
 * Base class for controls that render host-owned Observables.
 *
 * Subclasses call `this.observe(...)` once (constructor or componentDidMount)
 * with every Observable/ObservableEvent they render from. The base class
 * re-renders on change and tears everything down on unmount, the section 4.3 safety
 * rules are enforced by structure, not memory.
 *
 * Contract notes:
 * - Observable props must be identity-stable for the component's lifetime
 *   (hosts own them; they don't get recreated per render).
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

  override componentWillUnmount(): void {
    this.observerDisposed = true;
    for (const unsubscribe of this.observerSubscriptions) {
      unsubscribe();
    }
    this.observerSubscriptions = [];
  }
}
