import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import type { IActivityTypeInfo } from "../../../shared/context/IViewModelContext";
import type { IGridColumn, IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { CounterpartyGridView } from "../../../shared/features/counterparty/CounterpartyGridView";
import { ActivityCommandBar } from "../../../shared/features/counterparty/ActivityCommandBar";
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
 * The flagship counterparty grid, its REAL view mounted on fixtures (the sibling
 * "Counterparty Activities" story rebuilds a plain DataGrid; this runs the shared
 * CounterpartyGridView the sample app and the dataset PCF both render). It carries
 * the responsive switch: the view watches its own container width and, below
 * 560px, collapses each row into a persona card. These stories pin today's grid
 * mode at full width, the persona mode inside a narrow container, and the
 * selected-row command bar, the states later mobile work will touch.
 */
const meta: Meta = {
  title: "Sample Patterns/Counterparty Grid",
  parameters: {
    docs: {
      description: {
        component:
          "The shared CounterpartyGridView (columns, rows, a live search, and an ActivityCommandBar) " +
          "over fixture data, the same view the counterparty sample app and the dataset PCF mount. " +
          "It measures its own width and swaps to a persona card list on a narrow host; the Narrow " +
          "container story pins that card mode at any viewport by fixing the wrapper width.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const useStyles = makeStyles({
  note: {
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    paddingBottom: tokens.spacingVerticalL,
  },
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

// Rows shaped like the sibling scenario: an activitypointer row (type, subject,
// regarding, due) plus the synthesized Counterparty cell (an ICounterpartyInfo of
// parties and a lead role). The cases cover a lone linked party with its role
// inline, a multi-party "(+N more)", an account party, and an internal-only blank.
const activityRows: IGridRow[] = [
  {
    key: "call-1",
    recordId: "call-1",
    entityName: "phonecall",
    type: "Phone Call",
    subject: "Follow up on quote",
    regarding: "Contoso Ltd",
    due: "2026-06-13",
    [COUNTERPARTY_KEY]: info("Yvonne McKay", [party("Yvonne McKay", "To Recipient")]),
  },
  {
    key: "email-1",
    recordId: "email-1",
    entityName: "email",
    type: "Email",
    subject: "Renewal terms and pricing",
    regarding: "Fabrikam Inc",
    due: "2026-06-15",
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
    due: "2026-06-18",
    [COUNTERPARTY_KEY]: info("Adventure Works", [
      party("Adventure Works", "Required attendee", "account"),
    ]),
  },
  {
    key: "task-1",
    recordId: "task-1",
    entityName: "task",
    type: "Task",
    subject: "Internal handoff to manager",
    regarding: "Contoso Ltd",
    due: "2026-06-12",
    [COUNTERPARTY_KEY]: info("", []),
  },
];

const activityTypes: IActivityTypeInfo[] = [
  { logicalName: "email", displayName: "Email", objectTypeCode: 4202 },
  { logicalName: "phonecall", displayName: "Phone Call", objectTypeCode: 4210 },
  { logicalName: "appointment", displayName: "Appointment", objectTypeCode: 4201 },
  { logicalName: "task", displayName: "Task", objectTypeCode: 4212 },
];

/**
 * The story plays the ViewModel: it owns the selection, the live-search text, and
 * builds the columns (the Subject and Counterparty cells need open/navigate
 * handlers). A note stands in for the openForm the real ViewModel would run.
 */
class CounterpartyGridDemo extends ObserverComponent<{ initialSelection?: string | null }> {
  private readonly selectedKey: Observable<string | null>;
  private readonly searchText = new Observable<string>("");
  private readonly note = new Observable<string | null>(null);
  private readonly columns: IGridColumn[];

  constructor(props: { initialSelection?: string | null }) {
    super(props);
    this.selectedKey = new Observable<string | null>(props.initialSelection ?? null);
    this.columns = [
      { key: "type", name: "Activity Type", width: 140 },
      subjectLinkColumn("subject", "Subject", 260, this.onOpen),
      { key: "regarding", name: "Regarding", width: 180 },
      { key: "due", name: "Due", width: 120 },
      ...counterpartyColumns(this.onNavigate),
    ];
    this.observe(this.selectedKey, this.searchText, this.note);
  }

  private readonly onOpen = (row: IGridRow): void => {
    this.note.value = `Would open ${String(row.type)}: ${String(row.subject)}.`;
  };

  private readonly onNavigate = (entity: string): void => {
    this.note.value = `Would open the ${entity} record.`;
  };

  private readonly onCreate = (logicalName: string): void => {
    this.note.value = `Would create a new ${logicalName}.`;
  };

  private readonly onEdit = (): void => {
    const key = this.selectedKey.value;
    const row = activityRows.find((candidate) => candidate.key === key);
    this.note.value = row ? `Would open ${String(row.type)}: ${String(row.subject)}.` : null;
  };

  private readonly onRefresh = (): void => {
    this.searchText.value = "";
    this.selectedKey.value = null;
    this.note.value = null;
  };

  override render(): React.ReactNode {
    return (
      <Body
        columns={this.columns}
        selectedKey={this.selectedKey}
        searchText={this.searchText}
        note={this.note}
        onOpen={this.onOpen}
        onCreate={this.onCreate}
        onEdit={this.onEdit}
        onRefresh={this.onRefresh}
      />
    );
  }
}

const Body: React.FC<{
  columns: IGridColumn[];
  selectedKey: Observable<string | null>;
  searchText: Observable<string>;
  note: Observable<string | null>;
  onOpen: (row: IGridRow) => void;
  onCreate: (logicalName: string) => void;
  onEdit: () => void;
  onRefresh: () => void;
}> = (props) => {
  const styles = useStyles();
  return (
    <>
      <CounterpartyGridView
        title="Account Activities"
        columns={props.columns}
        rows={activityRows}
        onOpenRow={props.onOpen}
        selectedKey={props.selectedKey}
        searchText={props.searchText}
        commandBar={
          <ActivityCommandBar
            selectedKey={props.selectedKey}
            activityTypes={activityTypes}
            onCreate={props.onCreate}
            onEdit={props.onEdit}
            onRefresh={props.onRefresh}
          />
        }
      />
      {props.note.value ? <Caption1 className={styles.note}>{props.note.value}</Caption1> : null}
    </>
  );
};

export const Layout: Story = {
  name: "Grid with command bar and search",
  render: () => (
    // Mirror the webresource hosting: the shell pins body overflow hidden and a
    // bounded region owns the scroll, so the story reproduces the same vertical
    // space pressure the live app is under.
    <div style={{ height: "100vh", overflowY: "auto", overflowX: "hidden" }}>
      <CounterpartyGridDemo />
    </div>
  ),
};

export const NarrowContainer: Story = {
  name: "Narrow container (persona cards)",
  render: () => (
    // The view swaps to a persona card list below 560px, so a fixed 480px wrapper
    // pins the card mode at any viewport (the mobile-relevant state).
    <div style={{ width: 480 }}>
      <CounterpartyGridDemo />
    </div>
  ),
};

export const RowSelected: Story = {
  name: "Row selected (command bar shows Edit)",
  render: () => <CounterpartyGridDemo initialSelection="email-1" />,
};
