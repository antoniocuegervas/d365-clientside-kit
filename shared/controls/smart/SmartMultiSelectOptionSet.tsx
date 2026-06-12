import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { MultiSelectOptionSetField } from "../presentational/MultiSelectOptionSetField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export type ISmartMultiSelectOptionSetProps = ISmartFieldProps<number[]>;

/** Multi-select choice block, options auto-loaded from metadata. */
export class SmartMultiSelectOptionSet extends SmartFieldBase<
  number[],
  ISmartMultiSelectOptionSetProps
> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    return (
      <MultiSelectOptionSetField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.props.readOnly}
        errorMessage={this.props.errorMessage}
        options={metadata.options ?? []}
        selectedValues={this.props.value}
        onChange={this.commitChange}
      />
    );
  }
}
