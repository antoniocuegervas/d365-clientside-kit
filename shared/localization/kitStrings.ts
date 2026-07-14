/**
 * The kit's user-facing interface strings, everything a control shows that is
 * not data (data, metadata display names, option labels, and formatted values
 * already arrive user-localized from the platform).
 *
 * The kit ships built-in tables for English, Spanish, and Dutch. Each context
 * adapter resolves the host user language once at context creation and calls
 * `setKitStringsLanguage`, so the interface text follows the user with no app wiring;
 * an unknown or absent language stays English. English is both the default and
 * the fallback.
 *
 * Two override paths sit on top of the resolved language, and both compose in
 * either order (order does not matter):
 *   - `configureKitStrings(partial)` layers a few strings over the active
 *     language table, the way a consumer patches wording or wires a RESX or PCF
 *     resource source at boot.
 *   - `registerKitStrings(tag, table)` adds a whole language the kit does not
 *     ship (a complete IKitStrings), then `setKitStringsLanguage(tag)` selects it.
 *
 * The user's language is fixed for the session, so the strings are too; nothing
 * re-renders on a change and nothing needs a provider in the tree:
 *
 *   configureKitStrings({ noRecordsFound: getString("NoRecordsFound") });
 *
 * This module is deliberately free of React and of every kit context type, so
 * the presentational tier may import it (the lint boundary stays intact).
 */

import { spanishKitStrings } from "./strings.es";
import { dutchKitStrings } from "./strings.nl";

export interface IKitStrings {
  /** Lookup placeholder when nothing narrows it: "Look for records". */
  lookForRecords: string;
  /** Lookup placeholder over a known field: "Look for Parent Account". */
  lookFor(fieldLabel: string): string;
  noRecordsFound: string;
  typeToSearch: string;
  /** Loading spinner label (fields, flyouts). */
  loading: string;
  /** A busy primary action, e.g. the wizard finishing. */
  working: string;
  /** Grid command bar "New". */
  newLabel: string;
  /** Wizard/stepper final action. */
  finish: string;
  /** Lookup flyout footer escalation to the native picker. */
  advanced: string;
  /** Native lookup flyout header's target switcher. */
  changeTable: string;

  // Accessibility labels.
  browseRecords: string;
  clearValue: string;
  searchRecords: string;
  /** Dismiss button on the full-screen lookup search takeover. */
  closeSearch: string;
  lookupResults: string;
  loadingRows: string;
  recordRange: string;
  previousPage: string;
  nextPage: string;
  firstPage: string;
  lastPage: string;
  currentPage: string;
  jumpToPage: string;
  /** "More details for record: {name}" on a flyout row's expand chevron. */
  moreDetailsForRecord(name: string): string;

  // Pagination prose.
  pageN(page: number): string;
  pageNOfM(page: number, count: number): string;
  showingRecords(from: number, to: number): string;
  showingRecordsOfTotal(from: number, to: number, total: number): string;

  // Degraded and error surfaces.
  viewLoadError: string;
  recordsLoadError: string;
  fieldUnavailable: string;
  pickerUnavailable: string;
  activityTypeRequired: string;
  /** Lookup flyout when the search query itself failed (distinct from "no matches"). */
  searchFailed: string;
  /** A PCF on an org whose platform Fluent trails the kit's runtime floor. */
  platformWaveTooOld: string;

  // Command and navigation actions.
  /** Stepper and shell back buttons. */
  back: string;
  /** Stepper next-step action. */
  next: string;
  /** Grid/activity command bar "Edit". */
  edit: string;
  /** Grid/activity command bar "Refresh". */
  refresh: string;
  /** Grid command bar "Delete" with nothing selected. */
  deleteLabel: string;
  /** Grid command bar "Delete (N)" with a selection. */
  deleteWithCount(count: number): string;
  /** Search button text and the default search placeholder. */
  search: string;

