import * as React from "react";
import { kitStrings } from "../../localization/kitStrings";
import { Button, SearchBox, makeStyles, tokens } from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";

/**
 * Search command bar, text in, onSearch out. The host runs the query
 * when onSearch fires and renders results wherever it likes.
 */
export interface ISearchBarProps {
  /** Host-owned search text. */
  searchText: Observable<string>;
  /** Raised on Enter or the search button. */
  onSearch?: (searchText: string) => void;
  /** Raised on every keystroke for search-as-you-type hosts. */
  onSearchTextChanged?: (searchText: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Show an explicit search button beside the box. Default true. */
  showButton?: boolean;
  /**
   * When set, typing fires `onSearch` this many ms after the user stops (live
   * search), in addition to Enter. Debounced so it does not query the org on
   * every keystroke. Omit for explicit-only (Enter / button) search.
   */
  debounceMs?: number;
}

const useStyles = makeStyles({
  row: { display: "flex", columnGap: tokens.spacingHorizontalS, alignItems: "center" },
  box: { flexGrow: 1, maxWidth: "480px" },
});

export class SearchBar extends ObserverComponent<ISearchBarProps> {
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(props: ISearchBarProps) {
    super(props);
    this.observe(props.searchText);
  }

  private readonly handleChange = (
    _event: unknown,
    data: { value: string }
  ): void => {
    this.props.searchText.value = data.value;
    this.props.onSearchTextChanged?.(data.value);
    if (this.props.debounceMs !== undefined && this.props.onSearch) {
      // Live search: fire after the user pauses, not on every keystroke.
      this.clearDebounce();
      const value = data.value;
      this.debounceTimer = setTimeout(() => this.props.onSearch?.(value), this.props.debounceMs);
    }
  };

  private readonly handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Enter") {
      // Enter searches now; cancel any pending debounced search so the same
      // query does not fire twice.
      this.clearDebounce();
      this.props.onSearch?.(this.props.searchText.value);
    }
  };

  private readonly handleSearchClick = (): void => {
    this.clearDebounce();
    this.props.onSearch?.(this.props.searchText.value);
  };

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  protected override onUnmount(): void {
    this.clearDebounce();
  }

  override render(): React.ReactNode {
    return (
      <Body
        {...this.props}
        onChange={this.handleChange}
        onKeyDown={this.handleKeyDown}
        onSearchClick={this.handleSearchClick}
      />
    );
  }
}

const Body: React.FC<
  ISearchBarProps & {
    onChange: (event: unknown, data: { value: string }) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    onSearchClick: () => void;
  }
> = (props) => {
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <div className={styles.box}>
        <SearchBox
          value={props.searchText.value}
          onChange={props.onChange}
          onKeyDown={props.onKeyDown}
          placeholder={props.placeholder ?? kitStrings().search}
          disabled={props.disabled}
          style={{ width: "100%" }}
        />
      </div>
      {props.showButton !== false ? (
        <Button
          appearance="primary"
          icon={<SearchRegular />}
          onClick={props.onSearchClick}
          disabled={props.disabled}
        >
          {kitStrings().search}
        </Button>
      ) : null}
    </div>
  );
};
