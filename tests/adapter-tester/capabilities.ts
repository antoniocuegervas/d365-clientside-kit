import type { ITestResult } from "./types";

/**
 * The platform-capability matrix the kit stands on, hand-curated from a code
 * inventory. Two purposes: state OUT LOUD which Dataverse features the kit
 * genuinely requires (so a v9-only dependency can never ship invisibly), and
 * classify the rest as informational reads for the org report.
 *
 * Representative evidence sites (plain paths, no line numbers):
 *  - annotations: shared/data/CdsClient.ts (Prefer on every GET, parseCollection),
 *    shared/utils/EntityModel.ts (fromODataRecord annotation triplet),
 *    shared/features/counterparty/counterparty.ts (FormattedValue + lookuplogicalname).
 *  - fetchxml channel: shared/context/WebResourceContext.ts (ModernWebApi.fetch
 *    rides cds-client even on modern), shared/data/CdsClient.ts (fetch).
 *  - fetchxml paging: shared/data/CdsClient.ts (parseCollection paging annotations).
 *  - link-entity alias: shared/metadata/viewLayout.ts, shared/features/counterparty.
 *  - savedQuery / settings reads: shared/metadata/KitMetadataSource.ts (savedquery,
 *    transactioncurrency, organization), shared/context/hostSurface.ts
 *    (usersettingscollection in resolveFormatting).
 *  - odata query options: shared/data/CdsClient.ts (retrieveMultiple),
 *    shared/controls/smart/SmartNativeLookup.tsx (startswith search).
 *  - batch: shared/data/CdsClient.ts (getCollectionViaBatch, executeMultiple,
 *    executeChangeSet).
 *  - create OData-EntityId header: shared/data/CdsClient.ts (createRecord).
 *  - odata.bind incl. polymorphic: shared/data/CdsClient.ts (change-set body),
 *    shared/context/IViewModelContext.ts (IChangeSetRequest).
 *  - unbound functions + metadata synthesis: shared/data/CdsClient.ts (execute
 *    functions), shared/metadata/CdsEntityMetadataProvider.ts (EntityDefinitions,
 *    Attributes, PicklistAttributeMetadata cast, $expand OptionSet/GlobalOptionSet,
 *    DisplayName.UserLocalizedLabel.Label).
 */

export type CapabilityRequirement = "kit-required" | "informational";

export interface ICapability {
  id: string;
  label: string;
  requirement: CapabilityRequirement;
  /** Test ids whose outcome decides this capability's verdict. */
  probedBy: string[];
  notes: string;
}

//#region kit-required

const KIT_REQUIRED: readonly ICapability[] = [
  {
    id: "annotations",
    label: 'Prefer odata.include-annotations="*" honored (FormattedValue + lookuplogicalname returned)',
    requirement: "kit-required",
    probedBy: ["t1-formatted-values", "t1-formatted-values-fetch"],
    notes:
      "Every kit read asks for annotations; formatted values and lookup logical names are read straight off them (EntityModel.fromODataRecord, counterparty).",
  },
  {
    id: "fetchxml-channel",
    label: "FetchXML via the ?fetchXml= collection query option, on every host",
    requirement: "kit-required",
    probedBy: [
      "t1-fetchxml",
      "t1-formatted-values-fetch",
      "t1-fetch-paging",
      "t1-link-alias",
    ],
    notes:
      "The kit routes fetch/fetchPage through its own XHR client even on modern, because native Xrm.WebApi drops the paging annotations.",
  },
  {
    id: "fetchxml-paging",
    label:
      "FetchXML paging contract (page/count, returntotalrecordcount, totalrecordcount/morerecords/pagingcookie annotations)",
    requirement: "kit-required",
    probedBy: ["t1-fetch-paging"],
    notes: "Drives the grid's total-count label and next/prev paging.",
  },
  {
    id: "link-entity-alias",
    label: "FetchXML link-entity aliased columns and their returned key names",
    requirement: "kit-required",
    probedBy: ["t1-link-alias"],
    notes:
      "v8 encodes the alias dot as x002e; the kit normalizes encoded keys to the modern dotted shape at the client (CdsClient.parseCollection). The probe ASSERTS the dotted shape on the kit channel and REPORTS the platform's wire shape alongside.",
  },
  {
    id: "saved-query",
    label: "savedQuery={id} predefined-query option",
    requirement: "kit-required",
    probedBy: ["t1-savedquery"],
    notes: "Opening a system view by id feeds it straight to retrieveMultiple.",
  },
  {
    id: "odata-query-options",
    label: "$select/$filter/$orderby/$top plus startswith and contains filter functions",
    requirement: "kit-required",
    probedBy: ["t1-working-query"],
    notes:
      "Plain reads and the native-lookup search (startswith) build these directly (CdsClient, SmartNativeLookup).",
  },
  {
    id: "batch",
    label: "$batch multipart (long-URL GET fallback, executeMultiple, transactional changesets)",
    requirement: "kit-required",
    probedBy: ["t1-batch"],
    notes: "One multipart mechanism backs three kit features.",
  },
  {
    id: "create-entityid-header",
    label: "Create returning the OData-EntityId header",
    requirement: "kit-required",
    probedBy: ["t2-write-roundtrip", "t2-escaped-literal", "t2-polymorphic-bind"],
    notes: "The v8 create path reads the new id from this header; it does NOT use return=representation.",
  },
  {
    id: "odata-bind",
    label: "@odata.bind association writes incl. the polymorphic target-suffixed navigation property",
    requirement: "kit-required",
    probedBy: ["t2-polymorphic-bind"],
    notes: "parentcustomerid_account@odata.bind is the polymorphic form the change-set path emits.",
  },
  {
    id: "unbound-and-metadata",
    label:
      "Unbound functions (WhoAmI) and the metadata synthesis endpoints (EntityDefinitions, Attributes, Picklist cast, $expand OptionSet/GlobalOptionSet, UserLocalizedLabel)",
    requirement: "kit-required",
    probedBy: ["t1-whoami", "t1-entity-metadata", "t1-metadata-cast"],
    notes:
      "The v8 metadata store is synthesized entirely from these endpoints; WhoAmI is the simplest unbound-function probe.",
  },
  {
    id: "settings-reads",
    label: "usersettingscollection and savedquery/transactioncurrency/organization reads",
    requirement: "kit-required",
    probedBy: ["t1-usersettings", "t1-currency", "t1-view", "t1-savedquery"],
    notes: "Separators, currency symbol/precision, org pricing precision, and views all come from these entities.",
  },
];

