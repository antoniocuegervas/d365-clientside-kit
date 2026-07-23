import type { CdsClient } from "../data/CdsClient";
import type {
  IActivityTypeInfo,
  ICurrencyInfo,
  IViewDefinition,
  IWebApi,
} from "../context/IViewModelContext";
import { LibraryUtils } from "../utils/LibraryUtils";
import { localizedLabel } from "./CdsEntityMetadataProvider";
import type { IMetadataSource } from "./IMetadataSource";
import { toViewDefinition } from "./viewLayout";

/**
 * The slice of the host Web API the metadata helpers read through. Saved
 * views and currency are DATA (savedquery and transactioncurrency rows), not
 * metadata, so they ride the host's own Web API: native Xrm.WebApi on the
 * modern host and the PCF webAPI on that host, both offline-capable, and the
 * cds-backed emulation on pre-v9. The adapter passes its IWebApi.
 */
export type IMetadataDataReads = Pick<IWebApi, "retrieveRecord" | "retrieveMultipleRecords">;

/**
 * Out-of-box activity entities that are not created directly from a grid's New
 * action (activitypointer itself, recurring master, and system-written types), so they
 * are kept out of the activity-type picker.
 */
const NON_CREATABLE_ACTIVITY_TYPES = new Set([
  "activitypointer",
  "recurringappointmentmaster",
  "untrackedemail",
  "socialactivity",
  "bulkoperation",
]);

/**
 * KitMetadataSource, the one IMetadataSource implementation, serving every
 * host through two transports:
 *
 * - Saved views and currency info are data reads and go through the injected
 *   host Web API slice, so on modern and PCF they are served by the platform
 *   (offline-capable) rather than raw XHR.
 * - The activity-type listing and entity icons are EntityDefinitions queries
 *   only OData can express, so they stay on cds-client (online-only) on every
 *   host.
 */
export class KitMetadataSource implements IMetadataSource {
  private readonly dataReads: IMetadataDataReads;
  private readonly client: CdsClient;

  constructor(options: { dataReads: IMetadataDataReads; client: CdsClient }) {
    this.dataReads = options.dataReads;
    this.client = options.client;
  }

  /**
   * The savedquery columns every view read selects. `layoutjson` postdates the
   * CRM 8.x Web API, and asking for a property the type does not have fails the
   * WHOLE request there ("Could not find a property named 'layoutjson'"), so
   * the v8 line omits it and `toViewDefinition` falls back to layoutxml. The
   * fallback keeps column names, widths, hidden cells, and sort flags; what
   * layoutxml cannot carry is the owning entity of an aliased link-entity
   * column, whose cell name there is an opaque composite.
   */
  private viewSelect(): string {
    const major = Number(/^(\d+)/.exec(this.client.apiVersion)?.[1] ?? "9");
    const layout = major >= 9 ? "layoutxml,layoutjson" : "layoutxml";
    return `$select=name,fetchxml,${layout},returnedtypecode,savedqueryid`;
  }

  async loadView(entityLogicalName: string, savedQueryId?: string): Promise<IViewDefinition> {
    const select = `?${this.viewSelect()}`;
    let raw: Record<string, unknown>;
    if (savedQueryId) {
      raw = await this.dataReads.retrieveRecord("savedquery", savedQueryId, select);
    } else {
      // Default public grid view for the entity (querytype 0). The filter
      // expression is percent-encoded whole, quote escaping alone leaves &,
      // # and % free to break the URL apart.
      const filter =
        `returnedtypecode eq '${LibraryUtils.escapeODataString(entityLogicalName)}' and querytype eq 0 ` +
        `and isdefault eq true and statecode eq 0`;
      const result = await this.dataReads.retrieveMultipleRecords(
        "savedquery",
        `${select}&$filter=${encodeURIComponent(filter)}&$top=1`
      );
      if (result.entities.length === 0) {
        throw new Error(`No default grid view found for entity '${entityLogicalName}'`);
      }
      raw = result.entities[0];
    }
    return toViewDefinition(raw, entityLogicalName, savedQueryId);
  }

  async loadLookupView(entityLogicalName: string): Promise<IViewDefinition> {
    const select = `?${this.viewSelect()}`;
    // Default lookup view for the entity (querytype 64), the one the native
    // single-record lookup uses. Filter percent-encoded whole, same as loadView.
    const filter =
      `returnedtypecode eq '${LibraryUtils.escapeODataString(entityLogicalName)}' and querytype eq 64 ` +
      `and isdefault eq true and statecode eq 0`;
    const result = await this.dataReads.retrieveMultipleRecords(
      "savedquery",
      `${select}&$filter=${encodeURIComponent(filter)}&$top=1`
    );
    if (result.entities.length === 0) {
      // No lookup view (some entities have none), fall back to the grid view.
      return this.loadView(entityLogicalName);
    }
    return toViewDefinition(result.entities[0], entityLogicalName);
  }

