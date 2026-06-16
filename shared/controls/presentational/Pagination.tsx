import * as React from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { ChevronLeftRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type OrObservable } from "../../reactivity/Observable";

/**
 * Pagination control (G-01), previous/next over server-side pages.
 * Presentational: it displays the supplied page state and raises intent.
 * Dataverse paging is forward-cookie based, so it offers prev/next (not random
 * access); the smart grid caches visited pages so "previous" is instant.
 */
export interface IPaginationProps {
  /** 1-based current page number. */
  page: OrObservable<number>;
  /** Whether a next page is available (a nextLink exists). */
  hasNextPage: OrObservable<boolean>;
  onPrevious?: () => void;
  onNext?: () => void;
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
});

export class Pagination extends ObserverComponent<IPaginationProps> {
  constructor(props: IPaginationProps) {
    super(props);
    this.observe(props.page, props.hasNextPage, props.disabled);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IPaginationProps> = (props) => {
  const styles = useStyles();
  const page = valueOf(props.page);
  const hasNext = valueOf(props.hasNextPage);
  const disabled = valueOf(props.disabled ?? false);
  return (
    <div className={styles.root}>
      <Button
        appearance="subtle"
        icon={<ChevronLeftRegular />}
        aria-label="Previous page"
        disabled={disabled || page <= 1}
        onClick={props.onPrevious}
      />
      <span className={styles.label} aria-label="Current page">
        Page {page}
      </span>
      <Button
        appearance="subtle"
        icon={<ChevronRightRegular />}
        aria-label="Next page"
        disabled={disabled || !hasNext}
        onClick={props.onNext}
      />
    </div>
  );
};
