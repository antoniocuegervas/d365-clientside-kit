import { Observable, isObservable, valueOf } from "../../../../shared/reactivity/Observable";
import { ObservableEvent } from "../../../../shared/reactivity/ObservableEvent";
import { SubscriptionTracker } from "../../../../shared/reactivity/SubscriptionTracker";

describe("Observable", () => {
  it("holds and returns its value", () => {
    const obs = new Observable<number>(5);
    expect(obs.value).toBe(5);
  });

  it("notifies subscribers with new and old value", () => {
    const obs = new Observable<string>("a");
    const seen: Array<[string, string]> = [];
    obs.subscribe((next, prev) => seen.push([next, prev]));
    obs.value = "b";
    expect(seen).toEqual([["b", "a"]]);
  });

  it("does not notify when value is identical (Object.is)", () => {
    const obs = new Observable<number>(1);
    const cb = jest.fn();
    obs.subscribe(cb);
    obs.value = 1;
    expect(cb).not.toHaveBeenCalled();
  });

  it("notify() forces notification after in-place mutation", () => {
    const rows: string[] = [];
    const obs = new Observable<string[]>(rows);
    const cb = jest.fn();
    obs.subscribe(cb);
    rows.push("x");
    obs.notify();
    expect(cb).toHaveBeenCalledWith(rows, rows);
  });

  it("unsubscribe stops notifications", () => {
    const obs = new Observable<number>(0);
    const cb = jest.fn();
    const unsubscribe = obs.subscribe(cb);
    unsubscribe();
    obs.value = 1;
    expect(cb).not.toHaveBeenCalled();
    expect(obs.subscriberCount).toBe(0);
  });

  it("supports immediate option on subscribe", () => {
    const obs = new Observable<number>(7);
    const cb = jest.fn();
    obs.subscribe(cb, { immediate: true });
    expect(cb).toHaveBeenCalledWith(7, 7);
  });

  it("a subscriber unsubscribing mid-notify does not break iteration", () => {
    const obs = new Observable<number>(0);
    const calls: string[] = [];
    const unsubA = obs.subscribe(() => {
      calls.push("a");
      unsubA();
    });
    obs.subscribe(() => calls.push("b"));
    obs.value = 1;
    expect(calls).toEqual(["a", "b"]);
    obs.value = 2;
    expect(calls).toEqual(["a", "b", "b"]);
  });

  it("isObservable / valueOf unwrap OrObservable props", () => {
    const obs = new Observable<string>("live");
    expect(isObservable(obs)).toBe(true);
    expect(isObservable("static")).toBe(false);
    expect(valueOf(obs)).toBe("live");
    expect(valueOf("static")).toBe("static");
  });
});

describe("ObservableEvent", () => {
  it("publishes payloads to subscribers", () => {
    const event = new ObservableEvent<number>();
    const cb = jest.fn();
    event.subscribe(cb);
    event.publish(42);
    expect(cb).toHaveBeenCalledWith(42);
  });

  it("unsubscribes cleanly", () => {
    const event = new ObservableEvent();
    const cb = jest.fn();
    const unsubscribe = event.subscribe(cb);
    unsubscribe();
    event.publish();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("SubscriptionTracker", () => {
  it("disposes all registered subscriptions once", () => {
    const tracker = new SubscriptionTracker();
    const a = jest.fn();
    const b = jest.fn();
    tracker.add(a, b);
    tracker.dispose();
    tracker.dispose();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(tracker.isDisposed).toBe(true);
  });

  it("releases subscriptions added after dispose immediately", () => {
    const tracker = new SubscriptionTracker();
    tracker.dispose();
    const late = jest.fn();
    tracker.add(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("isDisposed guards the async-callback pattern", () => {
    const tracker = new SubscriptionTracker();
    const target = new Observable<string>("initial");
    const apply = (value: string) => {
      if (!tracker.isDisposed) {
        target.value = value;
      }
    };
    apply("loaded");
    expect(target.value).toBe("loaded");
    tracker.dispose();
    apply("after-dispose");
    expect(target.value).toBe("loaded");
  });
});
