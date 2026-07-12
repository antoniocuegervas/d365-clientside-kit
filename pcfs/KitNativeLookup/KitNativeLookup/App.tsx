import * as React from "react";
import { SmartNativeLookup } from "../../../shared/controls/smart/SmartNativeLookup";
import type { Observable, OrObservable } from "../../../shared/reactivity/Observable";
import type { IEntityReference } from "../../../shared/utils/EntityModel";

export interface INativeLookupAppProps {
  /** Host form's entity logical name (from the form context). */
  entity: string | undefined;
  /** Bound lookup column's logical name (bound-property metadata, or the manifest override). */
  attribute: string;
  /** Optional lookup view name override. */
  viewName?: string;
  showIcons: boolean;
  disabled: boolean;
  /**
   * Per-user column security from the host (parameters.value.security):
   * true forces read-only, false says the user can edit the secured column,
   * undefined (not secured) leaves the shared metadata default in charge.
   */
  readOnly?: boolean;
  /** Host-owned value the control writes the pick into. */
  value: Observable<IEntityReference | null>;
  /** Live narrow-viewport flag driving the full-window search takeover. */
  fullscreenSearch?: OrObservable<boolean>;
  onChange: (value: IEntityReference | null) => void;
}

/**
 * Thin PCF view: renders the kit's SmartNativeLookup over the bound column. The
 * label is suppressed (the form already shows the field label above the control),
 * so this stays the control area only. Everything else (targets, lookup view,
 * columns, search, icons) resolves from metadata exactly as in the webresource.
 */
export const NativeLookupApp: React.FC<INativeLookupAppProps> = (props) => {
  if (!props.entity || !props.attribute) {
    return (
      <div>Set the lookup column logical name on the control to render the native lookup.</div>
    );
  }
  return (
    <SmartNativeLookup
      entity={props.entity}
      attribute={props.attribute}
      value={props.value}
      viewName={props.viewName}
      showIcons={props.showIcons}
      disabled={props.disabled}
      readOnly={props.readOnly}
      fullscreenSearch={props.fullscreenSearch}
      onChange={props.onChange}
      // Suppress the control's own label: the form field already renders it.
      label=""
    />
  );
};
