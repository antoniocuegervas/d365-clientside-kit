import * as React from "react";
import { Button, Dropdown, Option, makeStyles, tokens } from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  ChevronDoubleLeftRegular,
  ChevronDoubleRightRegular,
} from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type OrObservable } from "../../reactivity/Observable";
import { kitStrings } from "../../localization/kitStrings";

/**
 * Pagination control, presentational: it displays the
 * supplied page state and raises intent. Two renderings:
 *
 * - **simple** (default): previous / "Page N" / next, for Dataverse's
 *   forward-cookie paging where random access isn't possible.
 * - **rich**: first / previous / jump-to-page combobox / next / last plus an
 *   optional "X–Y of N" label, when the host drives server-side `page`/`count`
 *   paging and supplies a `pageCount`. Enabled when `onGoToPage` is provided
 *   and `pageCount` is a known number.
 */
export interface IPaginationProps {
  /** 1-based current page number. */
  page: OrObservable<number>;
  /** Total page count when known; null/undefined when unknown (forward-cookie/over-cap). */
  pageCount?: OrObservable<number | null>;
  /** Whether a next page is available, used when `pageCount` is unknown. */
  hasNextPage?: OrObservable<boolean>;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Jump to the first page (rich). */
  onFirst?: () => void;
  /** Jump to the last page (rich). */
  onLast?: () => void;
  /** Jump to an arbitrary 1-based page (rich), enables the combobox. */
  onGoToPage?: (page: number) => void;
  /** Total matching records, appended as "of N" when known. */
  totalRecordCount?: OrObservable<number | null>;
  /** Page size, for computing the X–Y range. */
  pageSize?: number;
  /**
   * Records on the current page. Makes the range's upper bound exact on a short
   * last page when the total is unknown; without it the range assumes a full page.
   */
  pageRecordCount?: OrObservable<number | null>;
  disabled?: OrObservable<boolean>;
}

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalS,
    justifyContent: "flex-end",
  },
  label: { color: tokens.colorNeutralForeground3, minWidth: "64px", textAlign: "center" },
  rangeLabel: { color: tokens.colorNeutralForeground3, marginRight: tokens.spacingHorizontalS },
  jump: { minWidth: "96px" },
});

export class Pagination extends ObserverComponent<IPaginationProps> {
  constructor(props: IPaginationProps) {
    super(props);
    this.observe(
      props.page,
      props.pageCount,
      props.hasNextPage,
      props.totalRecordCount,
      props.pageRecordCount,
      props.disabled
    );
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IPaginationProps> = (props) => {
  const styles = useStyles();
  const page = valueOf(props.page);
  const pageCount = valueOf(props.pageCount ?? null);
  const hasNext = props.hasNextPage !== undefined ? valueOf(props.hasNextPage) : null;
  const total = valueOf(props.totalRecordCount ?? null);
  const pageRecordCount = valueOf(props.pageRecordCount ?? null);
  const disabled = valueOf(props.disabled ?? false);
  const strings = kitStrings();

  const richMode = !!props.onGoToPage && typeof pageCount === "number" && pageCount > 0;
  // Next is available when there's a known later page, or (unknown count) the
  // host says a next page exists.
  const canNext =
    typeof pageCount === "number" ? page < pageCount : hasNext ?? false;
  const canPrev = page > 1;

  // Range label, shown in BOTH modes. The page and page size are always known, so
  // a range ("Showing records 51–100") can show even with no total; the total is
  // appended as "of N" only when known. pageRecordCount makes the upper bound
  // exact on a short last page, otherwise a full page is assumed. The prose
  // comes from the kit strings (configureKitStrings overrides them at boot).
  const range = ((): string | undefined => {
    if (!props.pageSize) {
      return undefined;
    }
    const size = props.pageSize;
    const knownTotal = typeof total === "number";
    if ((knownTotal && total === 0) || pageRecordCount === 0) {
      return undefined;
    }
    const from = (page - 1) * size + 1;
    const to = knownTotal
      ? Math.min(page * size, total as number)
      : typeof pageRecordCount === "number"
        ? from + pageRecordCount - 1
        : page * size;
    return knownTotal
      ? strings.showingRecordsOfTotal(from, to, total as number)
      : strings.showingRecords(from, to);
  })();

  if (!richMode) {
    // Simple forward-cookie rendering: range label plus prev / Page N / next.
    return (
      <div className={styles.root}>
        {range ? (
          <span className={styles.rangeLabel} aria-label={strings.recordRange}>
            {range}
          </span>
        ) : null}
        <Button
          appearance="subtle"
          icon={<ChevronLeftRegular />}
          aria-label={strings.previousPage}
          disabled={disabled || !canPrev}
          onClick={props.onPrevious}
        />
        <span className={styles.label} aria-label={strings.currentPage}>
          {strings.pageN(page)}
        </span>
        <Button
          appearance="subtle"
          icon={<ChevronRightRegular />}
          aria-label={strings.nextPage}
          disabled={disabled || !canNext}
          onClick={props.onNext}
        />
      </div>
    );
  }

  const count = pageCount as number;
  const handleJump = (_event: unknown, data: { optionValue?: string }): void => {
    if (data.optionValue) {
      props.onGoToPage?.(Number(data.optionValue));
    }
  };

  return (
    <div className={styles.root}>
      {range ? (
        <span className={styles.rangeLabel} aria-label={strings.recordRange}>
          {range}
        </span>
      ) : null}
      <Button
        appearance="subtle"
        icon={<ChevronDoubleLeftRegular />}
        aria-label={strings.firstPage}
        disabled={disabled || !canPrev}
        onClick={props.onFirst}
      />
      <Button
        appearance="subtle"
        icon={<ChevronLeftRegular />}
        aria-label={strings.previousPage}
        disabled={disabled || !canPrev}
        onClick={props.onPrevious}
      />
      <Dropdown
        className={styles.jump}
        aria-label={strings.jumpToPage}
        value={strings.pageNOfM(page, count)}
        selectedOptions={[String(page)]}
        onOptionSelect={handleJump}
        disabled={disabled}
      >
        {Array.from({ length: count }, (_unused, index) => index + 1).map((n) => (
          <Option key={n} value={String(n)} text={strings.pageN(n)}>
            {strings.pageN(n)}
          </Option>
        ))}
      </Dropdown>
      <Button
        appearance="subtle"
        icon={<ChevronRightRegular />}
        aria-label={strings.nextPage}
        disabled={disabled || !canNext}
        onClick={props.onNext}
      />
      <Button
        appearance="subtle"
        icon={<ChevronDoubleRightRegular />}
        aria-label={strings.lastPage}
        disabled={disabled || page >= count}
        onClick={props.onLast}
      />
    </div>
  );
};
