import * as React from "react";
import {
  Button,
  Divider,
  Dropdown,
  Option,
  Subtitle2,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { TextField } from "../../../shared/controls/presentational/TextField";
import { MultilineTextField } from "../../../shared/controls/presentational/MultilineTextField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import { LookupField } from "../../../shared/controls/presentational/LookupField";
import { BooleanField } from "../../../shared/controls/presentational/BooleanField";
import { NumberField } from "../../../shared/controls/presentational/NumberField";
import { DateTimeField } from "../../../shared/controls/presentational/DateTimeField";
import type { IEntityReference, IOptionItem } from "../../../shared/utils/EntityModel";
import { accountColumns, accountRows } from "../fixtures";

/**
 * Interactive counterpart of sample-master-detail: an account grid (master)
 * drives an editable contact form (detail). Select an account to load its
 * contacts, pick a contact, and the form below fills with a field of every
 * out-of-box type. Composed presentationally with fixture data only; the story
 * plays the ViewModel that the live app binds to Dataverse.
 */
const meta: Meta = {
  title: "Sample Patterns/Master Detail",
  parameters: {
    docs: {
      description: {
        component:
          "A master grid of accounts drives a detail form of contacts: select an account to load " +
          "its contacts, pick one, and edit a form with one field of every out-of-box type. The " +
          "rendered demo composes presentational controls over fixtures. The Show code panel is " +
          "the real version: SmartViewGrid for the master, then a detail form where every field is " +
          "a smart control resolving its label, options, currency, and format from contact " +
          "metadata.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const genderOptions: IOptionItem[] = [
  { value: 1, label: "Male" },
  { value: 2, label: "Female" },
];

const userRefs: IEntityReference[] = [
  { id: "51500000-0000-0000-0000-000000000001", logicalName: "systemuser", name: "Alex Wilber" },
  { id: "51500000-0000-0000-0000-000000000002", logicalName: "systemuser", name: "Megan Bowen" },
];

interface IContactDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  preferredUser: IEntityReference | null;
  gender: number | null;
  doNotEmail: boolean;
  numberOfChildren: number | null;
  creditLimit: number | null;
  birthDate: Date | null;
  description: string;
}

// Contacts per master row key, the relationship the smart tier would fetch.
const contactsByAccount: Record<string, IContactDetail[]> = {
  "1": [
    {
      id: "c-1",
      name: "Yvonne McKay",
      firstName: "Yvonne",
      lastName: "McKay",
      jobTitle: "Chief Executive Officer",
      preferredUser: userRefs[0],
      gender: 2,
      doNotEmail: false,
      numberOfChildren: 2,
      creditLimit: 50000,
      birthDate: new Date(1978, 3, 14),
      description: "Primary executive sponsor for the renewal.",
    },
  ],
  "2": [
    {
      id: "c-2",
      name: "Patrick Sands",
      firstName: "Patrick",
      lastName: "Sands",
      jobTitle: "Purchasing Manager",
      preferredUser: userRefs[1],
      gender: 1,
      doNotEmail: true,
      numberOfChildren: 0,
      creditLimit: 12000,
      birthDate: new Date(1985, 10, 2),
      description: "Prefers phone contact, opted out of email.",
    },
  ],
  "3": [
    {
      id: "c-3",
      name: "Susanna Stubberod",
      firstName: "Susanna",
      lastName: "Stubberod",
      jobTitle: "Owner",
      preferredUser: null,
      gender: 2,
      doNotEmail: false,
      numberOfChildren: 1,
      creditLimit: 8000,
      birthDate: null,
      description: "",
    },
  ],
  "4": [],
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    boxSizing: "border-box",
    // Tighter padding on a narrow (portrait / mobile) screen.
    "@media (max-width: 640px)": {
      padding: tokens.spacingHorizontalM,
    },
  },
  bridge: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  picker: { maxWidth: "420px" },
  detail: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    maxWidth: "760px",
  },
  // Contact fields in two columns so the form stays compact, collapsing to a
  // single column on a narrow (portrait / mobile) screen.
  fields: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalM,
    "@media (max-width: 640px)": {
      gridTemplateColumns: "1fr",
    },
  },
  hint: { color: tokens.colorNeutralForeground3 },
});

