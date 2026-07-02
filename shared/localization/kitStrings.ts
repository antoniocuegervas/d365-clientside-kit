/**
 * The kit's user-facing chrome strings, everything a control shows that is
 * not data (data, metadata display names, option labels, and formatted values
 * already arrive user-localized from the platform).
 *
 * English is the built-in default. An app or PCF root overrides once at boot,
 * BEFORE rendering, with whatever source it has: a RESX webresource through
 * `context.utils.getResourceString`, a PCF resource file through
 * `context.resources.getString`, or a plain object. The user's language is
 * fixed for the session, so the strings are too; nothing re-renders on a
 * change and nothing needs a provider in the tree:
 *
 *   configureKitStrings({ noRecordsFound: getString("NoRecordsFound") });
 *
 * This module is deliberately free of React and of every kit context type, so
 * the presentational tier may import it (the lint boundary stays intact).
 */

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
};

let current: IKitStrings = defaultKitStrings;

/**
 * Replaces some or all of the kit's chrome strings. Call once at boot, before
 * rendering; later calls work but already-rendered text does not re-render.
 */
export function configureKitStrings(overrides: Partial<IKitStrings>): void {
  current = { ...defaultKitStrings, ...overrides };
}

/** The active strings. Controls read this at render time. */
export function kitStrings(): IKitStrings {
  return current;
}
