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

/**
 * Pagination control (G-01 / N-04), presentational: it displays the
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
  /** Total matching records, for the "X–Y of N" label (rich). */
  totalRecordCount?: OrObservable<number | null>;
  /** Page size, for computing the X–Y range. */
  pageSize?: number;
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
    this.observe(props.page, props.pageCount, props.hasNextPage, props.totalRecordCount, props.disabled);
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
  const disabled = valueOf(props.disabled ?? false);

  const richMode = !!props.onGoToPage && typeof pageCount === "number" && pageCount > 0;
  // Next is available when there's a known later page, or (unknown count) the
  // host says a next page exists.
  const canNext =
    typeof pageCount === "number" ? page < pageCount : hasNext ?? false;
  const canPrev = page > 1;

  if (!richMode) {
    // Simple forward-cookie rendering (unchanged behavior).
    return (
      <div className={styles.root}>
        <Button
          appearance="subtle"
          icon={<ChevronLeftRegular />}
          aria-label="Previous page"
          disabled={disabled || !canPrev}
          onClick={props.onPrevious}
        />
        <span className={styles.label} aria-label="Current page">
          Page {page}
        </span>
        <Button
          appearance="subtle"
          icon={<ChevronRightRegular />}
          aria-label="Next page"
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

  const range = (() => {
    if (typeof total !== "number" || !props.pageSize) {
      return undefined;
    }
    const from = total === 0 ? 0 : (page - 1) * props.pageSize + 1;
    const to = Math.min(page * props.pageSize, total);
    return `${from}–${to} of ${total}`;
  })();

  return (
    <div className={styles.root}>
      {range ? (
        <span className={styles.rangeLabel} aria-label="Record range">
          {range}
        </span>
      ) : null}
      <Button
        appearance="subtle"
        icon={<ChevronDoubleLeftRegular />}
        aria-label="First page"
        disabled={disabled || !canPrev}
        onClick={props.onFirst}
      />
      <Button
        appearance="subtle"
        icon={<ChevronLeftRegular />}
        aria-label="Previous page"
        disabled={disabled || !canPrev}
        onClick={props.onPrevious}
      />
      <Dropdown
        className={styles.jump}
        aria-label="Jump to page"
        value={`Page ${page} of ${count}`}
        selectedOptions={[String(page)]}
        onOptionSelect={handleJump}
        disabled={disabled}
      >
        {Array.from({ length: count }, (_unused, index) => index + 1).map((n) => (
          <Option key={n} value={String(n)} text={`Page ${n}`}>
            {`Page ${n}`}
          </Option>
        ))}
      </Dropdown>
      <Button
        appearance="subtle"
        icon={<ChevronRightRegular />}
        aria-label="Next page"
        disabled={disabled || !canNext}
        onClick={props.onNext}
      />
      <Button
        appearance="subtle"
        icon={<ChevronDoubleRightRegular />}
        aria-label="Last page"
        disabled={disabled || page >= count}
        onClick={props.onLast}
      />
    </div>
  );
};
