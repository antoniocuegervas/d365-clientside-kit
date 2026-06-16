import * as React from "react";
import { SmartComponent } from "../../context/ViewModelContextProvider";
import type { ILookupOptions } from "../../context/IViewModelContext";
import { Observable, type OrObservable } from "../../reactivity/Observable";
import type { IEntityReference } from "../../utils/EntityModel";
import { LookupField } from "../presentational/LookupField";

export interface IStandardLookupFieldProps {
  /** Host-owned selected reference. */
  value: Observable<IEntityReference | null>;
  /** Entities offered in the native picker (single entity when length 1). */
  entityTypes: string[];
  label?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  errorMessage?: OrObservable<string | undefined>;
  placeholder?: string;
  /** Per-entity FetchXML `<filter>` applied to the dialog's view. */
  filters?: Array<{ entityLogicalName: string; filterXml: string }>;
  /** Hide the recently-used list. */
  disableMru?: boolean;
  onChange?: (selected: IEntityReference | null) => void;
}

/**
 * Standalone, dialog-only lookup (G-02): a value display + Browse button that
 * opens the native CRM picker (`lookupObjects`), no inline search box and no
 * attribute binding. Use it for cross-entity pickers or when only the full
 * platform dialog will do. For attribute-bound lookups prefer
 * `SmartLookup mode="dialog"`.
 */
export class StandardLookupField extends SmartComponent<IStandardLookupFieldProps> {
  /** Dialog mode shows no inline results, kept empty to satisfy the contract. */
  private readonly results = new Observable<IEntityReference[]>([]);

  constructor(props: IStandardLookupFieldProps) {
    super(props);
    this.observe(props.value, props.errorMessage);
  }

  private readonly commit = (selected: IEntityReference | null): void => {
    this.props.value.value = selected;
    this.props.onChange?.(selected);
  };

  private readonly handleBrowse = async (): Promise<void> => {
    const options: ILookupOptions = {
      entityTypes: this.props.entityTypes,
      defaultEntityType: this.props.entityTypes[0],
      allowMultiSelect: false,
      disableMru: this.props.disableMru,
      filters: this.props.filters,
    };
    try {
      const result = await this.vmContext.navigation.lookupObjects(options);
      if (!this.isDisposed && result.length > 0) {
        this.commit(result[0]);
      }
    } catch {
      // Native dialog unavailable on this host, leave the value unchanged.
    }
  };

  override render(): React.ReactNode {
    return (
      <LookupField
        label={this.props.label}
        required={this.props.required}
        disabled={this.props.disabled}
        readOnly={this.props.readOnly}
        errorMessage={this.props.errorMessage}
        placeholder={this.props.placeholder}
        selected={this.props.value}
        results={this.results}
        mode="dialog"
        onBrowse={() => void this.handleBrowse()}
        onChange={this.commit}
      />
    );
  }
}
