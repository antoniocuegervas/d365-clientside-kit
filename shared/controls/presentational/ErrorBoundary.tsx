import * as React from "react";

interface IErrorBoundaryProps {
  children?: React.ReactNode;
  /**
   * Custom degraded state. Defaults to a neutral, dependency-light message.
   * Keep a replacement dependency-light too, for the reason the default is (below).
   */
  fallback?: React.ReactNode;
  /** Called once when an error is caught, so a host can log or report it. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface IErrorBoundaryState {
  hasError: boolean;
}

/**
 * Contains a render or mount error in its subtree so one broken control shows a
 * neutral message instead of taking the whole app down. React unmounts the
 * entire tree on an uncaught render error, so without a boundary a single throw
 * (a bad prop, or a Fluent focus-management version collision that throws from a
 * layout effect) blanks the page with no way to tell what happened.
 *
 * Values in, events out only: no CRM, no context, so it is safe at any layer.
 */
export class ErrorBoundary extends React.Component<IErrorBoundaryProps, IErrorBoundaryState> {
  constructor(props: IErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): IErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log for developers; the user only ever sees the neutral message.
    console.error("A control failed to render and was contained by the error boundary.", error, info);
    this.props.onError?.(error, info);
  }

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return this.props.fallback ?? <DefaultErrorFallback />;
  }
}

/**
 * Deliberately plain markup, no Fluent. The boundary often catches a failure in
 * the UI stack itself (a Fluent focus-management collision is the motivating
 * case), so the degraded state must not lean on that same stack to render.
 */
function DefaultErrorFallback(): React.ReactElement {
  return (
    <div
      role="alert"
      style={{
        fontFamily: "'Segoe UI', sans-serif",
        fontSize: "14px",
        color: "#323130",
        padding: "16px",
      }}
    >
      This control could not be displayed. Try reloading the page.
    </div>
  );
}