interface IMasterDetailBody {
  demo: MasterDetailDemo;
}

class MasterDetailDemo extends ObserverComponent {
  readonly selectedAccountKey = new Observable<string | null>(null);
  readonly selectedAccountName = new Observable<string | null>(null);
  readonly selectedContactId = new Observable<string | null>(null);
  readonly saveMessage = new Observable<string | null>(null);

  // Detail fields, one of every out-of-box type.
  readonly firstName = new Observable<string | null>(null);
  readonly lastName = new Observable<string | null>(null);
  readonly jobTitle = new Observable<string | null>(null);
  readonly preferredUser = new Observable<IEntityReference | null>(null);
  readonly userResults = new Observable<IEntityReference[]>([]);
  readonly gender = new Observable<number | null>(null);
  readonly doNotEmail = new Observable<boolean | null>(null);
  readonly numberOfChildren = new Observable<number | null>(null);
  readonly creditLimit = new Observable<number | null>(null);
  readonly birthDate = new Observable<Date | null>(null);
  readonly description = new Observable<string | null>(null);

  constructor(props: object) {
    super(props);
    // Pre-seed a selection so the demo opens on the full master -> detail -> form
    // flow rather than an empty "select an account" idle state that reads as broken.
    this.onAccountSelected(accountRows[0]);
    this.onContactSelected(contactsByAccount[accountRows[0].key][0].id);
    this.observe(this.selectedAccountKey, this.selectedContactId, this.saveMessage);
  }

  get contacts(): IContactDetail[] {
    const key = this.selectedAccountKey.value;
    return key ? contactsByAccount[key] ?? [] : [];
  }

  readonly onAccountSelected = (row: IGridRow): void => {
    this.selectedAccountKey.value = row.key;
    this.selectedAccountName.value = String(row.name);
    this.selectedContactId.value = null;
    this.saveMessage.value = null;
  };

  readonly onContactSelected = (id: string): void => {
    const contact = this.contacts.find((c) => c.id === id);
    if (!contact) return;
    this.selectedContactId.value = id;
    this.saveMessage.value = null;
    this.firstName.value = contact.firstName;
    this.lastName.value = contact.lastName;
    this.jobTitle.value = contact.jobTitle;
    this.preferredUser.value = contact.preferredUser;
    this.gender.value = contact.gender;
    this.doNotEmail.value = contact.doNotEmail;
    this.numberOfChildren.value = contact.numberOfChildren;
    this.creditLimit.value = contact.creditLimit;
    this.birthDate.value = contact.birthDate;
    this.description.value = contact.description;
  };

  readonly searchUsers = (text: string): void => {
    this.userResults.value = userRefs.filter((u) =>
      (u.name ?? "").toLowerCase().includes(text.toLowerCase())
    );
  };

  readonly onSave = (): void => {
    const name = [this.firstName.value, this.lastName.value].filter(Boolean).join(" ");
    this.saveMessage.value = `Saved ${name || "contact"}.`;
  };

  override render(): React.ReactNode {
    return <Body demo={this} />;
  }
}

