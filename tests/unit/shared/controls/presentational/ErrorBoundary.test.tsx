import * as React from "react";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../../../../shared/controls/presentational/ErrorBoundary";

function Boom(): React.ReactElement {
  throw new Error("render boom");
}

describe("ErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>healthy child</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("healthy child")).toBeTruthy();
  });

  it("shows a neutral degraded state instead of blanking when a child throws", () => {
    // React logs a caught error to console.error; silence it so the run stays clean.
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert").textContent).toContain("could not be displayed");
    spy.mockRestore();
  });

  it("renders a custom fallback and reports the error to onError", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = jest.fn();
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>} onError={onError}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("custom fallback")).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    spy.mockRestore();
  });
});
