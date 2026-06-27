import * as React from "react";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { createFakeViewModelContext } from "../../mocks/fakeViewModelContext";

/**
 * Shared rig for the "Smart Controls" stories. Not a `.stories.tsx` file, so
 * Storybook does not index it: the per-component story files import the seeded
 * contexts and helpers from here.
 *
 * The presentational stories run with no host at all. The smart controls cannot
 * (being metadata aware is the whole point), so each renders against an
 * in-memory metadata fake: a small, canned slice of contact/account metadata and
 * a few records, served through the same `IViewModelContext` the real hosts
 * implement. The resolution you see is real; only the metadata behind it is
 * fixture data. The seeded slices below mirror the known-good setups in the
 * smart-control unit tests.
 */

/**
 * Wraps a fake context so its `retrieveMultipleRecords` honours the two query
 * clauses the live controls emit: `contains(field,'...')` narrows the rows, and
 * `$orderby=field dir` sorts them. The base fake replays the seeded list as-is,
 * so without this the inline lookup would not filter as you type and the grid's
 * server sort would not reorder on a header click. Storybook-only sugar over the
 * shared fake (the unit tests assert the query string instead of the rows).
 */
function withClientQuerySemantics(context: IViewModelContext): IViewModelContext {
  const original = context.webAPI.retrieveMultipleRecords;
  context.webAPI.retrieveMultipleRecords = async (entity, options, maxPageSize) => {
    const result = await original(entity, options, maxPageSize);
    let entities = result.entities;
    const query = String(options ?? "");

    const contains = /contains\((\w+),'([^']*)'\)/i.exec(query);
    if (contains) {
      const [, field, term] = contains;
      const needle = term.toLowerCase();
      entities = entities.filter((row) => String(row[field] ?? "").toLowerCase().includes(needle));
    }

    const order = /\$orderby=(\w+)\s+(asc|desc)/i.exec(query);
    if (order) {
      const [, field, direction] = order;
      entities = [...entities].sort((a, b) => {
        const comparison = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
        return direction.toLowerCase() === "desc" ? -comparison : comparison;
      });
    }

    return { ...result, entities };
  };
  return context;
}

/**
 * One slice of contact/account metadata covering every field control plus the
 * lookup. The field stories all read from this; it carries no view rows, so the
 * lookup's inline search and dialog are the only query paths it serves.
 */
