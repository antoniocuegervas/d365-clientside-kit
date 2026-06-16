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
}

interface ISmartFieldState {
  metadata?: IAttributeMetadata;
  /** User locale formatting (G-06), loaded only when the control opts in. */
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
   * Override to true on controls that localize via user settings (G-06) , 
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
        this.setState({
          loadError: `Could not load metadata for ${entity}.${attribute}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
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
