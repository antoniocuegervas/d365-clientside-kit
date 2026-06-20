import { ObservableArray } from "../../../../shared/reactivity/ObservableArray";

interface Row {
  id: string;
  selected: boolean;
}

describe("ObservableArray", () => {
  it("holds its own copy of the initial contents", () => {
    const source = [1, 2, 3];
    const list = new ObservableArray<number>(source);
    expect(list.value).toEqual([1, 2, 3]);
    expect(list.value).not.toBe(source); // keeps its own copy
    expect(list.length).toBe(3);
  });

  it("defaults to empty", () => {
    expect(new ObservableArray<number>().value).toEqual([]);
  });

  it("notifies with new and old value on push", () => {
    const list = new ObservableArray<number>([1]);
    const seen: Array<[readonly number[], readonly number[]]> = [];
    list.subscribe((next, prev) => seen.push([next, prev]));
    list.push(2);
    expect(seen).toEqual([[[1, 2], [1]]]);
  });

  it("each change makes a new list and leaves the old one alone", () => {
    const list = new ObservableArray<number>([1]);
    const before = list.value;
    list.push(2);
    expect(list.value).not.toBe(before); // a change builds a new list
    expect(before).toEqual([1]); // the old list is untouched
  });

  it("pop / shift return the removed element and notify", () => {
    const list = new ObservableArray<number>([1, 2, 3]);
    const cb = jest.fn();
    list.subscribe(cb);
    expect(list.pop()).toBe(3);
    expect(list.shift()).toBe(1);
    expect(list.value).toEqual([2]);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("pop / shift on an empty list return undefined and do not notify", () => {
    const list = new ObservableArray<number>([]);
    const cb = jest.fn();
    list.subscribe(cb);
    expect(list.pop()).toBeUndefined();
    expect(list.shift()).toBeUndefined();
    expect(cb).not.toHaveBeenCalled();
  });

  it("insertAt / removeAt / move reorder without changing the old list", () => {
    const list = new ObservableArray<string>(["a", "c"]);
    list.insertAt(1, "b");
    expect(list.value).toEqual(["a", "b", "c"]);
    expect(list.removeAt(0)).toBe("a");
    expect(list.value).toEqual(["b", "c"]);
    list.move(0, 1);
    expect(list.value).toEqual(["c", "b"]);
  });

  it("updateAt swaps a single element via a derived value", () => {
    const list = new ObservableArray<Row>([
      { id: "1", selected: false },
      { id: "2", selected: false },
    ]);
    list.updateAt(1, (row) => ({ ...row, selected: true }));
    expect(list.value[1]).toEqual({ id: "2", selected: true });
    expect(list.value[0].selected).toBe(false);
  });

  it("replaceWhere updates only matching rows and notifies once", () => {
    const list = new ObservableArray<Row>([
      { id: "1", selected: true },
      { id: "2", selected: false },
      { id: "3", selected: true },
    ]);
    const cb = jest.fn();
    list.subscribe(cb);
    list.replaceWhere(
      (row) => row.selected,
      (row) => ({ ...row, selected: false })
    );
    expect(list.value.every((row) => !row.selected)).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("replaceWhere with no matches does not notify", () => {
    const list = new ObservableArray<Row>([{ id: "1", selected: false }]);
    const cb = jest.fn();
    list.subscribe(cb);
    list.replaceWhere(
      (row) => row.selected,
      (row) => ({ ...row, selected: false })
    );
    expect(cb).not.toHaveBeenCalled();
  });

  it("remove strips matching elements and returns them", () => {
    const list = new ObservableArray<number>([1, 2, 3, 4]);
    const removed = list.remove((n) => n % 2 === 0);
    expect(removed).toEqual([2, 4]);
    expect(list.value).toEqual([1, 3]);
  });

  it("removeItem removes the first identity match", () => {
    const a = { id: "1", selected: false };
    const b = { id: "2", selected: false };
    const list = new ObservableArray<Row>([a, b]);
    expect(list.removeItem(b)).toBe(true);
    expect(list.value).toEqual([a]);
    expect(list.removeItem({ id: "1", selected: false })).toBe(false); // a different object, not the same one
  });

  it("sort / reverse / clear make a new list and leave the original alone", () => {
    const list = new ObservableArray<number>([3, 1, 2]);
    list.sort((a, b) => a - b);
    expect(list.value).toEqual([1, 2, 3]);
    list.reverse();
    expect(list.value).toEqual([3, 2, 1]);
    list.clear();
    expect(list.value).toEqual([]);
  });

  it("does nothing when you set back the exact same list", () => {
    const list = new ObservableArray<number>([1]);
    const cb = jest.fn();
    list.subscribe(cb);
    list.setValue(list.value);
    expect(cb).not.toHaveBeenCalled();
  });

  it("update builds the next list from the current one", () => {
    const list = new ObservableArray<number>([1]);
    list.update((current) => [...current, 2, 3]);
    expect(list.value).toEqual([1, 2, 3]);
  });

  it("locks the list and its items in dev so an in-place edit throws", () => {
    const list = new ObservableArray<Row>([{ id: "1", selected: false }]);
    expect(Object.isFrozen(list.value)).toBe(true);
    expect(() => (list.value as Row[]).push({ id: "2", selected: false })).toThrow();
    expect(() => {
      (list.value[0] as Row).selected = true;
    }).toThrow();
  });

  it("supports immediate option on subscribe", () => {
    const list = new ObservableArray<number>([7]);
    const cb = jest.fn();
    list.subscribe(cb, { immediate: true });
    expect(cb).toHaveBeenCalledWith([7], [7]);
  });

  it("unsubscribe stops notifications", () => {
    const list = new ObservableArray<number>([]);
    const cb = jest.fn();
    const unsubscribe = list.subscribe(cb);
    unsubscribe();
    list.push(1);
    expect(cb).not.toHaveBeenCalled();
    expect(list.subscriberCount).toBe(0);
  });

  it("a listener that stops listening while being called does not break the others", () => {
    const list = new ObservableArray<number>([]);
    const calls: string[] = [];
    const unsubA = list.subscribe(() => {
      calls.push("a");
      unsubA();
    });
    list.subscribe(() => calls.push("b"));
    list.push(1);
    expect(calls).toEqual(["a", "b"]);
    list.push(2);
    expect(calls).toEqual(["a", "b", "b"]);
  });
});
