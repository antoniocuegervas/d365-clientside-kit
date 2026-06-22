import * as React from "react";
import { Field, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf } from "../../reactivity/Observable";
import type { ICommonFieldProps } from "./fieldProps";

type FieldShellProps = ICommonFieldProps & {
  children: React.ReactNode;
  /**
   * The value shown when the field is read-only. The shell renders it as flat
   * locked text in place of the interactive control, matching native UCI (a
   * read-only field reads as a value, not a greyed-out or focusable input). A
   * blank string shows the "---" empty marker. Controls that do not pass this
   * fall back to rendering their children unchanged.
   */
  readOnlyText?: React.ReactNode;
};

/**
 * Shared label/required/error wrapper, Fluent v9 `Field` is exactly the
 * refreshed-UCI field chrome (label above input, red asterisk, validation
 * message below). Every presentational field control renders inside one.
 *
 * Read-only is handled here, once, for every field: instead of leaving an
 * interactive control in a half-disabled state (a text input that still takes
 * focus and silently swallows typing, or a switch whose thumb misreads its
 * value), the shell shows the value as plain locked text.
 */
const useStyles = makeStyles({
  readOnly: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    paddingTop: tokens.spacingVerticalSNudge,
    paddingBottom: tokens.spacingVerticalSNudge,
    minHeight: "20px",
    // Preserve line breaks for read-only memo fields.
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  empty: { color: tokens.colorNeutralForeground4 },
});

export class FieldShell extends ObserverComponent<FieldShellProps> {
  constructor(props: FieldShellProps) {
    super(props);
    this.observe(this.props.errorMessage);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} errorText={valueOf(this.props.errorMessage)} />;
  }
}

const Body: React.FC<FieldShellProps & { errorText: string | undefined }> = (props) => {
  const styles = useStyles();
  const { label, required, hint, labelPosition, readOnly, readOnlyText, children, errorText } = props;
  const showReadOnly = readOnly && readOnlyText !== undefined;
  const isEmpty = typeof readOnlyText === "string" && readOnlyText.trim() === "";
  return (
    <Field
      label={label}
      required={required}
      hint={hint}
      orientation={labelPosition === "start" ? "horizontal" : "vertical"}
      validationMessage={errorText}
      validationState={errorText ? "error" : "none"}
    >
      {showReadOnly ? (
        <div className={mergeClasses(styles.readOnly, isEmpty && styles.empty)}>
          {isEmpty ? "---" : readOnlyText}
        </div>
      ) : (
        children
      )}
    </Field>
  );
};
