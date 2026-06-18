import * as React from "react";
import { Button, Combobox, Input, Option, makeStyles, tokens } from "@fluentui/react-components";
import { DismissRegular, SearchRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";
import type { IEntityReference } from "../../utils/EntityModel";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface ILookupFieldProps extends ICommonFieldProps {
  /** Host-owned selected reference. */
  selected: Observable<IEntityReference | null>;
  /**
   * Host-owned search results. The CRM layer fetches when onSearchTextChanged
   * fires and writes here, the control NEVER queries.
   */
  results: OrObservable<IEntityReference[]>;
  /**
   * Raised as the user types, and once when the picker opens (with the current
   * text, empty for the first page). The host decides what, and whether, to
   * fetch, so opening behaves like a dropdown for small value sets while large
   * sets can still wait for typed input.
   */
  onSearchTextChanged?: (searchText: string) => void;
  onChange?: (selected: IEntityReference | null) => void;
  placeholder?: string;
  /** True while the host is searching, to show the busy hint. */
  searching?: OrObservable<boolean>;
  /**
   * "inline" (default) is the search-as-you-type combobox; "dialog" shows the
   * selected value + a Browse button that raises {@link onBrowse} (the smart
   * tier opens the native CRM picker).
   */
  mode?: "inline" | "dialog";
  /** Raised when the Browse button is clicked in dialog mode. */
  onBrowse?: () => void;
}

interface ILookupFieldState {
  searchText: string | null;
}

const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalXS },
  combo: { flexGrow: 1, minWidth: 0 },
  optionIcon: { marginRight: tokens.spacingHorizontalXS, verticalAlign: "middle" },
});

/**
 * Single-record lookup with search-as-you-type, renders supplied results and
 * emits events; custom filter logic lives in the ViewModel/smart tier.
 */
export class LookupField extends ObserverComponent<ILookupFieldProps, ILookupFieldState> {
  constructor(props: ILookupFieldProps) {
    super(props);
    this.state = { searchText: null };
    this.observe(props.selected, props.results, props.errorMessage, props.searching);
  }

  private readonly handleInput = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const text = event.target.value;
    this.setState({ searchText: text });
    this.props.onSearchTextChanged?.(text);
  };

  private readonly handleOpenChange = (_event: unknown, data: { open: boolean }): void => {
    // Opening requests the first page (current text, empty = unfiltered) so the
    // picker behaves like a dropdown; the host decides what (and how much) to load.
    if (data.open) {
      this.props.onSearchTextChanged?.(this.state.searchText ?? "");
    }
  };

  private readonly handleSelect = (
    _event: unknown,
    data: { optionValue?: string }
  ): void => {
    if (!data.optionValue) {
      return;
    }
    const results = valueOf(this.props.results);
    const match = results.find((r) => r.id === data.optionValue);
    if (match) {
      this.setState({ searchText: null });
      this.props.onChange?.(match);
    }
  };

  private readonly handleClear = (): void => {
    this.setState({ searchText: null });
    this.props.onChange?.(null);
  };

  override render(): React.ReactNode {
    return <Body {...this.props} state={this.state} onInput={this.handleInput} onSelect={this.handleSelect} onClear={this.handleClear} onOpenChange={this.handleOpenChange} />;
  }
}

const Body: React.FC<
  ILookupFieldProps & {
    state: ILookupFieldState;
    onInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSelect: (event: unknown, data: { optionValue?: string }) => void;
    onClear: () => void;
    onOpenChange: (event: unknown, data: { open: boolean }) => void;
  }
> = (props) => {
  const styles = useStyles();
  const { selected, disabled, readOnly, placeholder, state } = props;
  const results = valueOf(props.results);
  const searching = valueOf(props.searching ?? false);
  const current = selected.value;
  const text = state.searchText ?? current?.name ?? "";
  const interactive = !disabled && !readOnly;

  if (props.mode === "dialog") {
    return (
      <FieldShell {...props}>
        <div className={styles.row}>
          <Input
            className={styles.combo}
            readOnly
            value={current?.name ?? ""}
            placeholder={readOnly ? undefined : placeholder ?? "No record selected"}
            disabled={disabled}
          />
          {interactive ? (
            <Button
              appearance="subtle"
              size="small"
              icon={<SearchRegular />}
              aria-label="Browse records"
              onClick={props.onBrowse}
            />
          ) : null}
          {interactive && current ? (
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              aria-label="Clear value"
              onClick={props.onClear}
            />
          ) : null}
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell {...props}>
      <div className={styles.row}>
        <div className={styles.combo}>
          <Combobox
            value={text}
            selectedOptions={current ? [current.id] : []}
            onChange={props.onInput}
            onOptionSelect={props.onSelect}
            onOpenChange={props.onOpenChange}
            disabled={disabled || readOnly}
            placeholder={readOnly ? undefined : placeholder ?? "Look for records"}
            freeform
            clearable={false}
          >
            {searching ? (
              <Option key="__searching__" value="__searching__" text="" disabled>
                Searching…
              </Option>
            ) : results.length === 0 ? (
              <Option key="__none__" value="__none__" text="" disabled>
                {state.searchText ? "No records found" : "Type to search"}
              </Option>
            ) : (
              results.map((result) => (
                <Option key={result.id} value={result.id} text={result.name ?? result.id}>
                  {result.iconUrl ? (
                    <img
                      src={result.iconUrl}
                      alt=""
                      aria-hidden
                      width={16}
                      height={16}
                      className={styles.optionIcon}
                    />
                  ) : null}
                  {result.name ?? result.id}
                </Option>
              ))
            )}
          </Combobox>
        </div>
        {interactive && current ? (
          <Button
            appearance="subtle"
            size="small"
            icon={<DismissRegular />}
            aria-label="Clear value"
            onClick={props.onClear}
          />
        ) : null}
      </div>
    </FieldShell>
  );
};
