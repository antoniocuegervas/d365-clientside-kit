import * as React from "react";
import { isObservable, type ISubscribable, type OrObservable, type Unsubscribe } from "./Observable";
import { scheduleRender } from "./RenderBatch";

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
 * - A subclass that needs its own teardown (timers, debounce handles, manually
 *   tracked subscriptions) overrides `onUnmount()`, NOT `componentWillUnmount`.
 *   The base owns `componentWillUnmount`: it disposes the observer
 *   subscriptions, then calls `onUnmount`. There is no `super` call to forget,
 *   so the base teardown can never be skipped by overriding the wrong method.
 */
export abstract class ObserverComponent<P = object, S = object> extends React.Component<P, S> {
  private observerSubscriptions: Unsubscribe[] = [];
  private observerDisposed = false;

  /**
   * The render request handed to the shared queue. One stable instance per
   * component, so a burst of Observable writes collapses into one repaint
   * (see RenderBatch). Checked against disposal again at run time, because
   * the component can unmount between the request and the repaint.
   */
  private readonly runQueuedRender = (): void => {
    if (!this.observerDisposed) {
      this.forceUpdate();
    }
  };

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
    if (this.observerDisposed) {
      // An observe after unmount (an async continuation landing late) would
      // subscribe with nobody left to dispose it, keeping the component alive
      // from the observable's listener set. Mirror SubscriptionTracker.add.
      return;
    }
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
          scheduleRender(this.runQueuedRender);
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
    this.disposeObserverSubscriptions();
    this.observe(...sources);
  }

  override componentWillUnmount(): void {
    this.observerDisposed = true;
    this.disposeObserverSubscriptions();
    this.onUnmount();
  }

  private disposeObserverSubscriptions(): void {
    // Isolate each unsubscribe: one throwing must not leak the rest.
    for (const unsubscribe of this.observerSubscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        console.error("ObserverComponent unsubscribe threw", error);
      }
    }
    this.observerSubscriptions = [];
  }

  /**
   * Teardown hook for subclasses: clear timers, debounce handles, and any
   * manually tracked subscriptions here. Runs after the base has disposed the
   * observer subscriptions. Override this instead of `componentWillUnmount`, so
   * the base teardown can never be skipped.
   */
  protected onUnmount(): void {
    // does nothing by default
  }
}
