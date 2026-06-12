import * as React from "react";
import { SmartComponent } from "../context/ViewModelContextProvider";
import { WaitingMessage } from "../controls/presentational/WaitingMessage";

export interface IRecordReadyProps {
  /** Rendered once the hosting form has a saved record id. */
  children: (recordId: string, entityName: string | null) => React.ReactNode;
  /** Poll interval, ms. */
  pollMs?: number;
  message?: string;
}

interface IRecordReadyState {
  recordId: string | null;
  entityName: string | null;
}

/**
 * Opt-in gate for form-embedded apps that need the record id before creating
 * state. Waits INDEFINITELY by design, an unsaved form may be saved
 * minutes later, and the app should simply appear when it happens. Apps that
 * don't need the record render without this wrapper.
 */
export class RecordReady extends SmartComponent<IRecordReadyProps, IRecordReadyState> {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(props: IRecordReadyProps) {
    super(props);
    this.state = { recordId: null, entityName: null };
  }

  override componentDidMount(): void {
    this.check();
    this.timer = setInterval(() => this.check(), this.props.pollMs ?? 500);
  }

  override componentWillUnmount(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    super.componentWillUnmount();
  }

  private check(): void {
    const formAccess = this.vmContext.formAccess;
    const recordId = formAccess?.getRecordId() ?? null;
    if (recordId && recordId !== this.state.recordId) {
      this.setState({ recordId, entityName: formAccess?.getEntityName() ?? null });
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }
  }

  override render(): React.ReactNode {
    if (!this.state.recordId) {
      return <WaitingMessage message={this.props.message ?? "Waiting for the record…"} />;
    }
    return this.props.children(this.state.recordId, this.state.entityName);
  }
}
