/**
 * Pure fixture data for Storybook, NO CRM mocks, no context, no Xrm.
 * If a story needs something from Dataverse, that something arrives here as
 * a plain value, exactly like a ViewModel would supply it.
 */
import type { IEntityReference, IOptionItem } from "../../shared/utils/EntityModel";
import type { IGridColumn, IGridRow } from "../../shared/controls/presentational/DataGrid";
import type { ITreeNode } from "../../shared/controls/presentational/SelectionTree";
import type { IPersonaItem } from "../../shared/controls/presentational/PersonaList";

export const industryOptions: IOptionItem[] = [
  { value: 1, label: "Accounting" },
  { value: 2, label: "Agriculture and Non-petrol Natural Resource Extraction" },
  { value: 3, label: "Broadcasting Printing and Publishing" },
  { value: 4, label: "Building Supply Retail" },
  { value: 5, label: "Business Services" },
  { value: 6, label: "Consulting" },
  { value: 7, label: "Consumer Services" },
];

export const ratingOptions: IOptionItem[] = [
  { value: 1, label: "Hot" },
  { value: 2, label: "Warm" },
  { value: 3, label: "Cold" },
];

export const contactMethodOptions: IOptionItem[] = [
  { value: 1, label: "Any" },
  { value: 2, label: "Email" },
  { value: 3, label: "Phone" },
  { value: 4, label: "Fax" },
  { value: 5, label: "Mail" },
];

export const territoryRefs: IEntityReference[] = [
  { id: "71700000-0000-0000-0000-000000000001", logicalName: "territory", name: "EMEA" },
  { id: "71700000-0000-0000-0000-000000000002", logicalName: "territory", name: "Americas" },
  { id: "71700000-0000-0000-0000-000000000003", logicalName: "territory", name: "APAC" },
];

export const accountRefs: IEntityReference[] = [
  { id: "a1a00000-0000-0000-0000-000000000001", logicalName: "account", name: "Contoso Ltd" },
  { id: "a1a00000-0000-0000-0000-000000000002", logicalName: "account", name: "Fabrikam Inc" },
  { id: "a1a00000-0000-0000-0000-000000000003", logicalName: "account", name: "Adventure Works" },
  { id: "a1a00000-0000-0000-0000-000000000004", logicalName: "account", name: "Northwind Traders" },
];

export const contactRefs: IEntityReference[] = [
  { id: "c1c00000-0000-0000-0000-000000000001", logicalName: "contact", name: "Yvonne McKay" },
  { id: "c1c00000-0000-0000-0000-000000000002", logicalName: "contact", name: "Patrick Sands" },
  { id: "c1c00000-0000-0000-0000-000000000003", logicalName: "contact", name: "Susanna Stubberod" },
];

export const accountColumns: IGridColumn[] = [
  { key: "name", name: "Account Name", width: 240 },
  { key: "city", name: "City", width: 140 },
  { key: "phone", name: "Main Phone", width: 140 },
  { key: "revenue", name: "Annual Revenue", width: 140 },
];

export const accountRows: IGridRow[] = [
  { key: "1", name: "Contoso Ltd", city: "Seattle", phone: "555-0101", revenue: "$1,200,000.00" },
  { key: "2", name: "Fabrikam Inc", city: "Redmond", phone: "555-0102", revenue: "$840,000.00" },
  { key: "3", name: "Adventure Works", city: "Portland", phone: "555-0103", revenue: "$2,400,000.00" },
  { key: "4", name: "Northwind Traders", city: "Tacoma", phone: "555-0104", revenue: "$310,000.00" },
];

/**
 * Limitation-bypass fixture (#3): rows merged from TWO query sources , 
 * "my open opportunities" + "recently won team opportunities", something no
 * single native subgrid can display. Visually identical to a native grid.
 */
export const mergedOpportunityColumns: IGridColumn[] = [
  { key: "topic", name: "Topic", width: 260 },
  { key: "account", name: "Account", width: 180 },
  { key: "stage", name: "Stage", width: 120 },
  { key: "value", name: "Est. Value", width: 120 },
  { key: "source", name: "Source Query", width: 160 },
];

export const mergedOpportunityRows: IGridRow[] = [
  { key: "open-1", topic: "100 Licenses renewal", account: "Contoso Ltd", stage: "Develop", value: "$95,000.00", source: "My open" },
  { key: "open-2", topic: "Server migration project", account: "Fabrikam Inc", stage: "Propose", value: "$310,000.00", source: "My open" },
  { key: "won-1", topic: "Support contract FY26", account: "Adventure Works", stage: "Won", value: "$58,000.00", source: "Team won (30d)" },
  { key: "open-3", topic: "Analytics rollout", account: "Northwind Traders", stage: "Qualify", value: "$120,000.00", source: "My open" },
  { key: "won-2", topic: "Hardware refresh", account: "Contoso Ltd", stage: "Won", value: "$210,000.00", source: "Team won (30d)" },
];

/**
 * Limitation-bypass fixture: tasks + phone calls + appointments
 * normalized into one list, native subgrids show one activity type at a time.
 */
export const activityColumns: IGridColumn[] = [
  { key: "type", name: "Activity Type", width: 130 },
  { key: "subject", name: "Subject", width: 260 },
  { key: "regarding", name: "Regarding", width: 180 },
  { key: "due", name: "Due Date", width: 130 },
  { key: "status", name: "Status", width: 110 },
];

export const activityRows: IGridRow[] = [
  { key: "task-1", type: "Task", subject: "Send proposal draft", regarding: "Contoso Ltd", due: "2026-06-15", status: "Open" },
  { key: "call-1", type: "Phone Call", subject: "Follow up on quote", regarding: "Fabrikam Inc", due: "2026-06-13", status: "Open" },
  { key: "appt-1", type: "Appointment", subject: "Contract review meeting", regarding: "Adventure Works", due: "2026-06-18", status: "Scheduled" },
  { key: "task-2", type: "Task", subject: "Update price list", regarding: "Northwind Traders", due: "2026-06-12", status: "Completed" },
  { key: "call-2", type: "Phone Call", subject: "Renewal check-in", regarding: "Contoso Ltd", due: "2026-06-20", status: "Open" },
];

export const territoryNodes: ITreeNode[] = [
  {
    id: "emea",
    label: "EMEA",
    children: [
      { id: "uk", label: "United Kingdom", children: [{ id: "london", label: "London" }] },
      { id: "de", label: "Germany" },
      { id: "fr", label: "France" },
    ],
  },
  {
    id: "amer",
    label: "Americas",
    children: [
      { id: "us-west", label: "US West" },
      { id: "us-east", label: "US East" },
    ],
  },
];

export const personas: IPersonaItem[] = [
  { id: "p1", name: "Yvonne McKay", secondaryText: "Chief Executive Officer · Contoso Ltd" },
  { id: "p2", name: "Patrick Sands", secondaryText: "Purchasing Manager · Fabrikam Inc" },
  { id: "p3", name: "Susanna Stubberod", secondaryText: "Owner · Adventure Works" },
];

export const longText =
  "This value is deliberately much longer than the control is wide so reviewers can " +
  "verify overflow, wrapping, and ellipsis behavior against the native model-driven " +
  "rendering of the same field type on a Unified Interface form.";
