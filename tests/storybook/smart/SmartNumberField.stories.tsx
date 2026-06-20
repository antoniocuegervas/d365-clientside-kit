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
          "Numeric field for whole, decimal, and money attributes. Precision and min/max come " +
          "from metadata, and the decimal symbol and group separator follow the user's locale. " +
          "A money attribute renders a currency field, with the symbol resolved from the record's " +
          "transaction currency (or an explicit `currencySymbol`). " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartNumberField>;

const numberOfChildren = new Observable<number | null>(2);
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
// locale (resolved through getFormatting on the host).
const numberOfChildren = new Observable<number | null>(2);

<SmartNumberField entity="contact" attribute="numberofchildren" value={numberOfChildren} />`
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
    `// contact.creditlimit is a money attribute (precision 2). Pass the record's
// transaction currency id and the smart tier resolves that currency's symbol
// (here "€") and renders a currency field. To skip the lookup, pass
// currencySymbol="€" instead; an explicit symbol always wins.
const creditLimit = new Observable<number | null>(50000);

<SmartNumberField
  entity="contact"
  attribute="creditlimit"
  value={creditLimit}
  transactionCurrencyId="55550000-0000-0000-0000-000000000005"
/>`,
    "Money attributes render a currency field. The symbol comes from the record's transaction currency, or from an explicit currencySymbol prop if you pass one."
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
    `// The ViewModel owns the value and the error, and clears the error once a
// number is entered, so the message tracks input.
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
    "The required message clears the moment a value is entered, mirroring live form validation."
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
/>`
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
/>`
  ),
};
