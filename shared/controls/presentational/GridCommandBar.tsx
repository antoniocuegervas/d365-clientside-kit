import * as React from "react";
import { Toolbar, ToolbarButton, ToolbarDivider } from "@fluentui/react-components";
import { AddRegular, DeleteRegular, ArrowClockwiseRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type OrObservable } from "../../reactivity/Observable";

/**
 * Command bar for a grid, the native ribbon's common actions: New, Delete, and
 * Refresh. Presentational: it renders the supplied selection count and raises
 * intent. Delete is enabled only when something is selected; the host confirms
 * the (destructive) delete before acting. Each action is shown only when its
 * handler is supplied.
 */
export interface IGridCommandBarProps {
  /** Selected row count; Delete is enabled when greater than zero. */
  selectedCount?: OrObservable<number>;
  onNew?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void;
  /** Label for the New action. Default "New". */
  newLabel?: string;
  disabled?: OrObservable<boolean>;
}

export class GridCommandBar extends ObserverComponent<IGridCommandBarProps> {
  constructor(props: IGridCommandBarProps) {
    super(props);
    this.observe(props.selectedCount, props.disabled);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IGridCommandBarProps> = (props) => {
  const count = valueOf(props.selectedCount ?? 0);
  const disabled = valueOf(props.disabled ?? false);
  const showDivider = !!(props.onNew || props.onDelete) && !!props.onRefresh;
  return (
    <Toolbar aria-label="Grid actions">
      {props.onNew ? (
        <ToolbarButton icon={<AddRegular />} onClick={props.onNew} disabled={disabled}>
          {props.newLabel ?? "New"}
        </ToolbarButton>
      ) : null}
      {props.onDelete ? (
        <ToolbarButton
          icon={<DeleteRegular />}
          onClick={props.onDelete}
          disabled={disabled || count === 0}
        >
          {count > 0 ? `Delete (${count})` : "Delete"}
        </ToolbarButton>
      ) : null}
      {showDivider ? <ToolbarDivider /> : null}
      {props.onRefresh ? (
        <ToolbarButton
          icon={<ArrowClockwiseRegular />}
          onClick={props.onRefresh}
          disabled={disabled}
        >
          Refresh
        </ToolbarButton>
      ) : null}
    </Toolbar>
  );
};
