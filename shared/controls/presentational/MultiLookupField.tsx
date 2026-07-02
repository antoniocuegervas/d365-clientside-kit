import * as React from "react";
import { kitStrings } from "../../localization/kitStrings";
import {
  Tag,
  TagGroup,
  Combobox,
  Option,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";
import type { IEntityReference } from "../../utils/EntityModel";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface IMultiLookupFieldProps extends ICommonFieldProps {
  /** Host-owned selected references. */
  selected: Observable<IEntityReference[]>;
  /** Host-owned search results (the control never queries). */
  results: OrObservable<IEntityReference[]>;
  onSearchTextChanged?: (searchText: string) => void;
  onChange?: (selected: IEntityReference[]) => void;
  placeholder?: string;
}

interface IMultiLookupFieldState {
  searchText: string;
}

const useStyles = makeStyles({
  stack: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
});

/** Multi-record lookup: selected pills + search-as-you-type adder. */
export class MultiLookupField extends ObserverComponent<
  IMultiLookupFieldProps,
  IMultiLookupFieldState
> {
  constructor(props: IMultiLookupFieldProps) {
    super(props);
    this.state = { searchText: "" };
    this.observe(props.selected, props.results, props.errorMessage);
  }

  private readonly handleInput = (event: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ searchText: event.target.value });
    this.props.onSearchTextChanged?.(event.target.value);
  };

  private readonly handleSelect = (_event: unknown, data: { optionValue?: string }): void => {
    if (!data.optionValue) {
      return;
    }
    const results = valueOf(this.props.results);
    const match = results.find((r) => r.id === data.optionValue);
    const current = this.props.selected.value;
    if (match && !current.some((r) => r.id === match.id)) {
      this.setState({ searchText: "" });
      this.props.onChange?.([...current, match]);
    }
  };

  private readonly handleRemove = (id: string): void => {
    this.props.onChange?.(this.props.selected.value.filter((r) => r.id !== id));
  };

  override render(): React.ReactNode {
    return (
      <Body
        {...this.props}
        state={this.state}
        onInput={this.handleInput}
        onSelect={this.handleSelect}
        onRemove={this.handleRemove}
      />
    );
  }
}

const Body: React.FC<
  IMultiLookupFieldProps & {
    state: IMultiLookupFieldState;
    onInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSelect: (event: unknown, data: { optionValue?: string }) => void;
    onRemove: (id: string) => void;
  }
> = (props) => {
  const styles = useStyles();
  const { disabled, readOnly, placeholder, state } = props;
  const selected = props.selected.value;
  const results = valueOf(props.results).filter((r) => !selected.some((s) => s.id === r.id));
  const interactive = !disabled && !readOnly;

  return (
    <FieldShell {...props}>
      <div className={styles.stack}>
        {selected.length > 0 ? (
          <TagGroup
            onDismiss={interactive ? (_e, data) => props.onRemove(String(data.value)) : undefined}
            aria-label={props.label ? `${props.label} selected records` : "Selected records"}
          >
            {selected.map((reference) => (
              <Tag
                key={reference.id}
                value={reference.id}
                dismissible={interactive}
                shape="rounded"
              >
                {reference.name ?? reference.id}
              </Tag>
            ))}
          </TagGroup>
        ) : null}
        {interactive ? (
          <Combobox
            value={state.searchText}
            selectedOptions={[]}
            onChange={props.onInput}
            onOptionSelect={props.onSelect}
            placeholder={placeholder ?? kitStrings().lookForRecords}
            freeform
          >
            {results.length === 0 ? (
              <Option key="__none__" value="__none__" text="" disabled>
                {state.searchText ? kitStrings().noRecordsFound : kitStrings().typeToSearch}
              </Option>
            ) : (
              results.map((result) => (
                <Option key={result.id} value={result.id} text={result.name ?? result.id}>
                  {result.name ?? result.id}
                </Option>
              ))
            )}
          </Combobox>
        ) : null}
      </div>
    </FieldShell>
  );
};
