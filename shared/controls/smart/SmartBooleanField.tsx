import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { BooleanField } from "../presentational/BooleanField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export type ISmartBooleanFieldProps = ISmartFieldProps<boolean | null>;

/** Two-option block, Yes/No labels come from the boolean option set metadata. */
export class SmartBooleanField extends SmartFieldBase<boolean | null, ISmartBooleanFieldProps> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    // MetadataService normalizes to [falseOption, trueOption] order.
    const falseLabel = metadata.options?.[0]?.label;
    const trueLabel = metadata.options?.[1]?.label;
    return (
      <BooleanField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.props.readOnly}
        errorMessage={this.props.errorMessage}
        value={this.props.value}
        onChange={this.commitChange}
        trueLabel={trueLabel}
        falseLabel={falseLabel}
      />
    );
  }
}