  /**
   * Resolves a system view by display name. Proven query shape: filter
   * savedqueries on name + returnedtypecode + active state; expect exactly one.
   */
  async loadViewByName(entityLogicalName: string, viewName: string): Promise<IViewDefinition> {
    const select = this.viewSelect();
    // The expression goes into the URL percent-encoded whole: a display name
    // like "R&D Accounts" would otherwise split the $filter parameter and 400.
    const filter =
      `name eq '${LibraryUtils.escapeODataString(viewName)}' and ` +
      `returnedtypecode eq '${LibraryUtils.escapeODataString(entityLogicalName)}' and statecode eq 0`;
    const result = await this.dataReads.retrieveMultipleRecords(
      "savedquery",
      `?${select}&$filter=${encodeURIComponent(filter)}`
    );
    if (result.entities.length === 0) {
      throw new Error(`No active view named '${viewName}' found for entity '${entityLogicalName}'`);
    }
    if (result.entities.length > 1) {
      throw new Error(
        `Ambiguous view name '${viewName}' for entity '${entityLogicalName}' ` +
          `(${result.entities.length} matches)`
      );
    }
    return toViewDefinition(result.entities[0], entityLogicalName);
  }

  /**
   * Lists the directly-creatable activity types, ordered by display name. Filters
   * to out-of-box activities (IsCustomEntity false) and drops the system ones that
   * are not created directly from a grid (recurring master, untracked email,
   * social activity), so the list reads like the native "New activity" menu. Add-on
   * and custom activity types are out by design; widen this if a deployment needs
   * its own custom activity in the picker.
   */
  async loadActivityTypes(): Promise<IActivityTypeInfo[]> {
    const raw = await this.client.get(
      "EntityDefinitions?$filter=IsActivity eq true and IsCustomEntity eq false" +
        "&$select=LogicalName,DisplayName,ObjectTypeCode"
    );
    const rows = (raw.value as Array<Record<string, unknown>> | undefined) ?? [];
    return rows
      .map((row) => ({
        logicalName: (row.LogicalName as string) ?? "",
        displayName: localizedLabel(row.DisplayName) ?? (row.LogicalName as string) ?? "",
        objectTypeCode: (row.ObjectTypeCode as number) ?? 0,
      }))
      .filter((type) => type.logicalName && !NON_CREATABLE_ACTIVITY_TYPES.has(type.logicalName))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * The org's pricing decimal precision, the rounding a PrecisionSource 2
   * money attribute uses. A data read (the organization row), so it rides the
   * host Web API like currency and stays offline-capable on modern and PCF.
   */
  async loadPricingDecimalPrecision(): Promise<number | undefined> {
    const result = await this.dataReads.retrieveMultipleRecords(
      "organization",
      "?$select=pricingdecimalprecision&$top=1"
    );
    const value = result.entities[0]?.pricingdecimalprecision;
    return typeof value === "number" ? value : undefined;
  }

  /** Resolves a transaction currency's symbol + precision by id. */
  async loadCurrencyInfo(transactionCurrencyId: string): Promise<ICurrencyInfo> {
    const raw = await this.dataReads.retrieveRecord(
      "transactioncurrency",
      transactionCurrencyId,
      "?$select=currencysymbol,currencyprecision"
    );
    return {
      symbol: (raw.currencysymbol as string) ?? "$",
      precision: raw.currencyprecision as number | undefined,
    };
  }

  /**
   * Resolves an entity's icon URL. Rules carried from production (the
   * OOTB `svg_<otc>.svg` path is a tested assumption, not documented platform
   * behavior): a vector webresource when the entity has one, else
   * `/_imgs/svg_<ObjectTypeCode>.svg`. The fallthrough matters for
   * underscore-named first-party entities (the msdyn_ family) that ship
   * without a vector icon; they still have a served type-code icon.
   */
  async loadEntityIconUrl(entityLogicalName: string): Promise<string | undefined> {
    const raw = await this.client.get(
      `EntityDefinitions(LogicalName='${LibraryUtils.escapeODataString(entityLogicalName)}')` +
        `?$select=LogicalName,ObjectTypeCode,IconVectorName`
    );
    const base = this.client.clientUrl;
    const vector = raw.IconVectorName as string | undefined;
    if (vector) {
      return `${base}/WebResources/${vector}`;
    }
    const objectTypeCode = raw.ObjectTypeCode as number | undefined;
    return objectTypeCode !== undefined && objectTypeCode !== null
      ? `${base}/_imgs/svg_${objectTypeCode}.svg`
      : undefined;
  }
}