const Body: React.FC<IMasterDetailBody> = ({ demo }) => {
  const styles = useStyles();
  const contacts = demo.contacts;
  const selectedContactId = demo.selectedContactId.value;
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId);

  return (
    <div className={styles.page}>
      <Title3>Master / Detail: Accounts and Contacts</Title3>

      <DataGrid
        columns={accountColumns}
        rows={accountRows}
        emptyMessage="No accounts."
        selectedKey={demo.selectedAccountKey}
        onRowClick={demo.onAccountSelected}
      />

      <Divider />

      {demo.selectedAccountKey.value === null ? (
        <div className={styles.hint}>Select an account to load its contacts.</div>
      ) : contacts.length === 0 ? (
        <div className={styles.hint}>
          {demo.selectedAccountName.value
            ? `${demo.selectedAccountName.value} has no contacts.`
            : "This account has no contacts."}
        </div>
      ) : (
        <div className={styles.bridge}>
          <Subtitle2>
            Contacts for {demo.selectedAccountName.value ?? "the selected account"}
          </Subtitle2>
          <div className={styles.picker}>
            <Dropdown
              placeholder="Pick a contact to edit"
              value={selectedContact ? selectedContact.name : ""}
              selectedOptions={selectedContactId ? [selectedContactId] : []}
              onOptionSelect={(_event, data) => {
                if (data.optionValue) {
                  demo.onContactSelected(data.optionValue);
                }
              }}
            >
              {contacts.map((contact) => (
                <Option key={contact.id} value={contact.id} text={contact.name}>
                  {contact.name}
                </Option>
              ))}
            </Dropdown>
          </div>
        </div>
      )}

      {selectedContactId !== null ? (
        <div className={styles.detail} key={selectedContactId}>
          <div className={styles.fields}>
            <TextField
              label="First Name"
              value={demo.firstName}
              onChange={(v) => (demo.firstName.value = v)}
            />
            <TextField
              label="Last Name"
              value={demo.lastName}
              onChange={(v) => (demo.lastName.value = v)}
            />
            <TextField
              label="Job Title"
              value={demo.jobTitle}
              onChange={(v) => (demo.jobTitle.value = v)}
            />
            <LookupField
              label="Preferred User"
              selected={demo.preferredUser}
              results={demo.userResults}
              onSearchTextChanged={demo.searchUsers}
              onChange={(v) => (demo.preferredUser.value = v)}
            />
            <OptionSetField
              label="Gender"
              options={genderOptions}
              selectedValue={demo.gender}
              onChange={(v) => (demo.gender.value = v)}
            />
            <BooleanField
              label="Do Not Allow Emails"
              value={demo.doNotEmail}
              trueLabel="Do Not Allow"
              falseLabel="Allow"
              onChange={(v) => (demo.doNotEmail.value = v)}
            />
            <NumberField
              label="No. of Children"
              value={demo.numberOfChildren}
              precision={0}
              onChange={(v) => (demo.numberOfChildren.value = v)}
            />
            <NumberField
              label="Credit Limit"
              value={demo.creditLimit}
              precision={2}
              prefix="$"
              onChange={(v) => (demo.creditLimit.value = v)}
            />
            <DateTimeField
              label="Birthday"
              value={demo.birthDate}
              onChange={(v) => (demo.birthDate.value = v)}
            />
            <MultilineTextField
              label="Description"
              value={demo.description}
              onChange={(v) => (demo.description.value = v)}
            />
          </div>

          <div>
            <Button appearance="primary" onClick={demo.onSave}>
              Save
            </Button>
          </div>
          {demo.saveMessage.value ? (
            <div className={styles.hint}>{demo.saveMessage.value}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const Layout: Story = {
  name: "Master grid, contact picker, detail form",
  render: () => <MasterDetailDemo />,
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `// Master grid (accounts) drives a detail form (contacts). The ViewModel owns
// the selected account, the selected contact, and one Observable per field.
class MasterDetailViewModel {
  readonly selectedAccountId = new Observable<string | null>(null);
  readonly selectedContactId = new Observable<string | null>(null);
  readonly firstName = new Observable<string | null>(null);
  readonly preferredUser = new Observable<IEntityReference | null>(null);
  readonly gender = new Observable<number | null>(null);
  readonly doNotEmail = new Observable<boolean | null>(null);
  readonly creditLimit = new Observable<number | null>(null);
  readonly currencyId = new Observable<string | undefined>(undefined);
  readonly birthDate = new Observable<Date | null>(null);
  readonly description = new Observable<string | null>(null);
  // ...load the contact's fields on selection from Dataverse
}

// The View: a master grid, then a detail form of smart fields. One control of
// every out-of-box type, each resolving from contact metadata.
<SmartViewGrid entity="account" onRecordSelected={vm.selectAccount} />

<SmartTextField entity="contact" attribute="firstname" value={vm.firstName} />
<SmartLookup entity="contact" attribute="preferredsystemuserid" value={vm.preferredUser} />
<SmartOptionSet entity="contact" attribute="gendercode" value={vm.gender} />
<SmartBooleanField entity="contact" attribute="donotemail" value={vm.doNotEmail} />
<SmartNumberField
  entity="contact"
  attribute="creditlimit"
  value={vm.creditLimit}
  transactionCurrencyId={vm.currencyId.value}
/>
<SmartDatePicker entity="contact" attribute="birthdate" value={vm.birthDate} />
<SmartTextField entity="contact" attribute="description" value={vm.description} />`,
      },
    },
  },
};
