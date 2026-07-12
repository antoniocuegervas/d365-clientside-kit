import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import { MeasuredWidth } from "../../../../../shared/controls/presentational/MeasuredWidth";

/**
 * MeasuredWidth reports its own rendered width to a render-prop child. The tests
 * drive a mocked ResizeObserver: the constructor captures the callback, observe
 * records the element, and a test fires the callback with a scripted contentRect
 * width. The no-ResizeObserver case renders the children with width 0.
 */

interface ICapturedObserver {
  callback: ResizeObserverCallback;
  observed: Element[];
}

let captured: ICapturedObserver | undefined;

class MockResizeObserver {
  private readonly observed: Element[] = [];
  constructor(callback: ResizeObserverCallback) {
    captured = { callback, observed: this.observed };
  }
  observe(element: Element): void {
    this.observed.push(element);
  }
  unobserve(): void {}
  disconnect(): void {}
}

const originalResizeObserver = (global as { ResizeObserver?: unknown }).ResizeObserver;

function setResizeObserver(value: unknown): void {
  (global as { ResizeObserver?: unknown }).ResizeObserver = value;
}

function fireWidth(width: number): void {
  act(() => {
    captured?.callback(
      [{ contentRect: { width } } as unknown as ResizeObserverEntry],
      {} as ResizeObserver
    );
  });
}

describe("MeasuredWidth", () => {
  beforeEach(() => {
    captured = undefined;
    setResizeObserver(MockResizeObserver);
  });

  afterEach(() => {
    setResizeObserver(originalResizeObserver);
  });

  it("renders the children with width 0 before the first measurement", () => {
    render(<MeasuredWidth>{(width) => <div>width is {width}</div>}</MeasuredWidth>);
    expect(screen.getByText("width is 0")).toBeTruthy();
  });

  it("observes its element and passes the measured width to the children function", () => {
    render(<MeasuredWidth>{(width) => <div>width is {width}</div>}</MeasuredWidth>);
    expect(captured).toBeTruthy();
    expect(captured!.observed.length).toBe(1);

    fireWidth(480);
    expect(screen.getByText("width is 480")).toBeTruthy();
  });

  it("renders the children with 0 in a host without ResizeObserver", () => {
    setResizeObserver(undefined);
    render(<MeasuredWidth>{(width) => <div>fallback width {width}</div>}</MeasuredWidth>);
    expect(screen.getByText("fallback width 0")).toBeTruthy();
  });
});
