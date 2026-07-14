import * as React from "react";
import { kitStrings } from "../../localization/kitStrings";
import {
  Button,
  Input,
  type InputProps,
  Link,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ChevronDownRegular,
  ChevronUpRegular,
  DismissRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";
import type { IEntityReference } from "../../utils/EntityModel";
import { FieldShell } from "./FieldShell";
import { hideBrokenImage, type ICommonFieldProps } from "./fieldProps";

//#region Types

/** One lookup-view column value shown under a result's name. */
export interface INativeLookupColumn {
  /** Column display name from the lookup view (used for accessibility/labelling). */
  label?: string;
  /** The populated value to display. */
  value: string;
}

/**
 * A single flyout result. The host (smart tier) resolves these from the lookup
 * view and hands plain data down; the control never queries.
 *
 * `columns` are the lookup-view columns in view order, already filtered to
 * populated values. `columns[0]` renders as the second line under the name;
 * `columns[1..]` are the chevron-expand detail. The expand chevron appears only
 * when there is more than one column (the conditional-chevron rule, matching
 * native: a row with nothing beyond the first column stays single-line).
 */
export interface INativeLookupResult {
  id: string;
  name: string;
  logicalName: string;
  iconUrl?: string;
  columns?: INativeLookupColumn[];
}

/** A target table the flyout can point at (for polymorphic lookups). */
export interface INativeLookupTarget {
  entity: string;
  label: string;
}

export interface INativeLookupFieldProps extends ICommonFieldProps {
  /** Host-owned selected reference. */
  selected: Observable<IEntityReference | null>;
  /**
   * Host-owned flyout results. The host fetches when onSearchTextChanged fires
   * and writes here; the control only renders.
   */
  results: OrObservable<INativeLookupResult[]>;
  /** True while the host is querying, drives the "Loading" line. */
  searching?: OrObservable<boolean>;
  /**
   * True when the host's last search FAILED (as opposed to returning nothing).
   * Renders a distinct message so a broken query never reads as "no matches".
   */
  searchFailed?: OrObservable<boolean>;
  /**
   * Raised as the user types, and once with "" when the flyout opens, so the
   * host loads the lookup view's first page on open (the native "all records"
   * state) and filters as the user types.
   */
  onSearchTextChanged?: (searchText: string) => void;
  /** Raised when a record is picked (or cleared, with null). */
  onChange?: (selected: IEntityReference | null) => void;
  /**
   * Raised when the set value's name link is clicked, so the smart tier opens
   * the record (native clickthrough). When omitted the value is plain text.
   */
  onOpenRecord?: (selected: IEntityReference) => void;
  /** Raised by the footer "Advanced" link (smart tier opens the native picker). */
  onAdvanced?: () => void;
  /** Raised by the footer "+ New" button (smart tier opens quick create). */
  onNew?: () => void;
  /**
   * Icon for the SELECTED value, shown in the resting chip when the value's own
   * `iconUrl` is absent (a value loaded from the host carries no icon). The smart
   * tier resolves it from the value's entity, so the chip shows the icon on load,
   * matching the native lookup.
   */
  selectedIconUrl?: OrObservable<string | undefined>;
  /** Empty-state placeholder, e.g. "Look for Parent Account". */
  placeholder?: string;
  /** Flyout header label, the target table's display name (e.g. "Contacts"). */
  tableLabel?: OrObservable<string | undefined>;
  /**
   * Target tables offered in the header switcher. Single-target lookups pass one
   * (or none); multi-target (Customer/Owner) pass several and the header shows a
   * switcher that raises onTargetChange. An Observable because the smart tier
   * resolves the target display names asynchronously, after the first render.
   */
  targets?: OrObservable<INativeLookupTarget[] | undefined>;
  /** The currently active target entity (for the switcher). */
  activeTarget?: OrObservable<string | undefined>;
  /** Raised when the user picks a different target table in the switcher. */
  onTargetChange?: (entity: string) => void;
  /**
   * When true and the search is open, the search surface renders as a full-window
   * TAKEOVER (fixed, inset 0) instead of the anchored flyout, matching the
   * platform's narrow-viewport lookup: a dedicated search page with edge-to-edge
   * rows, a scope row of target buttons, and a pinned footer. Tapping a row
   * commits and closes, exactly like the flyout. Absent or false (the default)
   * renders the anchored flyout unchanged. Host-supplied (the smart tier resolves
   * the viewport); the presentational control never measures the viewport itself.
   */
  fullscreenSearch?: OrObservable<boolean>;
}

//#endregion

//#region Pure helpers (exported for unit tests)

/** One run of text, flagged as a search match or not. */
export interface IHighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Splits text into matched and unmatched runs for the search-term bold, the way
 * the native lookup bolds the typed substring wherever it appears across the
 * displayed columns. Case-insensitive, every occurrence. An empty query yields a
 * single unmatched run (the whole text).
 */
export function splitHighlight(text: string, query: string): IHighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [{ text, match: false }];
  }
  const segments: IHighlightSegment[] = [];
  const haystack = text.toLowerCase();
  let from = 0;
  let at = haystack.indexOf(needle, from);
  while (at !== -1) {
    if (at > from) {
      segments.push({ text: text.slice(from, at), match: false });
    }
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
    at = haystack.indexOf(needle, from);
  }
  if (from < text.length) {
    segments.push({ text: text.slice(from), match: false });
  }
  return segments;
}

