import * as React from "react";
import { Field } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf } from "../../reactivity/Observable";
import type { ICommonFieldProps } from "./fieldProps";

/**
 * Shared label/required/error wrapper, Fluent v9 `Field` is exactly the
 * refreshed-UCI field chrome (label above input, red asterisk, validation
 * message below). Every presentational field control renders inside one.
 */
export class FieldShell extends ObserverComponent<
  ICommonFieldProps & { children: React.ReactNode }
> {
  constructor(props: ICommonFieldProps & { children: React.ReactNode }) {
    super(props);
    this.observe(this.props.errorMessage);
  }

  override render(): React.ReactNode {
    const { label, required, hint, labelPosition, children } = this.props;
    const errorMessage = valueOf(this.props.errorMessage);
    return (
      <Field
        label={label}
        required={required}
        hint={hint}
        orientation={labelPosition === "start" ? "horizontal" : "vertical"}
        validationMessage={errorMessage}
        validationState={errorMessage ? "error" : "none"}
      >
        {children}
      </Field>
    );
  }
}
