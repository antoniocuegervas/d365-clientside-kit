import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartNumberField } from "../../../shared/controls/smart/SmartNumberField";
import {
  fieldContext,
  withContext,
  sample,
  makeRequired,
  fieldContractNote,
} from "./smartStoryHarness";

const meta: Meta<typeof SmartNumberField> = {
  title: "Smart Controls/SmartNumberField",
  component: SmartNumberField,
  decorators: [withContext(fieldContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Currency-aware numeric field. A money attribute renders a currency field, with the " +
          "symbol resolved from the record's transaction currency (or an explicit `currencySymbol`). " +
          "It also handles whole, decimal, and double attributes; precision and min/max come from " +
          "metadata, and the decimal symbol and group separator follow the user's locale. " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartNumberField>;

const numberOfChildren = new Observable<number | null>(2);
const exchangeRate = new Observable<number | null>(1.0825);
const creditLimit = new Observable<number | null>(50000);
const required = makeRequired<number>("No. of Children is required.");

export const Integer: Story = {
  name: "Integer (precision from metadata)",
  render: () => (
    <SmartNumberField entity="contact" attribute="numberofchildren" value={numberOfChildren} />
  ),
  parameters: sample(
    `// contact.numberofchildren is an integer attribute, so the field rounds to
// zero decimals. The decimal symbol and group separator follow the user's
// Language and Format settings in Dataverse.
const numberOfChildren = new Observable<number | null>(2);

<SmartNumberField entity="contact" attribute="numberofchildren" value={numberOfChildren} />`,
    "A whole-number attribute resolves to zero decimals from metadata; the decimal symbol and group separator follow the user's locale automatically. Nothing extra is wired."
  ),
};

export const Decimal: Story = {
  name: "Decimal (precision from metadata)",
  render: () => (
    <SmartNumberField entity="account" attribute="exchangerate" value={exchangeRate} />
  ),
  parameters: sample(
    `// account.exchangerate is a decimal attribute with precision 4 in metadata, so
// the field keeps four decimals. Unlike money, a decimal's precision is the
// attribute's own schema precision, never a currency's. Double attributes behave
// the same way.
const exchangeRate = new Observable<number | null>(1.0825);

<SmartNumberField entity="account" attribute="exchangerate" value={exchangeRate} />`,
    "Decimal (and double) attributes take their precision from the attribute schema in metadata, not from a currency. Only money fields resolve precision from a currency."
  ),
};

export const Money: Story = {
  name: "Money (resolved currency symbol)",
  render: () => (
    <SmartNumberField
      entity="contact"
      attribute="creditlimit"
      value={creditLimit}
      transactionCurrencyId="55550000-0000-0000-0000-000000000005"
    />
  ),
  parameters: sample(
    `// contact.creditlimit is a money attribute. Read the record's currency id from
// the OData lookup field _transactioncurrencyid_value and pass it here; the smart
// tier resolves that currency's symbol (here "€") and renders a currency field.
// Symbol priority: explicit currencySymbol prop, then the resolved currency, then
// "$". Precision: when the attribute's PrecisionSource is the currency, the
// currency's own precision wins over the attribute precision (org pricing
// precision is not resolved; see the money-precision gotcha).
const creditLimit = new Observable<number | null>(50000);

<SmartNumberField
  entity="contact"
  attribute="creditlimit"
  value={creditLimit}
  transactionCurrencyId="55550000-0000-0000-0000-000000000005"
/>`,
    "Money attributes render a currency field. The symbol resolves from the record's transaction currency (the _transactioncurrencyid_value lookup), with an explicit currencySymbol prop taking priority and \"$\" as the final fallback. In a non-USD org, omitting both silently shows \"$\"."
  ),
};

export const Required: Story = {
  render: () => (
    <SmartNumberField
      entity="contact"
      attribute="numberofchildren"
      value={required.value}
      required
      errorMessage={required.errorMessage}
      onChange={required.onChange}
    />
  ),
  parameters: sample(
    `// The control writes numberOfChildren itself on each edit; this onChange only
// keeps the error in step, clearing it once a number is entered.
const numberOfChildren = new Observable<number | null>(null);
const error = new Observable<string | undefined>("No. of Children is required.");
const onChange = (v: number | null) => {
  error.value = v == null ? "No. of Children is required." : undefined;
};

<SmartNumberField
  entity="contact"
  attribute="numberofchildren"
  value={numberOfChildren}
  required
  errorMessage={error}
  onChange={onChange}
/>`,
    "The control writes the value Observable itself; the onChange shown only clears the error, which tracks input the way live form validation does."
  ),
};

export const Disabled: Story = {
  render: () => (
    <SmartNumberField
      entity="contact"
      attribute="numberofchildren"
      value={numberOfChildren}
      disabled
    />
  ),
  parameters: sample(
    `const numberOfChildren = new Observable<number | null>(2);

<SmartNumberField
  entity="contact"
  attribute="numberofchildren"
  value={numberOfChildren}
  disabled
/>`,
    "Disabled greys the field and removes it from the tab order; the value stays visible. It is a prop the ViewModel drives (from business rules), not a metadata default. Use readOnly when the value should stay readable and selectable."
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartNumberField
      entity="contact"
      attribute="numberofchildren"
      value={numberOfChildren}
      readOnly
    />
  ),
  parameters: sample(
    `const numberOfChildren = new Observable<number | null>(2);

<SmartNumberField
  entity="contact"
  attribute="numberofchildren"
  value={numberOfChildren}
  readOnly
/>`,
    "Read-only renders the value as locked text that stays readable and selectable; disabled dims the control and blocks focus. This is distinct from Dataverse field-level security, which also produces a read-only field via metadata."
  ),
};
