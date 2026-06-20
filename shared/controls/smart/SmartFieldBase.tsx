import * as React from "react";
import { SmartComponent } from "../../context/ViewModelContextProvider";
import type { IAttributeMetadata, IFormattingInfo } from "../../context/IViewModelContext";
import type { Observable, OrObservable } from "../../reactivity/Observable";
import { WaitingMessage } from "../presentational/WaitingMessage";
import { FieldShell } from "../presentational/FieldShell";

/**
 * Declarative config shared by every metadata-aware field control.
 *
 * The form-designer mental model: drop the block with `entity` + `attribute`
 * + a value Observable; label, options, precision, formats, and targets
 * resolve from Dataverse metadata. Every metadata-derived default can be
 * overridden by a prop, exactly like overriding a label on a form.
 */
export interface ISmartFieldProps<TValue> {
  /** Entity logical name, e.g. "account". */
  entity: string;
  /** Attribute logical name, e.g. "industrycode". */
  attribute: string;
  /**
   * Host-owned value. The smart control writes the user's change into
   * this observable AND raises onChange, ViewModels can bind either way.
   */
  value: Observable<TValue>;
  onChange?: (value: TValue) => void;
  /** Override the metadata display name. */
  label?: string;
  /** Override the metadata requirement level indicator. */
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  errorMessage?: OrObservable<string | undefined>;
  /**
   * Description hint shown with the label. Defaults to the attribute's metadata
   * Description; pass to override, or "" to suppress. A free-form `placeholder`
   * is deliberately not offered: what a smart field shows comes from metadata.
   */
  hint?: string;
  /** Label placement: "top" (default) or "start" (beside the field, RTL-aware). */
  labelPosition?: "top" | "start";
}

interface ISmartFieldState {
  metadata?: IAttributeMetadata;
  /** User locale formatting, loaded only when the control opts in. */
  formatting?: IFormattingInfo;
  loadError?: string;
}

/**
 * Base for smart field controls: loads attribute metadata once via the host
 * context, shows the kit's standard loading presentation meanwhile,
 * then delegates to a presentational child with resolved props.
 */
export abstract class SmartFieldBase<
  TValue,
  TProps extends ISmartFieldProps<TValue> = ISmartFieldProps<TValue>,
> extends SmartComponent<TProps, ISmartFieldState> {
  constructor(props: TProps) {
    super(props);
    this.state = {};
    this.observe(props.value, props.errorMessage);
  }

  override componentDidMount(): void {
    void this.loadMetadata();
    if (this.usesFormatting()) {
      void this.loadFormatting();
    }
  }

  /**
   * Resilience for reuse: React keeps one control instance when the same
   * control type stays at the same tree position (e.g. a field that swaps
   * entity/attribute across wizard steps, or rebinds its value Observable).
   * Metadata loads and the value subscription are established on mount, so on
   * such a change we reload metadata and re-subscribe here rather than silently
   * showing the previous attribute's label and ignoring edits.
   */
  override componentDidUpdate(prevProps: TProps): void {
    if (prevProps.entity !== this.props.entity || prevProps.attribute !== this.props.attribute) {
      this.setState({ metadata: undefined, loadError: undefined });
      void this.loadMetadata();
      if (this.usesFormatting()) {
        void this.loadFormatting();
      }
    }
    if (prevProps.value !== this.props.value || prevProps.errorMessage !== this.props.errorMessage) {
      this.reobserve(this.props.value, this.props.errorMessage);
    }
  }

  /**
   * Override to true on controls that localize via user settings
   * date and numeric fields. Defaults to false so other fields skip the
   * extra context call.
   */
  protected usesFormatting(): boolean {
    return false;
  }

  private async loadFormatting(): Promise<void> {
    try {
      const formatting = await this.vmContext.getFormatting();
      if (!this.isDisposed) {
        this.setState({ formatting });
      }
    } catch {
      // Non-fatal, controls fall back to default formatting.
    }
  }

  private async loadMetadata(): Promise<void> {
    const { entity, attribute } = this.props;
    try {
      const metadata = await this.vmContext.metadata.getAttributeMetadata(entity, attribute);
      if (!this.isDisposed) {
        this.setState({ metadata });
      }
    } catch (error) {
      if (!this.isDisposed) {
        // Never surface raw SDK text to the user; log it for developers and show
        // a neutral message under the field label.
        console.error(`Smart field metadata load failed for ${entity}.${attribute}`, error);
        this.setState({ loadError: "Unavailable in this environment." });
      }
    }
  }

  /** Effective label: prop override, else metadata display name. */
  protected resolveLabel(metadata: IAttributeMetadata): string {
    return this.props.label ?? metadata.displayName;
  }

  /** Effective required flag: prop override, else metadata requirement. */
  protected resolveRequired(metadata: IAttributeMetadata): boolean {
    return this.props.required ?? metadata.required;
  }

  /**
   * Effective hint: prop override, else the attribute's metadata Description.
   * Pass `hint=""` to suppress (the nullish check keeps an explicit empty string).
   */
  protected resolveHint(metadata: IAttributeMetadata): string | undefined {
    return this.props.hint ?? metadata.description;
  }

  /** Standard change plumbing: write host-owned observable, raise event. */
  protected readonly commitChange = (value: TValue): void => {
    this.props.value.value = value;
    this.props.onChange?.(value);
  };

  /** Renders the presentational child once metadata is available. */
  protected abstract renderField(metadata: IAttributeMetadata): React.ReactNode;

  override render(): React.ReactNode {
    const { metadata, loadError } = this.state;
    if (loadError) {
      return (
        <FieldShell label={this.props.label ?? this.props.attribute} errorMessage={loadError}>
          <span />
        </FieldShell>
      );
    }
    if (!metadata) {
      return <WaitingMessage inline message={this.props.label ?? "Loading…"} />;
    }
    return this.renderField(metadata);
  }
}
