import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { attributeOptions } from "../../metadata/attributeMetadataReads";
import type { IOptionItem } from "../../utils/EntityModel";
import { OptionSetField } from "../presentational/OptionSetField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartOptionSetProps extends ISmartFieldProps<number | null> {
  /** Prune or reorder metadata options before display (dynamic option pruning). */
  filterOptions?: (options: IOptionItem[]) => IOptionItem[];
}

/**
 * Choice field. The option list and labels load from the attribute's option
 * set; `filterOptions` lets a caller prune or reorder before display.
 * `SmartFieldBase` loads the metadata and renders the loading/error state.
 */
export class SmartOptionSet extends SmartFieldBase<number | null, ISmartOptionSetProps> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    const options = attributeOptions(metadata);
    return (
      <OptionSetField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.resolveReadOnly(metadata)}
        hint={this.resolveHint(metadata)}
        labelPosition={this.props.labelPosition}
        errorMessage={this.props.errorMessage}
        options={this.props.filterOptions ? this.props.filterOptions(options) : options}
        selectedValue={this.props.value}
        onChange={this.commitChange}
      />
    );
  }
}
