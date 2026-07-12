import * as React from "react";

export interface IMeasuredWidthProps {
  /**
   * Receives the container's current width in pixels and returns what to render.
   * The width is 0 until the first measurement (and stays 0 in a host without
   * ResizeObserver); the consumer decides what 0 means, usually "not measured
   * yet, render the default".
   */
  children: (width: number) => React.ReactNode;
}

interface IMeasuredWidthState {
  width: number;
}

/**
 * Reports its own rendered width to a render-prop child, so a control can adapt
 * to the space it actually occupies without hand-rolling a ResizeObserver.
 *
 * Container width, NOT viewport width: it measures the element it renders, so it
 * is correct in any host, including a virtual PCF that renders into the model
 * driven page DOM, where a viewport media query would measure the whole window
 * rather than the control's slice of it. Width only: the wrapper fills its host's
 * width but never forces a height, so a consumer in an auto-height host (a dataset
 * PCF container) still takes its height from its content instead of collapsing to
 * a height:100% that has nothing to resolve against.
 */
export class MeasuredWidth extends React.Component<IMeasuredWidthProps, IMeasuredWidthState> {
  private readonly rootRef = React.createRef<HTMLDivElement>();
  private observer: ResizeObserver | undefined;

  constructor(props: IMeasuredWidthProps) {
    super(props);
    this.state = { width: 0 };
  }

  override componentDidMount(): void {
    if (this.rootRef.current && typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver((entries) => {
        const width = Math.round(entries[0]?.contentRect.width ?? 0);
        if (Math.abs(width - this.state.width) > 1) {
          this.setState({ width });
        }
      });
      this.observer.observe(this.rootRef.current);
    }
  }

  override componentWillUnmount(): void {
    this.observer?.disconnect();
  }

  override render(): React.ReactNode {
    return (
      <div ref={this.rootRef} style={{ width: "100%" }}>
        {this.props.children(this.state.width)}
      </div>
    );
  }
}
