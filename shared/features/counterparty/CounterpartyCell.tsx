import * as React from "react";
import {
  Link,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { IGridColumn, IGridRow } from "../../controls/presentational/DataGrid";
import {
  COUNTERPARTY_KEY,
  type ICounterpartyInfo,
  type ICounterpartyParty,
} from "./counterparty";

/** Navigates to a party's underlying account/contact record. */
export type NavigateToParty = (entity: string, id: string) => void;

/** Opens the activity a grid row represents (its entityName + recordId). */
export type OpenActivity = (row: IGridRow) => void;

const useStyles = makeStyles({
  cell: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  // Subject as a single-line link that clips like the other cells.
  subjectLink: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  // The lead party's role, inline after the name when it's the only party.
  roleInline: { color: tokens.colorNeutralForeground3, marginLeft: tokens.spacingHorizontalXS },
  more: { color: tokens.colorNeutralForeground3, cursor: "default", marginLeft: tokens.spacingHorizontalXXS },
  surface: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS, padding: tokens.spacingVerticalS },
  party: { display: "flex", columnGap: tokens.spacingHorizontalM, alignItems: "baseline" },
  role: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/** A party as a clickable link (when it has a record) or plain text. */
const PartyLink: React.FC<{ party: ICounterpartyParty; onNavigate: NavigateToParty }> = ({
  party,
  onNavigate,
}) => {
  if (!party.entity || !party.id) {
    return <span title={party.name}>{party.name}</span>;
  }
  return (
    <Link
      href="#"
      title={party.name}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onNavigate(party.entity, party.id);
      }}
    >
      {party.name}
    </Link>
  );
};

// Open the overflow popover on hover only after a short delay, so casually
// sweeping the mouse across the grid does not flash it open on every cell. A
// close grace lets the pointer travel from the "(+N more)" trigger into the
// surface to click a party; a click opens it immediately. Fluent's Popover has a
// mouse-leave delay but no open delay, so the open timing is controlled here.
const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 300;

const MoreParties: React.FC<{
  parties: ICounterpartyParty[];
  restCount: number;
  onNavigate: NavigateToParty;
}> = ({ parties, restCount, onNavigate }) => {
  const styles = useStyles();
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(
    () => () => {
      if (openTimer.current) {
        clearTimeout(openTimer.current);
      }
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    },
    []
  );
  const clearTimers = (): void => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = undefined;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  };
  const scheduleOpen = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
    if (open || openTimer.current) {
      return;
    }
    openTimer.current = setTimeout(() => {
      openTimer.current = undefined;
      setOpen(true);
    }, OPEN_DELAY_MS);
  };
  const scheduleClose = (): void => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = undefined;
    }
    closeTimer.current = setTimeout(() => {
      closeTimer.current = undefined;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };
  const keepOpen = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  };
  return (
    <Popover
      open={open}
      onOpenChange={(_event, data) => {
        clearTimers();
        setOpen(data.open);
      }}
      withArrow
      positioning="below-start"
      size="small"
    >
      <PopoverTrigger disableButtonEnhancement>
        <span
          className={styles.more}
          onClick={(event) => event.stopPropagation()}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
        >
          {` (+${restCount} more)`}
        </span>
      </PopoverTrigger>
      <PopoverSurface>
        <div
          className={styles.surface}
          onClick={(event) => event.stopPropagation()}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
        >
          {parties.map((party) => (
            <div key={`${party.entity}:${party.id}`} className={styles.party}>
              <PartyLink party={party} onNavigate={onNavigate} />
              <span className={styles.role}>{party.role}</span>
            </div>
          ))}
        </div>
      </PopoverSurface>
    </Popover>
  );
};

/**
 * The Counterparty cell: the lead external party as a navigable link, plus a
 * "(+N more)" that opens on hover after a short delay and lists every party
 * (each clickable) with its role, so the parties hidden by a narrow column are
 * still reachable. A lone party carries its role inline.
 */
const CounterpartyCell: React.FC<{ info: ICounterpartyInfo; onNavigate: NavigateToParty }> = ({
  info,
  onNavigate,
}) => {
  const styles = useStyles();
  const parties = info?.parties ?? [];
  if (parties.length === 0) {
    return null;
  }
  const [lead, ...rest] = parties;
  return (
    <span className={styles.cell}>
      <PartyLink party={lead} onNavigate={onNavigate} />
      {rest.length === 0 ? (
        // The lone party carries its role inline; no overflow to reveal.
        lead.role ? <span className={styles.roleInline}>{`· ${lead.role}`}</span> : null
      ) : (
        <MoreParties parties={parties} restCount={rest.length} onNavigate={onNavigate} />
      )}
    </span>
  );
};

/**
 * The synthesized columns appended after a surface's own columns. The
 * Counterparty cell needs a way to open a party's record, so navigation is
 * passed in (each surface wires its own openForm); the kit grid stays unaware.
 */
export function counterpartyColumns(onNavigate: NavigateToParty): IGridColumn[] {
  return [
    {
      key: COUNTERPARTY_KEY,
      name: "Counterparty",
      width: 260,
      onRender: (row: IGridRow) => (
        <CounterpartyCell info={row[COUNTERPARTY_KEY] as ICounterpartyInfo} onNavigate={onNavigate} />
      ),
      // Sort by the summary text, since the cell renders a node, not a value.
      comparator: (a, b) => summaryOf(a).localeCompare(summaryOf(b)),
    },
  ];
}

const summaryOf = (row: IGridRow): string =>
  String((row[COUNTERPARTY_KEY] as ICounterpartyInfo | undefined)?.counterparty ?? "");

/** The Subject as a link to its activity (plain text when the row has no record). */
const SubjectLink: React.FC<{ row: IGridRow; field: string; onOpen: OpenActivity }> = ({
  row,
  field,
  onOpen,
}) => {
  const styles = useStyles();
  const text = String(row[field] ?? "");
  if (!row.entityName || !row.recordId) {
    return (
      <span className={styles.cell} title={text}>
        {text}
      </span>
    );
  }
  return (
    <Link
      className={styles.subjectLink}
      title={text}
      href="#"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(row);
      }}
    >
      {text}
    </Link>
  );
};

/**
 * A grid column that renders its value as a link opening the row's activity,
 * the native subgrid behaviour where the primary field is the way in (so a plain
 * row click can select instead of navigate).
 */
export function subjectLinkColumn(
  key: string,
  name: string,
  width: number,
  onOpen: OpenActivity
): IGridColumn {
  return {
    key,
    name,
    width,
    onRender: (row: IGridRow) => <SubjectLink row={row} field={key} onOpen={onOpen} />,
  };
}
