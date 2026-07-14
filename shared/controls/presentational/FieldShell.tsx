import * as React from "react";
import {
  Field,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
  type LabelProps,
} from "@fluentui/react-components";
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
 * refreshed-UCI field framing (label above input, red asterisk, validation
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

const SHOW_DELAY_MS = 400;

/**
 * Label that reveals its description as an inverted hover tooltip after a per-field
 * delay. Visibility is controlled with this component's own timer instead of left
 * to Fluent, because Fluent shares a "recently shown" window across tooltips: once
 * one has appeared, moving to another label shows the next instantly, which gets
 * overwhelming on a form. Native UCI makes each label wait its own delay, so each
 * instance arms its own timer and ignores Fluent's instant-show requests.
 */
const DescribedLabel: React.FC<{
  description: string;
  text: string;
  Label: React.ElementType<LabelProps>;
  labelProps: LabelProps;
}> = ({ description, text, Label, labelProps }) => {
  const [visible, setVisible] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = (): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };
  React.useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );
  const arm = (): void => {
    cancel();
    timer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  };
  const dismiss = (): void => {
    cancel();
    setVisible(false);
  };
  return (
    <Tooltip
      content={description}
      relationship="description"
      appearance="inverted"
      withArrow
      positioning="above-start"
      visible={visible}
      // Honor Fluent's hide requests (pointer leave, Escape); ignore its show
      // requests so the per-field timer is the only thing that opens the tooltip.
      onVisibleChange={(_event, data) => {
        if (!data.visible) {
          dismiss();
        }
      }}
    >
      <Label {...labelProps} onMouseEnter={arm} onMouseLeave={dismiss}>
        {text}
      </Label>
    </Tooltip>
  );
};

const Body: React.FC<FieldShellProps & { errorText: string | undefined }> = (props) => {
  const styles = useStyles();
  const { label, required, hint, labelPosition, readOnly, readOnlyText, children, errorText } = props;
  const showReadOnly = readOnly && readOnlyText !== undefined;
  const isEmpty = typeof readOnlyText === "string" && readOnlyText.trim() === "";
  // The attribute Description rides on the label as a hover tooltip, matching
  // native UCI (hover the label, the description appears) instead of persistent
  // text below the field. The label slot render keeps Fluent's htmlFor
  // association and the required asterisk while making the label the trigger.
  const labelSlot =
    hint && label
      ? {
          children: (Label: React.ElementType<LabelProps>, labelProps: LabelProps) => (
            <DescribedLabel description={hint} text={label} Label={Label} labelProps={labelProps} />
          ),
        }
      : label;
  return (
    <Field
      label={labelSlot}
      required={required}
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
