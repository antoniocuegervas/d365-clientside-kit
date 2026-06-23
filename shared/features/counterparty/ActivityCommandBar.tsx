import * as React from "react";
import {
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Toolbar,
  ToolbarButton,
} from "@fluentui/react-components";
import { AddRegular, ArrowClockwiseRegular, EditRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type OrObservable } from "../../reactivity/Observable";
import type { IActivityTypeInfo } from "../../context/IViewModelContext";

/**
 * Command bar for the counterparty activity grid, selection-driven like a native
 * subgrid ribbon: with nothing selected it offers a New flyout (one entry per
 * activity type the org defines) and Refresh; with a row selected it offers Edit.
 * Presentational: it renders the supplied selection + activity types and raises
 * intent; the host opens the forms and reloads.
 */
export interface IActivityCommandBarProps {
  /** Selected row key; null shows New + Refresh, a value shows Edit. */
  selectedKey: OrObservable<string | null>;
  /** Activity types listed in the New flyout. */
  activityTypes: OrObservable<IActivityTypeInfo[]>;
  /** Create a new activity of the given entity logical name. */
  onCreate: (logicalName: string) => void;
  /** Edit (open) the selected activity. */
  onEdit: () => void;
  onRefresh: () => void;
}

export class ActivityCommandBar extends ObserverComponent<IActivityCommandBarProps> {
  constructor(props: IActivityCommandBarProps) {
    super(props);
    this.observe(props.selectedKey, props.activityTypes);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IActivityCommandBarProps> = (props) => {
  const selected = valueOf(props.selectedKey) != null;
  const types = valueOf(props.activityTypes);
  return (
    <Toolbar aria-label="Activity actions">
      {selected ? (
        <ToolbarButton icon={<EditRegular />} onClick={props.onEdit}>
          Edit
        </ToolbarButton>
      ) : (
        <>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <ToolbarButton icon={<AddRegular />} disabled={types.length === 0}>
                New
              </ToolbarButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {types.map((type) => (
                  <MenuItem key={type.logicalName} onClick={() => props.onCreate(type.logicalName)}>
                    {type.displayName}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <ToolbarButton icon={<ArrowClockwiseRegular />} onClick={props.onRefresh}>
            Refresh
          </ToolbarButton>
        </>
      )}
    </Toolbar>
  );
};