export const fieldContext: IViewModelContext = withClientQuerySemantics(
  createFakeViewModelContext({
  attributes: {
    "contact.firstname": {
      displayName: "First Name",
      kind: "text",
      maxLength: 100,
      required: true,
      // Description flows through as the field hint (see fieldContractNote).
      description: "The contact's given name, as it appears on correspondence.",
    },
    "contact.description": { displayName: "Description", kind: "memo" },
    "contact.gendercode": {
      displayName: "Gender",
      kind: "optionset",
      options: [
        { value: 1, label: "Male" },
        { value: 2, label: "Female" },
      ],
    },
    "contact.donotemail": {
      displayName: "Do Not Allow Emails",
      kind: "boolean",
      // options[0] is the false label, options[1] the true label.
      options: [
        { value: 0, label: "Allow" },
        { value: 1, label: "Do Not Allow" },
      ],
    },
    "contact.numberofchildren": { displayName: "No. of Children", kind: "integer" },
    "account.exchangerate": { displayName: "Exchange Rate", kind: "decimal", precision: 4 },
    "contact.creditlimit": { displayName: "Credit Limit", kind: "money", precision: 2 },
    "contact.birthdate": { displayName: "Birthday", kind: "date" },
    "appointment.scheduledstart": { displayName: "Start Time", kind: "datetime" },
    "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
    // Polymorphic (Customer) lookup: two targets, so the call site must pick one
    // via targetEntity. Drives the SmartLookup "Polymorphic" story.
    "incident.customerid": {
      displayName: "Customer",
      kind: "lookup",
      targets: ["account", "contact"],
    },
    "account.name": { displayName: "Account Name", kind: "text" },
  },
  // User locale formatting, so the date and number stories resolve their format
  // from metadata (date pattern, separators, calendar names) the way a real host
  // would, instead of falling back to whatever locale the browser happens to use.
  formatting: {
    decimalSymbol: ",",
    numberSeparator: ".",
    dateFormatInfo: {
      dayNames: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      monthNames: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      shortestDayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
      abbreviatedMonthNames: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      firstDayOfWeek: 0,
      shortDatePattern: "d/M/yyyy",
    },
  },
  // The money story resolves this symbol from the record's transaction currency.
  currencies: {
    "55550000-0000-0000-0000-000000000005": { symbol: "€", precision: 2 },
  },
  // The view-driven lookup story resolves this saved view by name, then searches
  // through it. The view-by-id story passes the same id directly.
  views: {
    "name:account:Active Accounts": {
      id: "99990000-0000-0000-0000-000000000009",
      name: "Active Accounts",
      entityLogicalName: "account",
    },
  },
  // Inline lookup search (search-as-you-type) replays this single page.
  queryResults: {
    account: [
      {
        entities: [
          { accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd" },
          { accountid: "a1a00000-0000-0000-0000-000000000002", name: "Fabrikam Inc" },
        ],
      },
    ],
  },
  // The dialog lookup commits whatever the native picker resolves with.
  lookupResults: [
    { id: "a1a00000-0000-0000-0000-000000000001", logicalName: "account", name: "Contoso Ltd" },
  ],
  }).context
);

/**
 * A saved account view plus two rows, for the read-only grid (no paging). Three
 * views are seeded with different column layouts so the default, the view-by-name,
 * and the view-by-id stories each render a visibly different grid.
 */
export const gridContext: IViewModelContext = withClientQuerySemantics(
  createFakeViewModelContext({
  attributes: {
    "account.name": { displayName: "Account Name", kind: "text" },
    "account.telephone1": { displayName: "Main Phone", kind: "text" },
    "account.address1_city": { displayName: "City", kind: "text" },
  },
  views: {
    // The entity's default grid view (no viewId/viewName given).
    "default:account": {
      name: "Active Accounts",
      entityLogicalName: "account",
      fetchXml: "<fetch><entity name='account'/></fetch>",
      columns: [
        { name: "name", width: 300 },
        { name: "telephone1", width: 160 },
      ],
    },
    // Resolved by display name: a different layout (City instead of Phone).
    "name:account:Key Accounts": {
      name: "Key Accounts",
      entityLogicalName: "account",
      fetchXml: "<fetch><entity name='account'/></fetch>",
      columns: [
        { name: "name", width: 280 },
        { name: "address1_city", width: 160 },
      ],
    },
    // Resolved by saved-query id: a three-column layout.
    "77770000-0000-0000-0000-000000000007": {
      name: "Accounts with City",
      entityLogicalName: "account",
      fetchXml: "<fetch><entity name='account'/></fetch>",
      columns: [
        { name: "name", width: 240 },
        { name: "telephone1", width: 140 },
        { name: "address1_city", width: 140 },
      ],
    },
  },
  // Seeded out of alphabetical order on purpose, so the server-sort story
  // visibly reorders the rows on the first ascending header click.
  queryResults: {
    account: [
      {
        entities: [
          {
            accountid: "a1a00000-0000-0000-0000-000000000002",
            name: "Fabrikam Inc",
            telephone1: "555-0102",
            address1_city: "Redmond",
          },
          {
            accountid: "a1a00000-0000-0000-0000-000000000003",
            name: "Adventure Works",
            telephone1: "555-0103",
            address1_city: "Portland",
          },
          {
            accountid: "a1a00000-0000-0000-0000-000000000001",
            name: "Contoso Ltd",
            telephone1: "555-0101",
            address1_city: "Seattle",
          },
        ],
      },
    ],
  },
  }).context
);

/** The saved-query id seeded above, shared with the view-by-id grid story. */
export const gridViewId = "77770000-0000-0000-0000-000000000007";

/**
 * Same account view, but the first page carries a `nextLink` and a second page
 * is queued, so the grid's server-side paging has somewhere to go.
 */
export const pagedGridContext: IViewModelContext = createFakeViewModelContext({
  attributes: {
    "account.name": { displayName: "Account Name", kind: "text" },
    "account.telephone1": { displayName: "Main Phone", kind: "text" },
  },
  views: {
    "default:account": {
      name: "Active Accounts",
      entityLogicalName: "account",
      fetchXml: "<fetch><entity name='account'/></fetch>",
      columns: [
        { name: "name", width: 300 },
        { name: "telephone1", width: 160 },
      ],
    },
  },
  queryResults: {
    account: [
      {
        entities: [
          { accountid: "p1", name: "Contoso Ltd", telephone1: "555-0101" },
          { accountid: "p2", name: "Fabrikam Inc", telephone1: "555-0102" },
        ],
        nextLink: "https://fake/next-page-2",
      },
    ],
  },
  pageResults: [
    {
      entities: [
        { accountid: "p3", name: "Adventure Works", telephone1: "555-0103" },
        { accountid: "p4", name: "Northwind Traders", telephone1: "555-0104" },
      ],
    },
  ],
}).context;

/** Wraps a story in a metadata-fake host, so its smart control can resolve. */
export const withContext =
  (context: IViewModelContext) =>
  (Story: React.ComponentType): React.ReactElement => (
    <ViewModelContextProvider context={context}>
      <Story />
    </ViewModelContextProvider>
  );

/**
 * Builds the "Show code" snippet under a story. A smart control's whole value is
 * that it reads from metadata, so the bare JSX tag teaches nothing on its own.
 * Every snippet shows the same three things a reader needs: the Dataverse
 * metadata the control resolves against, the host-owned value Observable (the
 * ViewModel's job), and the View JSX. An optional note becomes the story's prose.
 */
export const sample = (code: string, note?: string) => ({
  docs: {
    source: { code, language: "tsx" as const },
    ...(note ? { description: { story: note } } : {}),
  },
});

/**
 * A required field whose validation message clears the moment a value is present,
 * the way a ViewModel drives live validation. The smart control writes the value
 * itself (and raises onChange); this keeps the error message in step. Returns the
 * value and error Observables plus the onChange to wire onto the control.
 *
 * `isEmpty` reports whether a non-null value still counts as empty (a blank string
 * for text); other field types are a value as soon as they are non-null.
 */
export function makeRequired<T>(
  message: string,
  isEmpty: (value: T) => boolean = () => false
): {
  value: Observable<T | null>;
  errorMessage: Observable<string | undefined>;
  onChange: (value: T | null) => void;
} {
  const value = new Observable<T | null>(null);
  const errorMessage = new Observable<string | undefined>(message);
  const onChange = (next: T | null): void => {
    errorMessage.value = next != null && !isEmpty(next) ? undefined : message;
  };
  return { value, errorMessage, onChange };
}

/**
 * The contract every smart field shares, appended to each control's page so the
 * component description reads as a complete explanation on its own.
 */
export const fieldContractNote =
  "These run against an in-memory metadata fake (no org); each story's Show code " +
  "panel includes the seeded metadata and the host Observable so the sample reads like real " +
  "ViewModel/View code. Pass an `entity`, an `attribute`, and a value `Observable`: the " +
  "ViewModel owns that Observable, and the control writes the user's edit back into it (and " +
  "raises `onChange`). Any metadata-derived default can be overridden by a prop (`label`, " +
  "`required`, `hint`, `labelPosition`, `disabled`, `readOnly`, `errorMessage`), exactly like " +
  "overriding a field on a form. The `hint` defaults to the attribute's Dataverse Description; a " +
  "free-form `placeholder` is still not offered, because what a smart field shows should come " +
  "from metadata, not the call site.";