//#endregion

//#region informational (kit does NOT depend on these)

const INFORMATIONAL: readonly ICapability[] = [
  {
    id: "api-version-path",
    label: "The /api/data/v9.0/ path (8.x vs 9.x classifier). The kit does NOT depend on it.",
    requirement: "informational",
    probedBy: ["t1-version-path"],
    notes: "A 200 here classifies the org as 9.x; a 404 as 8.x. Reported for the org profile only.",
  },
  {
    id: "apply-aggregation",
    label: "$apply aggregation. The kit does NOT use it.",
    requirement: "informational",
    probedBy: ["t1-apply-aggregate"],
    notes: "Present on 9.x, absent on 8.2. Reported, never required.",
  },
  {
    id: "expand-deferral",
    label: "Collection-valued $expand: inline rows vs @odata.nextLink deferral. The kit does NOT depend on it.",
    requirement: "informational",
    probedBy: ["t1-expand-deferral"],
    notes: "Reports which shape the org returns for a collection-valued expand.",
  },
  {
    id: "odata-count",
    label: "$count=true. The kit does NOT use it.",
    requirement: "informational",
    probedBy: ["t1-count"],
    notes: "The kit takes totals from FetchXML returntotalrecordcount, not $count.",
  },
  {
    id: "return-representation",
    label:
      "return=representation (also the 8.0/8.1-vs-8.2 classifier). The kit does NOT use it.",
    requirement: "informational",
    probedBy: ["t2-return-representation"],
    notes: "The create path reads the OData-EntityId header instead. Probed only for the org profile.",
  },
];

//#endregion

/** The whole registry, kit-required first, in render order. */
export const capabilities: readonly ICapability[] = [...KIT_REQUIRED, ...INFORMATIONAL];

/**
 * Features the kit DELIBERATELY does not use, rendered as a static list so a
 * reader sees the boundary is a choice, not an oversight.
 */
export const deliberatelyNotUsed: readonly string[] = [
  "$apply aggregation",
  "alternate-key addressing",
  "upsert / If-None-Match",
  "deep insert",
  "return=representation",
  "userquery (personal view) reads",
  "associate / disassociate /$ref endpoints",
  "$count=true",
];

//#region verdict aggregation

export type CapabilityVerdict = "confirmed" | "failed" | "not-probed";

export interface ICapabilityRow {
  capability: ICapability;
  verdict: CapabilityVerdict;
  /** Ids of the probing tests that have actually run, for the report. */
  ranProbes: string[];
}

/**
 * Joins a capability to the run so far: FAILED if any probing test failed,
 * CONFIRMED if at least one passed, else NOT-PROBED (no probe ran yet, or every
 * probe skipped). A kit-required capability probed only by tier-2 tests reads
 * not-probed until the write tier runs, which is the "tier 2 pending" state.
 */
export function verdictFor(
  capability: ICapability,
  resultsById: Map<string, ITestResult>
): ICapabilityRow {
  const ran = capability.probedBy.filter((id) => resultsById.has(id));
  const statuses = ran.map((id) => resultsById.get(id)!.status);
  let verdict: CapabilityVerdict;
  if (statuses.includes("fail")) {
    verdict = "failed";
  } else if (statuses.includes("pass")) {
    verdict = "confirmed";
  } else {
    verdict = "not-probed";
  }
  return { capability, verdict, ranProbes: ran };
}

export interface ICapabilitySummary {
  confirmed: number;
  failed: number;
  notProbed: number;
  rows: ICapabilityRow[];
}

/**
 * The one kit-required verdict line the summary strip and the report both
 * render; the tier-2-pending suffix appears only while probes are pending. In
 * pinned mode (the API version lab), `pinnedVersion` appends "(at the vX.Y
 * path)" so the verdict cannot be misread as the host-default surface.
 */
export function capabilityVerdictText(
  summary: ICapabilitySummary,
  pinnedVersion?: string
): string {
  const base = `Kit-required capabilities: ${summary.confirmed} confirmed, ${summary.failed} failed`;
  const withPending =
    summary.notProbed > 0
      ? `${base}, ${summary.notProbed} not yet probed (tier 2 pending)`
      : base;
  return pinnedVersion ? `${withPending} (at the v${pinnedVersion} path)` : withPending;
}

/** Verdict rows plus kit-required tallies, joining results by probedBy id. */
export function summarizeCapabilities(results: readonly ITestResult[]): ICapabilitySummary {
  const byId = new Map(results.map((r) => [r.id, r]));
  const rows = capabilities.map((capability) => verdictFor(capability, byId));
  const required = rows.filter((row) => row.capability.requirement === "kit-required");
  return {
    confirmed: required.filter((row) => row.verdict === "confirmed").length,
    failed: required.filter((row) => row.verdict === "failed").length,
    notProbed: required.filter((row) => row.verdict === "not-probed").length,
    rows,
  };
}

//#endregion
