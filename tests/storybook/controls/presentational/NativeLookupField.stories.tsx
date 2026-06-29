import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import {
  NativeLookupField,
  type INativeLookupResult,
  type INativeLookupTarget,
} from "../../../../shared/controls/presentational/NativeLookupField";
import type { IEntityReference } from "../../../../shared/utils/EntityModel";

const meta: Meta<typeof NativeLookupField> = {
  title: "Presentational Controls/NativeLookupField",
  component: NativeLookupField,
};
export default meta;
type Story = StoryObj<typeof NativeLookupField>;

// A tiny entity glyph so the icon column reads like native (resolved upstream in
// production; here it is just fixture data).
const icon = (fill: string): string =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="${fill}"/></svg>`
  );

/**
 * Fixture results in the host's shape. Most carry several columns (so they get
 * the expand chevron); "Counterparty Demo Co" carries only its name, so it stays
 * single-line with NO chevron, exactly the native conditional-chevron case.
 */
const contactResults: INativeLookupResult[] = [
  {
    id: "c1",
    name: "Coho Winery (sample)",
    logicalName: "contact",
    iconUrl: icon("%230f6cbd"),
    columns: [
      { label: "Email", value: "someone10@example.com" },
      { label: "Business Phone", value: "555-0159" },
      { label: "Company Name", value: "Coho Winery" },
      { label: "City", value: "Phoenix" },
    ],
  },
  {
    id: "c2",
    name: "Contoso Pharmaceuticals (sample)",
    logicalName: "contact",
    iconUrl: icon("%230f6cbd"),
    columns: [
      { label: "Email", value: "someone7@example.com" },
      { label: "Business Phone", value: "555-0142" },
      { label: "City", value: "Redmond" },
    ],
  },
  {
    id: "c3",
    name: "Counterparty Demo Co",
    logicalName: "contact",
    iconUrl: icon("%230f6cbd"),
  },
];

const accountResults: INativeLookupResult[] = [
  {
    id: "a1",
    name: "A. Datum Corporation (sample)",
    logicalName: "account",
    iconUrl: icon("%23107c41"),
    columns: [
      { label: "Email", value: "someone9@example.com" },
      { label: "City", value: "Redmond" },
    ],
  },
  {
    id: "a2",
    name: "Adventure Works (sample)",
    logicalName: "account",
    iconUrl: icon("%23107c41"),
    columns: [{ label: "Email", value: "someone3@example.com" }],
  },
];

const matches = (result: INativeLookupResult, text: string): boolean => {
  const needle = text.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = [result.name, ...(result.columns ?? []).map((c) => c.value)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
};

/**
 * The story plays the ViewModel: it filters the fixture list when the control
 * raises onSearchTextChanged (raised on focus with "" and on every keystroke).
 * In production that handler runs a quick-find query; the control never knows.
 */
const make = (source: INativeLookupResult[], initial: IEntityReference | null) => {
  const selected = new Observable<IEntityReference | null>(initial);
  const results = new Observable<INativeLookupResult[]>([]);
  return {
    selected,
    results,
    tableLabel: source === accountResults ? "Accounts" : "Contacts",
    onSearchTextChanged: (text: string) => {
      results.value = source.filter((r) => matches(r, text));
    },
    onChange: (value: IEntityReference | null) => (selected.value = value),
    onOpenRecord: (ref: IEntityReference) => window.alert(`Open ${ref.name}`),
    onAdvanced: () => window.alert("Advanced lookup"),
    onNew: () => window.alert("New record"),
  };
};

export const Empty: Story = {
  name: "Empty (focus to open the flyout)",
  render: () => <NativeLookupField label="Primary Contact" placeholder="Look for Primary Contact" {...make(contactResults, null)} />,
};

export const Set: Story = {
  name: "Set (chip + clickthrough)",
  render: () => (
    <NativeLookupField
      label="Primary Contact"
      {...make(contactResults, {
        id: "c1",
        logicalName: "contact",
        name: "Coho Winery (sample)",
        iconUrl: icon("%230f6cbd"),
      })}
    />
  ),
};

export const Searching: Story = {
  name: "Searching (loading line)",
  render: () => <NativeLookupField label="Primary Contact" searching {...make(contactResults, null)} />,
};

export const Required: Story = {
  render: () => {
    const base = make(contactResults, null);
    const errorMessage = new Observable<string | undefined>("Select a primary contact.");
    return (
      <NativeLookupField
        label="Primary Contact"
        required
        errorMessage={errorMessage}
        {...base}
        onChange={(value) => {
          base.selected.value = value;
          errorMessage.value = value ? undefined : "Select a primary contact.";
        }}
      />
    );
  },
};

export const Error: Story = {
  name: "Error state",
  render: () => (
    <NativeLookupField
      label="Primary Contact"
      errorMessage="Select a primary contact."
      {...make(contactResults, null)}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <NativeLookupField
      label="Primary Contact"
      disabled
      {...make(contactResults, { id: "c1", logicalName: "contact", name: "Coho Winery (sample)" })}
    />
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <NativeLookupField
      label="Primary Contact"
      readOnly
      {...make(contactResults, { id: "c1", logicalName: "contact", name: "Coho Winery (sample)" })}
    />
  ),
};

export const MultiTarget: Story = {
  name: "Polymorphic (target switcher)",
  render: () => {
    const targets: INativeLookupTarget[] = [
      { entity: "account", label: "Accounts" },
      { entity: "contact", label: "Contacts" },
    ];
    const selected = new Observable<IEntityReference | null>(null);
    const results = new Observable<INativeLookupResult[]>([]);
    const activeTarget = new Observable<string | undefined>("contact");
    const sourceFor = (entity: string | undefined): INativeLookupResult[] =>
      entity === "account" ? accountResults : contactResults;
    return (
      <NativeLookupField
        label="Customer"
        placeholder="Look for Customer"
        selected={selected}
        results={results}
        targets={targets}
        activeTarget={activeTarget}
        tableLabel="Contacts"
        onTargetChange={(entity) => {
          activeTarget.value = entity;
          results.value = sourceFor(entity);
        }}
        onSearchTextChanged={(text) =>
          (results.value = sourceFor(activeTarget.value).filter((r) => matches(r, text)))
        }
        onChange={(value) => (selected.value = value)}
      />
    );
  },
};
