import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { attributeOptions } from "../../metadata/attributeMetadataReads";
import { MultiSelectOptionSetField } from "../presentational/MultiSelectOptionSetField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export type ISmartMultiSelectOptionSetProps = ISmartFieldProps<number[]>;

/**
 * Multi-select choice field. Options load from the attribute.
 * `SmartFieldBase` loads the metadata and renders the loading/error state.
 */
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
        readOnly={this.resolveReadOnly(metadata)}
        hint={this.resolveHint(metadata)}
        labelPosition={this.props.labelPosition}
        errorMessage={this.props.errorMessage}
        options={attributeOptions(metadata)}
        selectedValues={this.props.value}
        onChange={this.commitChange}
      />
    );
  }
}