/**
 * Whether a result has detail beyond its first column, which is exactly when the
 * expand chevron shows (native's conditional chevron).
 */
export function resultHasDetail(result: INativeLookupResult): boolean {
  return (result.columns?.length ?? 0) > 1;
}

//#endregion

//#region Styles

const useStyles = makeStyles({
  // The field row: a flex line at the native 32px field height holding either the
  // search Input or the value chip. It paints no surface itself. In the search
  // state the filled-darker Input paints the grey field; in the valued state the
  // chip branch merges valuedField for the same grey surface (two painted
  // surfaces must not nest, so the recipe rides the branch, not this row).
  field: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalXS,
    minHeight: "32px",
  },
  // The valued (chip) state's filled surface, merged onto the field row on that
  // branch only, so the chip and its clear button sit on the same resting grey
  // field the search Input paints for itself. The XS horizontal padding plus the
  // chip's own SNudge padding lands the chip text at the search Input's ~10px
  // inset, so the empty-to-set toggle never shifts the text.
  valuedField: {
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorTransparentStroke}`,
    borderRadius: tokens.borderRadiusMedium,
    ":hover": { border: `${tokens.strokeWidthThin} solid ${tokens.colorTransparentStrokeInteractive}` },
    ":focus-within": { border: `${tokens.strokeWidthThin} solid ${tokens.colorTransparentStrokeInteractive}` },
  },
  input: { flexGrow: 1, minWidth: 0 },
  fieldIcon: { color: tokens.colorNeutralForeground3, fontSize: "20px" },
  // The set value: icon + name link + clear, with a focus-within outline box
  // like the native focused chip.
  chip: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalXS,
    flexGrow: 1,
    minWidth: 0,
    paddingTop: tokens.spacingVerticalSNudge,
    paddingBottom: tokens.spacingVerticalSNudge,
    paddingLeft: tokens.spacingHorizontalSNudge,
    paddingRight: tokens.spacingHorizontalSNudge,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid transparent`,
    ":focus-within": { border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}` },
  },
  chipName: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorBrandForeground2,
  },
  // The set value: entity icon + the name link, so the icon shows on load.
  valueWithIcon: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalXS,
    flexGrow: 1,
    minWidth: 0,
  },
  icon16: { width: "16px", height: "16px", flexShrink: 0 },
  // Flyout surface: white, 4px radius, shadow16, no inner padding (the rows span
  // edge to edge as native does). The width matches the field (positioning
  // matchTargetSize), so no fixed min/max here.
  surface: {
    padding: 0,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
  },
  tree: { maxHeight: "320px", overflowY: "auto", overflowX: "hidden" },
  row: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalS,
    minHeight: "48px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    cursor: "pointer",
  },
  rowActive: { backgroundColor: tokens.colorNeutralBackground5 },
  // Takeover rows match the platform's phone lookup density (48px two-line
  // rows): tighter vertical padding than the flyout, and border-box so the
  // 48px minHeight is the rendered row height (content-box would add the
  // padding on top, which is exactly how the flyout's rows reach 64).
  rowTakeover: {
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    boxSizing: "border-box",
  },
  rowText: { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 },
  rowName: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowSecondary: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  match: { fontWeight: tokens.fontWeightSemibold },
  chevron: { flexShrink: 0, color: tokens.colorNeutralForeground3 },
  message: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  loading: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  footerSpacer: { flexGrow: 1 },
  // The narrow-viewport takeover: a full-window search page replacing the
  // anchored flyout. Fixed inset 0 fills the host window (the iframe in the
  // webresource shell, the whole UCI page in a PCF). Rendered inline inside the
  // FluentProvider (never portaled) so the theme variables resolve in a PCF, the
  // same reason the flyout renders inline. Column flex so the results region
  // grows and the footer pins.
  takeover: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Must clear the model-driven form chrome (header, command bar, side panes)
    // when the control lives in the UCI page as a PCF; a large explicit value.
    zIndex: 1000000,
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  takeoverBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    flexShrink: 0,
  },
  // Horizontal padding for the takeover's chip and search rows, so only the
  // result rows run edge to edge (matching native).
  takeoverSection: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    flexShrink: 0,
  },
  scopeRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: tokens.spacingHorizontalXS,
    rowGap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    flexShrink: 0,
  },
  scopeLabel: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 },
  // The takeover's results region fills the space between the scope row and the
  // pinned footer and scrolls; minHeight 0 lets the flex child shrink so its
  // overflow scrolls rather than pushing the footer off-screen.
  treeTakeover: { flexGrow: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" },
  footerPinned: { flexShrink: 0 },
});

//#endregion

//#region Control

interface INativeLookupFieldState {
  /** In-progress search text; null means "show the selected value, not a search". */
  searchText: string | null;
  open: boolean;
  /** Ids of rows the user expanded to show their extra columns. */
  expanded: ReadonlyArray<string>;
  /** Row under the keyboard/hover cursor, shared by both. */
  activeId: string | null;
}

const refOf = (result: INativeLookupResult): IEntityReference => ({
  id: result.id,
  logicalName: result.logicalName,
  name: result.name,
  iconUrl: result.iconUrl,
});

/**
 * Native-parity single-record lookup: a resting chip with clickthrough, and an
 * inline flyout that opens on focus, loads the lookup view's first page, filters
 * as you type with the match bolded, and expands per-row detail. Values and
 * events only; the smart tier resolves the view, columns, and icons and owns the
 * results Observable. The footer "Advanced" escalates to the native picker.
 */
export class NativeLookupField extends ObserverComponent<
  INativeLookupFieldProps,
  INativeLookupFieldState
> {
  // Tracks the open state synchronously (setState is async) so opening from both
  // the trigger click and the focus event raises the seed search only once.
  private opened = false;
  private readonly inputRef = React.createRef<HTMLInputElement>();
  private focusTimer?: ReturnType<typeof setTimeout>;

  constructor(props: INativeLookupFieldProps) {
    super(props);
    this.state = { searchText: null, open: false, expanded: [], activeId: null };
    this.observe(
      props.selected,
      props.results,
      props.errorMessage,
      props.searching,
      props.searchFailed,
      props.tableLabel,
      props.targets,
      props.activeTarget,
      props.selectedIconUrl,
      props.fullscreenSearch
    );
  }

  private interactive(): boolean {
    return !this.props.disabled && !this.props.readOnly;
  }

  override componentDidUpdate(
    _prevProps: INativeLookupFieldProps,
    prevState: INativeLookupFieldState
  ): void {
    const openedNow = this.state.open && !prevState.open;
    const closedNow = !this.state.open && prevState.open;
    const fullscreen = valueOf(this.props.fullscreenSearch ?? false);
    // Fluent's Popover surface pulls focus to its first control when it opens
    // (tabster's legacy trap, even with trapFocus off). Pull focus back to the
    // input so the user keeps typing (search-as-you-type), and arrow keys drive
    // the active row through aria-activedescendant rather than real focus. The
    // refocus is deferred so it runs after tabster's own post-open focus, and it
    // only fires on the open transition, so typing and hover never re-grab focus.
    // The takeover has no Popover stealing focus and autofocuses its own input,
    // so this only applies to the flyout path.
    if (openedNow && this.interactive() && !fullscreen) {
      clearTimeout(this.focusTimer);
      this.focusTimer = setTimeout(() => this.inputRef.current?.focus(), 0);
    } else if (closedNow && this.interactive() && fullscreen) {
      // Returning from the takeover: put focus back on the field's search input
      // when one is mounted (an empty field), so the field is not left focusless.
      clearTimeout(this.focusTimer);
      this.focusTimer = setTimeout(() => this.inputRef.current?.focus(), 0);
    }
  }

  protected override onUnmount(): void {
    clearTimeout(this.focusTimer);
  }

  /** Opens the flyout and asks the host for the first page, once per open. */
  private ensureOpen(): void {
    if (!this.interactive() || this.opened) {
      return;
    }
    this.opened = true;
    this.setState({ open: true });
    this.props.onSearchTextChanged?.(this.state.searchText ?? "");
  }

  private close(): void {
    this.opened = false;
    this.setState({ open: false, activeId: null });
  }

  private readonly handleOpenChange = (_event: unknown, data: { open: boolean }): void => {
    if (data.open) {
      this.ensureOpen();
    } else {
      this.close();
    }
  };

  private readonly handleInput = (
    _event: React.ChangeEvent<HTMLInputElement>,
    data: { value: string }
  ): void => {
    this.opened = true;
    this.setState({ open: true, searchText: data.value, activeId: null });
    this.props.onSearchTextChanged?.(data.value);
  };

  private readonly select = (result: INativeLookupResult): void => {
    this.opened = false;
    this.setState({ open: false, searchText: null, activeId: null });
    this.props.onChange?.(refOf(result));
  };

  private readonly handleClear = (event: React.MouseEvent): void => {
    // Stop the click from reaching the trigger (which would toggle the flyout).
    event.stopPropagation();
    this.setState({ searchText: null });
    this.props.onChange?.(null);
  };

  /** The takeover's dismiss (X): close without changing the value. */
  private readonly handleCloseTakeover = (): void => {
    this.close();
  };

  private readonly toggleExpand = (id: string): void => {
    this.setState((prev) => ({
      expanded: prev.expanded.includes(id)
        ? prev.expanded.filter((x) => x !== id)
        : [...prev.expanded, id],
    }));
  };

  private moveActive(delta: number): void {
    const results = valueOf(this.props.results);
    if (results.length === 0) {
      return;
    }
    const current = results.findIndex((r) => r.id === this.state.activeId);
    const next = Math.min(Math.max(current + delta, 0), results.length - 1);
    this.ensureOpen();
    this.setState({ activeId: results[next].id });
  }

  private readonly setActive = (id: string): void => {
    if (id !== this.state.activeId) {
      this.setState({ activeId: id });
    }
  };

  private readonly handleKeyDown = (event: React.KeyboardEvent): void => {
    const results = valueOf(this.props.results);
    const active = results.find((r) => r.id === this.state.activeId);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.moveActive(-1);
        break;
      case "Enter":
        if (active) {
          event.preventDefault();
          this.select(active);
        }
        break;
      case "Escape":
        if (this.state.open) {
          event.preventDefault();
          this.close();
        }
        break;
      case "ArrowRight":
        if (active && resultHasDetail(active) && !this.state.expanded.includes(active.id)) {
          event.preventDefault();
          this.toggleExpand(active.id);
        }
        break;
      case "ArrowLeft":
        if (active && this.state.expanded.includes(active.id)) {
          event.preventDefault();
          this.toggleExpand(active.id);
        }
        break;
      default:
        break;
    }
  };

  override render(): React.ReactNode {
    return (
      <Body
        {...this.props}
        state={this.state}
        interactive={this.interactive()}
        inputRef={this.inputRef}
        onInput={this.handleInput}
        onOpenChange={this.handleOpenChange}
        onSelect={this.select}
        onClear={this.handleClear}
        onToggleExpand={this.toggleExpand}
        onSetActive={this.setActive}
        onKeyDown={this.handleKeyDown}
        onCloseTakeover={this.handleCloseTakeover}
      />
    );
  }
}

//#endregion

//#region Render body

type BodyProps = INativeLookupFieldProps & {
  state: INativeLookupFieldState;
  interactive: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onInput: (event: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => void;
  onOpenChange: (event: unknown, data: { open: boolean }) => void;
  onSelect: (result: INativeLookupResult) => void;
  onClear: (event: React.MouseEvent) => void;
  onToggleExpand: (id: string) => void;
  onSetActive: (id: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onCloseTakeover: () => void;
};

const highlight = (text: string, query: string, matchClass: string): React.ReactNode =>
  splitHighlight(text, query).map((segment, index) =>
    segment.match ? (
      <strong key={index} className={matchClass}>
        {segment.text}
      </strong>
    ) : (
      <React.Fragment key={index}>{segment.text}</React.Fragment>
    )
  );

const Body: React.FC<BodyProps> = (props) => {
  const styles = useStyles();
  const { state, disabled, readOnly, interactive } = props;
  const current = props.selected.value;
  const results = valueOf(props.results);
  const searching = valueOf(props.searching ?? false);
  const searchFailed = valueOf(props.searchFailed ?? false);
  const tableLabel = valueOf(props.tableLabel ?? undefined);
  const targets = valueOf(props.targets ?? undefined);
  const activeTarget = valueOf(props.activeTarget ?? undefined);
  const query = state.searchText ?? "";
  const showSearch = state.open || !current;
  // The open search renders as the full-window takeover (native's narrow-viewport
  // lookup page) instead of the anchored flyout when the host asks for it.
  const takeover = interactive && state.open && valueOf(props.fullscreenSearch ?? false);

  // A set value renders as a navigable link (smart tier opens the record),
  // matching native; plain text when no handler is wired or the field is locked.
  const openRecord =
    current && props.onOpenRecord && !disabled
      ? (event: React.MouseEvent): void => {
          event.stopPropagation();
          event.preventDefault();
          props.onOpenRecord!(current);
        }
      : undefined;
  // The selected value's icon: its own (from a fresh pick) or the smart tier's
  // resolved entity icon (for a value loaded from the host with no icon).
  const valueIcon = current?.iconUrl ?? valueOf(props.selectedIconUrl ?? undefined);
  const valueName: React.ReactNode = !current ? null : openRecord ? (
    <Link href="#" onClick={openRecord} className={styles.chipName}>
      {current.name ?? current.id}
    </Link>
  ) : (
    <span className={styles.chipName}>{current.name ?? current.id}</span>
  );
  const valueDisplay: React.ReactNode = !current ? (
    ""
  ) : (
    <span className={styles.valueWithIcon}>
      {valueIcon ? (
        <img src={valueIcon} alt="" aria-hidden className={styles.icon16} onError={hideBrokenImage} />
      ) : null}
      {valueName}
    </span>
  );

  const field = showSearch ? (
    // tabIndex -1 keeps the PopoverTrigger wrapper (which Fluent makes a
    // role="button" tab stop) out of the tab order, so the input is the single
    // tab stop. This div IS the trigger the Popover opens on click.
    <div className={styles.field} tabIndex={-1}>
      <SearchInput
        styles={styles}
        query={query}
        onInput={props.onInput}
        onKeyDown={props.onKeyDown}
        disabled={disabled}
        placeholder={props.placeholder}
        open={state.open}
        activeId={state.activeId}
        // The resting field reads filled-darker to match the model-driven New Look
        // field styling (measured live); the takeover keeps its own filled-lighter.
        appearance="filled-darker"
        // In takeover mode the overlay owns the single search input and its focus;
        // the resting input behind it must not hold the ref or grab focus on mount.
        inputRef={takeover ? undefined : props.inputRef}
        autoFocus={!!current && !takeover}
      />
    </div>
  ) : (
    <div className={mergeClasses(styles.field, styles.valuedField)} tabIndex={-1}>
      <ValueChip styles={styles} valueDisplay={valueDisplay} interactive={interactive} onClear={props.onClear} />
      {interactive ? (
        <Button
          appearance="subtle"
          size="small"
          icon={<SearchRegular className={styles.fieldIcon} />}
          aria-label={kitStrings().searchRecords}
        />
      ) : null}
    </div>
  );

  return (
    <FieldShell {...props} readOnlyText={valueDisplay}>
      <Popover
        // The takeover replaces the flyout, so keep the Popover closed while it is
        // active; the trigger still handles the click that opens the search.
        open={state.open && interactive && !takeover}
        onOpenChange={props.onOpenChange}
        trapFocus={false}
        // Match the field width so the flyout lines up with the control. Render
        // inline (not portaled) so the surface stays inside the themed
        // FluentProvider: in a PCF the default portal mounts outside the provider
        // and loses the theme variables (transparent background, no shadow);
        // inline keeps the theme, and Fluent positions the surface fixed so an
        // overflow ancestor never clips it.
        positioning={{ position: "below", align: "start", matchTargetSize: "width" }}
        inline
        withArrow={false}
      >
        <PopoverTrigger disableButtonEnhancement>{field}</PopoverTrigger>
        <PopoverSurface className={styles.surface}>
          <FlyoutHeader
            styles={styles}
            label={tableLabel}
            targets={targets}
            activeTarget={activeTarget}
            onTargetChange={props.onTargetChange}
          />
          <SurfaceContent
            styles={styles}
            results={results}
            searching={searching}
            searchFailed={searchFailed}
            query={query}
            activeId={state.activeId}
            expanded={state.expanded}
            onSelect={props.onSelect}
            onToggleExpand={props.onToggleExpand}
            onSetActive={props.onSetActive}
            readOnly={!!readOnly}
            onNew={props.onNew}
            onAdvanced={props.onAdvanced}
            treeClassName={styles.tree}
          />
        </PopoverSurface>
      </Popover>
      {takeover ? (
        // Rendered inline inside the FluentProvider tree (never portaled) so the
        // theme variables resolve in a PCF, exactly as the flyout does. role
        // dialog labels the surface; no aria-modal and no focus trap by design
        // (the combobox + aria-activedescendant pattern drives list navigation).
        <div className={styles.takeover} role="dialog" aria-label={props.placeholder ?? kitStrings().searchRecords}>
          <div className={styles.takeoverBar}>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              aria-label={kitStrings().closeSearch}
              onClick={props.onCloseTakeover}
            />
          </div>
          {current ? (
            <div className={styles.takeoverSection}>
              <ValueChip styles={styles} valueDisplay={valueDisplay} interactive={interactive} onClear={props.onClear} />
            </div>
          ) : null}
          <div className={styles.takeoverSection}>
            <div className={styles.field} tabIndex={-1}>
              <SearchInput
                styles={styles}
                query={query}
                onInput={props.onInput}
                onKeyDown={props.onKeyDown}
                disabled={disabled}
                placeholder={props.placeholder}
                open={state.open}
                activeId={state.activeId}
                inputRef={props.inputRef}
                autoFocus
              />
            </div>
          </div>
          <ScopeRow
            styles={styles}
            label={tableLabel}
            targets={targets}
            activeTarget={activeTarget}
            onTargetChange={props.onTargetChange}
          />
          <SurfaceContent
            styles={styles}
            results={results}
            searching={searching}
            searchFailed={searchFailed}
            query={query}
            activeId={state.activeId}
            expanded={state.expanded}
            onSelect={props.onSelect}
            onToggleExpand={props.onToggleExpand}
            onSetActive={props.onSetActive}
            readOnly={!!readOnly}
            onNew={props.onNew}
            onAdvanced={props.onAdvanced}
            treeClassName={styles.treeTakeover}
            footerClassName={styles.footerPinned}
            rowClassName={styles.rowTakeover}
          />
        </div>
      ) : null}
    </FieldShell>
  );
};

/**
 * The search Input element wiring, shared by the flyout (as the field inside the
 * PopoverTrigger) and the takeover. Returns just the Input: the caller supplies
 * the wrapping `styles.field` div, which in the flyout IS the PopoverTrigger's
 * cloned trigger (a DOM element it can attach the open-on-click handler to, which
 * a function component would swallow).
 */
const SearchInput: React.FC<{
  styles: Styles;
  query: string;
  onInput: (event: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  disabled?: boolean;
  placeholder?: string;
  open: boolean;
  activeId: string | null;
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus: boolean;
  /**
   * Input appearance. The resting field passes filled-darker to match the
   * model-driven New Look field styling (measured live). The narrow-viewport
   * takeover keeps its own separately measured filled-lighter (the default), so
   * its search input is left untouched.
   */
  appearance?: InputProps["appearance"];
}> = ({ styles, query, onInput, onKeyDown, disabled, placeholder, open, activeId, inputRef, autoFocus, appearance = "filled-lighter" }) => (
  <Input
    className={styles.input}
    appearance={appearance}
    value={query}
    onChange={onInput}
    onKeyDown={onKeyDown}
    disabled={disabled}
    placeholder={placeholder ?? kitStrings().lookForRecords}
    contentAfter={<SearchRegular className={styles.fieldIcon} aria-hidden />}
    role="combobox"
    aria-expanded={open}
    aria-controls="native-lookup-results"
    aria-activedescendant={activeId ? `native-lookup-row-${activeId}` : undefined}
    input={{ ref: inputRef, autoFocus }}
  />
);

/** The set value's chip: icon + name (link) + clear, shared by the field and the takeover. */
const ValueChip: React.FC<{
  styles: Styles;
  valueDisplay: React.ReactNode;
  interactive: boolean;
  onClear: (event: React.MouseEvent) => void;
}> = ({ styles, valueDisplay, interactive, onClear }) => (
  <div className={styles.chip}>
    {valueDisplay}
    {interactive ? (
      <Button
        appearance="subtle"
        size="small"
        icon={<DismissRegular />}
        aria-label={kitStrings().clearValue}
        onClick={onClear}
      />
    ) : null}
  </div>
);

/**
 * The shared surface content: the loading line, the results tree, and the footer,
 * rendered identically for the flyout and the takeover. Only the tree container
 * class (bounded flyout vs flex-grow takeover) and the footer's pin differ, so
 * the results markup lives in one place.
 */
const SurfaceContent: React.FC<{
  styles: Styles;
  results: INativeLookupResult[];
  searching: boolean;
  searchFailed: boolean;
  query: string;
  activeId: string | null;
  expanded: ReadonlyArray<string>;
  onSelect: (result: INativeLookupResult) => void;
  onToggleExpand: (id: string) => void;
  onSetActive: (id: string) => void;
  readOnly: boolean;
  onNew?: () => void;
  onAdvanced?: () => void;
  treeClassName: string;
  footerClassName?: string;
  rowClassName?: string;
}> = ({
  styles,
  results,
  searching,
  searchFailed,
  query,
  activeId,
  expanded,
  onSelect,
  onToggleExpand,
  onSetActive,
  readOnly,
  onNew,
  onAdvanced,
  treeClassName,
  footerClassName,
  rowClassName,
}) => (
  <>
    {searching ? (
      <div className={styles.loading}>
        <Spinner size="tiny" /> {kitStrings().loading}
      </div>
    ) : null}
    <div id="native-lookup-results" role="tree" aria-label={kitStrings().lookupResults} className={treeClassName}>
      {results.length === 0 && !searching ? (
        <div className={styles.message}>
          {searchFailed ? kitStrings().searchFailed : kitStrings().noRecordsFound}
        </div>
      ) : (
        results.map((result) => (
          <ResultRow
            key={result.id}
            styles={styles}
            result={result}
            query={query}
            active={result.id === activeId}
            expanded={expanded.includes(result.id)}
            onSelect={onSelect}
            onToggleExpand={onToggleExpand}
            onSetActive={onSetActive}
            rowClassName={rowClassName}
          />
        ))
      )}
    </div>
    {readOnly ? null : (
      <FlyoutFooter styles={styles} onNew={onNew} onAdvanced={onAdvanced} footerClassName={footerClassName} />
    )}
  </>
);

/**
 * The takeover's target scope row: one button per target for a polymorphic
 * lookup (the active one distinct), or the single target's label as text. The
 * flyout keeps its Menu-based switcher (FlyoutHeader); this is the takeover's
 * segmented equivalent.
 */
const ScopeRow: React.FC<{
  styles: Styles;
  label?: string;
  targets?: INativeLookupTarget[];
  activeTarget?: string;
  onTargetChange?: (entity: string) => void;
}> = ({ styles, label, targets, activeTarget, onTargetChange }) => {
  const multi = !!targets && targets.length > 1;
  if (multi) {
    return (
      <div className={styles.scopeRow} role="group" aria-label={kitStrings().changeTable}>
        {targets!.map((target) => {
          const active = target.entity === activeTarget;
          return (
            <Button
              key={target.entity}
              appearance={active ? "primary" : "subtle"}
              size="small"
              aria-pressed={active}
              onClick={() => onTargetChange?.(target.entity)}
            >
              {target.label}
            </Button>
          );
        })}
      </div>
    );
  }
  const single = targets?.find((t) => t.entity === activeTarget)?.label ?? label;
  return single ? (
    <div className={styles.scopeRow}>
      <span className={styles.scopeLabel}>{single}</span>
    </div>
  ) : null;
};

type Styles = ReturnType<typeof useStyles>;

const FlyoutHeader: React.FC<{
  styles: Styles;
  label?: string;
  targets?: INativeLookupTarget[];
  activeTarget?: string;
  onTargetChange?: (entity: string) => void;
}> = ({ styles, label, targets, activeTarget, onTargetChange }) => {
  const multi = !!targets && targets.length > 1;
  const activeLabel = targets?.find((t) => t.entity === activeTarget)?.label;
  return (
    <div className={styles.header}>
      <span>{activeLabel ?? label ?? ""}</span>
      {multi ? (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" size="small">
              {activeLabel ?? kitStrings().changeTable}
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {targets!.map((target) => (
                <MenuItem key={target.entity} onClick={() => onTargetChange?.(target.entity)}>
                  {target.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      ) : null}
    </div>
  );
};

const ResultRow: React.FC<{
  styles: Styles;
  result: INativeLookupResult;
  query: string;
  active: boolean;
  expanded: boolean;
  onSelect: (result: INativeLookupResult) => void;
  onToggleExpand: (id: string) => void;
  onSetActive: (id: string) => void;
  /** Extra class merged onto the row (the takeover's denser 48px sizing). */
  rowClassName?: string;
}> = ({ styles, result, query, active, expanded, onSelect, onToggleExpand, onSetActive, rowClassName }) => {
  const hasDetail = resultHasDetail(result);
  const firstColumn = result.columns?.[0];
  const extraColumns = expanded ? result.columns?.slice(1) ?? [] : [];
  return (
    <div
      id={`native-lookup-row-${result.id}`}
      role="treeitem"
      aria-selected={active}
      aria-expanded={hasDetail ? expanded : undefined}
      className={mergeClasses(styles.row, active && styles.rowActive, rowClassName)}
      onClick={() => onSelect(result)}
      onMouseEnter={() => onSetActive(result.id)}
    >
      {result.iconUrl ? (
        <img src={result.iconUrl} alt="" aria-hidden className={styles.icon16} onError={hideBrokenImage} />
      ) : (
        <span className={styles.icon16} aria-hidden />
      )}
      <div className={styles.rowText}>
        <div className={styles.rowName}>{highlight(result.name, query, styles.match)}</div>
        {firstColumn ? (
          <div className={styles.rowSecondary}>{highlight(firstColumn.value, query, styles.match)}</div>
        ) : null}
        {extraColumns.map((column, index) => (
          <div key={index} className={styles.rowSecondary}>
            {highlight(column.value, query, styles.match)}
          </div>
        ))}
      </div>
      {hasDetail ? (
        <Button
          appearance="subtle"
          size="small"
          className={styles.chevron}
          icon={expanded ? <ChevronUpRegular /> : <ChevronDownRegular />}
          aria-label={kitStrings().moreDetailsForRecord(result.name)}
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand(result.id);
          }}
        />
      ) : null}
    </div>
  );
};

const FlyoutFooter: React.FC<{
  styles: Styles;
  onNew?: () => void;
  onAdvanced?: () => void;
  /** Extra class merged onto the footer (the takeover pins it; the flyout omits it). */
  footerClassName?: string;
}> = ({ styles, onNew, onAdvanced, footerClassName }) => {
  if (!onNew && !onAdvanced) {
    return null;
  }
  return (
    <div className={footerClassName ? mergeClasses(styles.footer, footerClassName) : styles.footer}>
      {onNew ? (
        <Button appearance="subtle" size="small" icon={<AddRegular />} onClick={onNew}>
          {kitStrings().newLabel}
        </Button>
      ) : (
        <span className={styles.footerSpacer} />
      )}
      {onAdvanced ? (
        <Link
          href="#"
          onClick={(event) => {
            event.preventDefault();
            onAdvanced();
          }}
        >
          {kitStrings().advanced}
        </Link>
      ) : null}
    </div>
  );
};

//#endregion
