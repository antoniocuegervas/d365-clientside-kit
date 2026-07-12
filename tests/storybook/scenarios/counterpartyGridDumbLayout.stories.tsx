import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import {
  DataGrid,
  type IGridColumn,
  type IGridRow,
} from "../../../shared/controls/presentational/DataGrid";
import {
  counterpartyColumns,
  subjectLinkColumn,
} from "../../../shared/features/counterparty/CounterpartyCell";
import {
  COUNTERPARTY_KEY,
  type ICounterpartyInfo,
  type ICounterpartyParty,
} from "../../../shared/features/counterparty/counterparty";

/**
 * An activity list with one extra column: who is on the OTHER end of each
 * activity (the external company or person), and in what role. An activity can
 * have many parties, and each party can be a different kind of record (an
 * account, a contact, a user), so no single saved view can show this. The kit
 * resolves them all and renders one cell: the lead party as a link, its role
 * inline, and a "(+N more)" hover popover for the rest. The "Show code" panel
 * has the three lines you copy to reuse it on any grid.
 */
const meta: Meta = {
  title: "Sample Patterns/Counterparty Activities",
  parameters: {
    docs: {
      description: {
        component:
          "A reusable custom-format column for a many-valued, mixed-type link. Each activity " +
          "points at several parties of different entity types (account / contact / user); this " +
          "column resolves them in one query and shows the external one as a link, with the others " +
          "under a '(+N more)' popover. An internal-only activity (no external party) shows blank.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    // Wide enough that every column, Counterparty included, is visible without
    // the grid having to scroll horizontally.
    minWidth: "960px",
    padding: tokens.spacingHorizontalL,
    boxSizing: "border-box",
    // Mirror the real app's hosting: the shell pins body overflow hidden and the
    // page owns the scroll, so the story reproduces the same vertical space
    // pressure the live app is under.
    height: "100vh",
    overflowY: "auto",
  },
  caption: { color: tokens.colorNeutralForeground3 },
});

const party = (name: string, role: string, entity = "contact"): ICounterpartyParty => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  entity,
  name,
  role,
});

const info = (counterparty: string, parties: ICounterpartyParty[]): ICounterpartyInfo => ({
  counterparty,
  role: parties[0]?.role ?? "",
  parties,
});

// Fixed rows covering the cases the cell handles: a single linked party with its
// role inline, a multi-party "(+N more)" popover, a three-party case, and an
// internal-only blank. entityName/recordId let the Subject render as a link.
const rows: IGridRow[] = [
  {
    key: "call-1",
    recordId: "call-1",
    entityName: "phonecall",
    type: "Phone Call",
    subject: "Follow up on quote",
    regarding: "Contoso Ltd",
    [COUNTERPARTY_KEY]: info("Yvonne McKay", [party("Yvonne McKay", "To Recipient")]),
  },
  {
    key: "email-1",
    recordId: "email-1",
    entityName: "email",
    type: "Email",
    subject: "Renewal terms and pricing",
    regarding: "Fabrikam Inc",
    [COUNTERPARTY_KEY]: info("Patrick Sands (+2 more)", [
      party("Patrick Sands", "Sender"),
      party("Susanna Stubberod", "CC Recipient"),
      party("Maria Campbell", "CC Recipient"),
    ]),
  },
  {
    key: "appt-1",
    recordId: "appt-1",
    entityName: "appointment",
    type: "Appointment",
    subject: "Contract review meeting",
    regarding: "Adventure Works",
    [COUNTERPARTY_KEY]: info("Adventure Works", [party("Adventure Works", "Required attendee", "account")]),
  },
  {
    key: "task-1",
    recordId: "task-1",
    entityName: "task",
    type: "Task",
    subject: "Internal handoff to manager",
    regarding: "Contoso Ltd",
    [COUNTERPARTY_KEY]: info("", []),
  },
];

class CounterpartyGridDemo extends ObserverComponent {
  private readonly selectedKey = new Observable<string | null>(null);
  private readonly note = new Observable<string | null>(null);

  constructor(props: object) {
    super(props);
    this.observe(this.selectedKey, this.note);
  }

  private readonly onOpen = (row: IGridRow): void => {
    this.note.value = `Would open ${String(row.type)}: ${String(row.subject)}.`;
  };

  private readonly onNavigate = (entity: string): void => {
    this.note.value = `Would open the ${entity} record.`;
  };

  override render(): React.ReactNode {
    return (
      <Body
        selectedKey={this.selectedKey}
        note={this.note}
        onOpen={this.onOpen}
        onNavigate={this.onNavigate}
      />
    );
  }
}

const Body: React.FC<{
  selectedKey: Observable<string | null>;
  note: Observable<string | null>;
  onOpen: (row: IGridRow) => void;
  onNavigate: (entity: string, id: string) => void;
}> = (props) => {
  const styles = useStyles();
  const columns: IGridColumn[] = [
    { key: "type", name: "Activity Type", width: 150 },
    subjectLinkColumn("subject", "Subject", 260, props.onOpen),
    { key: "regarding", name: "Regarding", width: 200 },
    ...counterpartyColumns(props.onNavigate),
  ];
  return (
    <div className={styles.page}>
      <Title3>Account Activities, with Counterparty</Title3>
      <DataGrid
        columns={columns}
        rows={rows}
        emptyMessage="No activities."
        selectedKey={props.selectedKey}
        onRowClick={(row) => (props.selectedKey.value = row.key)}
        onItemInvoked={props.onOpen}
      />
      <Text className={styles.caption}>
        The Subject opens the activity; a row click just selects it. The Counterparty cell links the
        lead party, shows its role inline, and the email's "(+2 more)" opens a popover listing every
        party. The internal-only task has no counterparty.
      </Text>
      {props.note.value ? <Text className={styles.caption}>{props.note.value}</Text> : null}
    </div>
  );
};

export const Layout: Story = {
  name: "Counterparty activity list",
  render: () => <CounterpartyGridDemo />,
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `// A "counterparty" column is a custom-format column over a many-valued, mixed-type
// link: each activity is tied to several parties, and a party can be a different
// kind of record (account, contact, user). No single saved view can show that, so
// the kit resolves the parties and synthesizes one cell. Reuse it in three steps.

// 1. Append the column to your grid. onNavigate opens a party's underlying record.
const columns = [
  { key: "subject", name: "Subject", width: 260 },
  ...counterpartyColumns((entity, id) => context.navigation.openForm(entity, id)),
];

// 2. After loading a page of activities, resolve every party in ONE query (no
//    per-row lookups) and write the result onto each row.
const byActivity = await resolveCounterparties(context, rows.map((r) => r.recordId));
const filled = rows.map((r) => applyCounterparty(r, byActivity.get(r.recordId)));

// 3. Render. The cell links the lead party, shows its role inline, and reveals the
//    rest under a "(+N more)" hover popover; an internal-only activity stays blank.
<DataGrid columns={columns} rows={filled} />;`,
      },
    },
  },
};