  // Grid labels.
  /** Grid empty fallback. */
  noDataAvailable: string;
  /** Grid aria label. */
  dataGridLabel: string;
  /** Grid select-all aria label. */
  selectAllRows: string;
  /** Resize handle aria label for a named column. */
  resizeColumn(columnName: string): string;
  /** Grid command bar aria label. */
  gridActions: string;

  // Calendar navigation (threaded into the DatePicker strings object).
  /** Calendar footer "go to today". */
  goToToday: string;
  prevMonthAriaLabel: string;
  nextMonthAriaLabel: string;
  prevYearAriaLabel: string;
  nextYearAriaLabel: string;

  // Counterparty activity grid.
  /** Counterparty command bar aria label. */
  activityActions: string;
  /** The synthesized Counterparty column header. */
  counterpartyHeader: string;
  /** Overflow count after the lead party, e.g. "(+2 more)". */
  moreParties(count: number): string;
  /** A party with no inline name. */
  unnamedRecord: string;
  /** An activity persona card with no subject. */
  untitledActivity: string;
  noActivities: string;
  noMatchingActivities: string;
  searchActivitiesPlaceholder: string;
  /** Dataset pager "load more". */
  loadMore: string;
  /** Dataset pager "{shown} of {total}". */
  shownOfTotal(shown: number, total: number): string;
  /** Dataset pager "{shown} shown" (total unknown). */
  shownCount(shown: number): string;

  /** Tooltip PCF fallback when the column has no authored description. */
  noDescriptionAuthored: string;
}

export const defaultKitStrings: IKitStrings = {
  lookForRecords: "Look for records",
  lookFor: (fieldLabel) => `Look for ${fieldLabel}`,
  noRecordsFound: "No records found",
  typeToSearch: "Type to search",
  loading: "Loading…",
  working: "Working…",
  newLabel: "New",
  finish: "Finish",
  advanced: "Advanced",
  changeTable: "Change table",
  browseRecords: "Browse records",
  clearValue: "Clear value",
  searchRecords: "Search records",
  closeSearch: "Close search",
  lookupResults: "Lookup results",
  loadingRows: "Loading rows",
  recordRange: "Record range",
  previousPage: "Previous page",
  nextPage: "Next page",
  firstPage: "First page",
  lastPage: "Last page",
  currentPage: "Current page",
  jumpToPage: "Jump to page",
  moreDetailsForRecord: (name) => `More details for record: ${name}`,
  pageN: (page) => `Page ${page}`,
  pageNOfM: (page, count) => `Page ${page} of ${count}`,
  showingRecords: (from, to) => `Showing records ${from}–${to}`,
  showingRecordsOfTotal: (from, to, total) => `Showing records ${from}–${to} of ${total}`,
  viewLoadError: "This view could not be loaded in this environment.",
  recordsLoadError: "This view's records could not be loaded in this environment.",
  fieldUnavailable: "Unavailable in this environment.",
  pickerUnavailable: "The record picker could not be opened in this environment.",
  activityTypeRequired: "Activity Type Code is required on the view to open the records.",
  searchFailed: "The search could not be completed. Try again.",
  platformWaveTooOld:
    "This control needs a newer platform release wave than this environment serves. Ask your administrator to update the environment's release wave.",
  back: "Back",
  next: "Next",
  edit: "Edit",
  refresh: "Refresh",
  deleteLabel: "Delete",
  deleteWithCount: (count) => `Delete (${count})`,
  search: "Search",
  noDataAvailable: "No data available",
  dataGridLabel: "Data grid",
  selectAllRows: "Select all rows",
  resizeColumn: (columnName) => `Resize ${columnName} column`,
  gridActions: "Grid actions",
  goToToday: "Go to today",
  prevMonthAriaLabel: "Go to previous month",
  nextMonthAriaLabel: "Go to next month",
  prevYearAriaLabel: "Go to previous year",
  nextYearAriaLabel: "Go to next year",
  activityActions: "Activity actions",
  counterpartyHeader: "Counterparty",
  moreParties: (count) => `(+${count} more)`,
  unnamedRecord: "(unnamed)",
  untitledActivity: "(untitled)",
  noActivities: "No activities.",
  noMatchingActivities: "No matching activities.",
  searchActivitiesPlaceholder: "Search by subject or counterparty",
  loadMore: "Load more",
  shownOfTotal: (shown, total) => `${shown} of ${total}`,
  shownCount: (shown) => `${shown} shown`,
  noDescriptionAuthored: "No description has been authored for this column.",
};

