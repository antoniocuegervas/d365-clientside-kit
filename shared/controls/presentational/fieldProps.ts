import type * as React from "react";
import type { OrObservable } from "../../reactivity/Observable";

/**
 * onError handler for decorative icon images (entity icons on lookup values
 * and result rows). The icon URLs are supplied by the host and never checked
 * up front, so a moved or missing icon would render as a broken-image glyph.
 * Blanking the image instead keeps its box, so row alignment holds and the
 * icon simply is not there.
 */
export function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.style.visibility = "hidden";
}

/**
 * Props shared by every presentational field control.
 *
 * Presentational controls are CRM-agnostic: everything here is a supplied
 * value or an event. No entity names, no metadata, no context, the smart
 * tier or ViewModel resolves all of that and passes plain UI inputs down.
 */
export interface ICommonFieldProps {
  /** Field label. Omit for label-less placement inside composite layouts. */
  label?: string;
  /** Renders the required indicator (does not enforce, hosts validate). */
  required?: boolean;
  /** Disabled: visible but not interactive (locked field). */
  disabled?: boolean;
  /** Read-only: value presented without input affordance. */
  readOnly?: boolean;
  /** Validation error text shown below the field, UCI-style. */
  errorMessage?: OrObservable<string | undefined>;
  /** Description shown as a hover tooltip on the label (native UCI behavior). */
  hint?: string;
  /**
   * Where the label sits: "top" (default) or "start" (beside the field, on the
   * leading edge, so left in LTR and right in RTL). Maps to Fluent Field
   * orientation. Fluent has no label-after-field ("end") option.
   */
  labelPosition?: "top" | "start";
}
