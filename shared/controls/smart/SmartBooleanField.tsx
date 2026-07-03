import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { attributeOptions } from "../../metadata/attributeMetadataReads";
import { BooleanField } from "../presentational/BooleanField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export type ISmartBooleanFieldProps = ISmartFieldProps<boolean | null>;

/**
 * Two-option field. Yes/No labels come from the boolean option set.
 * `SmartFieldBase` loads the metadata and renders the loading/error state.
 */
export class SmartBooleanField extends SmartFieldBase<boolean | null, ISmartBooleanFieldProps> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    // attributeOptions emits boolean options in [falseOption, trueOption] order.
    const options = attributeOptions(metadata);
    const falseLabel = options[0]?.label;
    const trueLabel = options[1]?.label;
    return (
      <BooleanField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.resolveReadOnly(metadata)}
        hint={this.resolveHint(metadata)}
        labelPosition={this.props.labelPosition}
        errorMessage={this.props.errorMessage}
        value={this.props.value}
        onChange={this.commitChange}
        trueLabel={trueLabel}
        falseLabel={falseLabel}
      />
    );
  }
}