// Registered string tables keyed by base-language tag ("en", "es", "nl", ...).
// The three built-ins register themselves at the bottom of this module; a
// consumer adds more with registerKitStrings.
const languageTables = new Map<string, IKitStrings>();

// LCID primary language id (lcid & 0x3FF) to the base tag the kit ships. A
// consumer-registered language (e.g. "fr") is selected by its tag, not an LCID.
const lcidPrimaryToTag: Record<number, string> = {
  9: "en", // English
  10: "es", // Spanish
  19: "nl", // Dutch
};

// Base-language tag currently active. English until the host resolves one.
let activeLanguage = "en";
// Consumer overrides layered over the active table. Replaced (not merged) by
// each configureKitStrings call, so passing {} clears them.
let storedOverrides: Partial<IKitStrings> = {};
// The active strings controls read at render time.
let current: IKitStrings = defaultKitStrings;

// Recomputes the active strings: the resolved language table, overrides on top.
function recomputeKitStrings(): void {
  const table = languageTables.get(activeLanguage) ?? defaultKitStrings;
  current = { ...table, ...storedOverrides };
}

/**
 * The base subtag (lowercased) a language resolves to. A number is read as an
 * LCID through its primary language id (lcid & 0x3FF); a string is read as a
 * tag, the part before its first "-" or "_". Anything the kit does not map
 * resolves to "", which falls back to English.
 */
function resolveBaseLanguage(language: number | string): string {
  if (typeof language === "number") {
    return lcidPrimaryToTag[language & 0x3ff] ?? "";
  }
  return language.split(/[-_]/)[0]?.toLowerCase() ?? "";
}

/**
 * Registers or replaces a complete string table for a base-language tag
 * ("es", "nl", "fr", ...). The whole IKitStrings is required, so a missing key
 * is a compile error. A consumer calls this to add a language the kit does not
 * ship; the built-in three call it themselves below.
 */
export function registerKitStrings(language: string, strings: IKitStrings): void {
  languageTables.set(resolveBaseLanguage(language), strings);
  recomputeKitStrings();
}

/**
 * Sets the active language from the host user setting: an LCID number (3082) or
 * a tag ("es", "es-ES"). Unknown or absent languages fall back to English.
 * Idempotent and callable any time; it recomputes the active strings as the
 * resolved table with the stored overrides on top, so it composes with
 * configureKitStrings in either call order.
 */
export function setKitStringsLanguage(language: number | string): void {
  const base = resolveBaseLanguage(language);
  activeLanguage = base && languageTables.has(base) ? base : "en";
  recomputeKitStrings();
}

/**
 * Replaces the consumer overrides layered over the ACTIVE language table. Call
 * once at boot, before rendering; later calls work but already-rendered text
 * does not re-render. The overrides survive a later setKitStringsLanguage, so
 * order does not matter; passing {} clears them and leaves the language table
 * showing through.
 */
export function configureKitStrings(overrides: Partial<IKitStrings>): void {
  storedOverrides = { ...overrides };
  recomputeKitStrings();
}

/** The active strings. Controls read this at render time. */
export function kitStrings(): IKitStrings {
  return current;
}

// The kit ships English, Spanish, and Dutch. English is the default table and
// the fallback; the other two register beside it so a resolved LCID or tag
// switches to them with no consumer wiring.
registerKitStrings("en", defaultKitStrings);
registerKitStrings("es", spanishKitStrings);
registerKitStrings("nl", dutchKitStrings);
