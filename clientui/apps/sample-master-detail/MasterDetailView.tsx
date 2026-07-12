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
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { SmartViewGrid } from "../../../shared/controls/smart/SmartViewGrid";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import { SmartBooleanField } from "../../../shared/controls/smart/SmartBooleanField";
import { SmartNumberField } from "../../../shared/controls/smart/SmartNumberField";
import { SmartDatePicker } from "../../../shared/controls/smart/SmartDatePicker";
import { SmartLookup } from "../../../shared/controls/smart/SmartLookup";
import { SmartNativeLookup } from "../../../shared/controls/smart/SmartNativeLookup";
import { WaitingMessage } from "../../../shared/controls/presentational/WaitingMessage";
import type { MasterDetailViewModel } from "./MasterDetailViewModel";

export interface IMasterDetailViewProps {
  viewModel: MasterDetailViewModel;
}

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    height: "100%",
    boxSizing: "border-box",
    overflowY: "auto",
    // Tighter padding on a narrow (portrait / mobile) screen.
    "@media (max-width: 640px)": {
      padding: tokens.spacingHorizontalM,
    },
  },
  bridge: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  picker: { maxWidth: "420px" },
  // In the bounded page column a flex child with its own overflow can shrink to
  // nothing under height pressure; pin the grid so the page scrolls instead.
  gridRegion: { flexShrink: 0 },
  // Fluent's Divider defaults to flex-grow: 1; in a flex column that makes it grow
  // vertically and push everything below it down, so pin it to 0.
  divider: { flexGrow: 0 },
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

/**
 * View layout (top to bottom, like a form):
 *   account saved-view grid (master), then a contact selector for the chosen
 *   account, then the editable contact detail form.
 */
export class MasterDetailView extends ObserverComponent<IMasterDetailViewProps> {
  constructor(props: IMasterDetailViewProps) {
    super(props);
    const vm = props.viewModel;
    this.observe(
      vm.selectedAccountId,
      vm.selectedAccountName,
      vm.contacts,
      vm.contactsLoading,
      vm.selectedContactId,
      vm.parentCustomer,
      vm.detailLoading,
      vm.isSaving,
      vm.saveMessage,
      vm.transactionCurrencyId
    );
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IMasterDetailViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();
  const contacts = vm.contacts.value;
  const selectedContactId = vm.selectedContactId.value;
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId);

  return (
    <div className={styles.page}>
      <Title3>Master / Detail: Accounts and Contacts</Title3>

      {/* Master: the account's saved grid view, paged server-side. */}
      <div className={styles.gridRegion}>
        <SmartViewGrid
          entity="account"
          pageSize={5}
          serverSort
          orderBy={vm.accountSort}
          refresh={vm.refreshViewGrid}
          selectedRecordId={vm.selectedAccountId}
          onRecordSelected={(id) => void vm.onAccountSelected(id)}
        />
      </div>

      <Divider className={styles.divider} />

      {vm.selectedAccountId.value === null ? (
        <div className={styles.hint}>Select an account to load its contacts.</div>
      ) : vm.contactsLoading.value ? (
        <WaitingMessage message="Loading contacts…" />
      ) : contacts.length === 0 ? (
        <div className={styles.hint}>
          {vm.selectedAccountName.value
            ? `${vm.selectedAccountName.value} has no contacts.`
            : "This account has no contacts."}
        </div>
      ) : (
        <div className={styles.bridge}>
          <Subtitle2>
            Contacts for {vm.selectedAccountName.value ?? "the selected account"}
          </Subtitle2>
          <div className={styles.picker}>
            <Dropdown
              placeholder="Pick a contact to edit"
              value={selectedContact ? selectedContact.name : ""}
              selectedOptions={selectedContactId ? [selectedContactId] : []}
              onOptionSelect={(_event, data) => {
                if (data.optionValue) {
                  void vm.onContactSelected(data.optionValue);
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
        vm.detailLoading.value ? (
          <WaitingMessage message="Loading contact…" />
        ) : (
          // Keyed by contact id so switching contacts gives each field a clean
          // mount. A field of every out-of-box contact type, in form order.
          <div className={styles.detail} key={selectedContactId}>
            <div className={styles.fields}>
              <SmartTextField entity="contact" attribute="firstname" value={vm.firstName} />
              <SmartTextField entity="contact" attribute="lastname" value={vm.lastName} />
              <SmartTextField entity="contact" attribute="jobtitle" value={vm.jobTitle} />
              <SmartLookup
                entity="contact"
                attribute="preferredsystemuserid"
                value={vm.preferredUser}
              />
              {/* Same vm.preferredUser Observable as the SmartLookup above, bound
                  to the same reference so a pick in either control shows in both.
                  This is the native-parity lookup: an inline flyout that looks and
                  behaves like the standard model-driven lookup, side by side with
                  the simpler SmartLookup combobox. */}
              <SmartNativeLookup
                entity="contact"
                attribute="preferredsystemuserid"
                value={vm.preferredUser}
                label="Preferred User (native lookup)"
                showIcons
              />
              {/* Polymorphic (Customer) lookup: parentcustomerid targets account
                  OR contact, so the flyout header shows a target switcher. This is
                  the live test of the native lookup's polymorphic path. */}
              <SmartNativeLookup
                entity="contact"
                attribute="parentcustomerid"
                value={vm.parentCustomer}
                label="Company Name (polymorphic native lookup)"
                showIcons
              />
              <SmartOptionSet entity="contact" attribute="gendercode" value={vm.gender} />
              <SmartBooleanField entity="contact" attribute="donotemail" value={vm.doNotEmail} />
              <SmartNumberField
                entity="contact"
                attribute="numberofchildren"
                value={vm.numberOfChildren}
              />
              <SmartNumberField
                entity="contact"
                attribute="creditlimit"
                value={vm.creditLimit}
                transactionCurrencyId={vm.transactionCurrencyId.value ?? undefined}
              />
              <SmartDatePicker entity="contact" attribute="birthdate" value={vm.birthDate} />
              <SmartTextField entity="contact" attribute="description" value={vm.description} />
            </div>

            <div>
              <Button
                appearance="primary"
                onClick={() => void vm.onSaveContact()}
                disabled={vm.isSaving.value}
              >
                {vm.isSaving.value ? "Saving…" : "Save"}
              </Button>
            </div>
            {vm.saveMessage.value ? <div className={styles.hint}>{vm.saveMessage.value}</div> : null}
          </div>
        )
      ) : null}
    </div>
  );
};
