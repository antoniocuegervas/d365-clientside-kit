import * as React from "react";
import { kitStrings } from "../../localization/kitStrings";
import type { IAttributeMetadata, ILookupOptions } from "../../context/IViewModelContext";
import { attributeTargets } from "../../metadata/attributeMetadataReads";
import { Observable } from "../../reactivity/Observable";
import { normalizeGuid, type IEntityReference } from "../../utils/EntityModel";
import { LibraryUtils } from "../../utils/LibraryUtils";
import { LookupField } from "../presentational/LookupField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartLookupProps extends ISmartFieldProps<IEntityReference | null> {
  /**
   * Target entity override. Defaults to the attribute's first metadata target.
   * Customer/Owner lookups have several, so pick one explicitly for those.
   */
  targetEntity?: string;
  /** Extra OData $filter clause ANDed into the inline search. */
  filter?: string;
  /** Max results per search. Default 10, like the native lookup flyout. */
  top?: number;
  /** Debounce for search-as-you-type, ms. Default 250. 0 disables (tests). */
  searchDebounceMs?: number;
  /**
   * "inline" (default) is embedded search-as-you-type; "dialog" is the native
   * CRM picker (recently used, view switching, create-new) via lookupObjects.
   * Same value Observable and onChange contract either way.
   */
  mode?: "inline" | "dialog";
  /** FetchXML `<filter>` applied to the dialog's view (dialog mode only). */
  filterXml?: string;
  /**
   * View-driven inline search: run a saved view as the search source so admins
   * control columns/filters. `?savedQuery={id}&$filter=startswith(name,...)`.
   */
  viewId?: string;
  /** Saved view by name for view-driven search; resolved via getViewByName. */
  viewName?: string;
  /** Resolve and show the target entity's icon in inline results. */
  showIcons?: boolean;
}

/**
 * Lookup field. The target entity and its primary name/id resolve from the
 * attribute, and search-as-you-type runs against the host context (the
 * presentational LookupField stays unaware of it). `SmartFieldBase` loads the
 * metadata and renders the loading/error state.
 */
export class SmartLookup extends SmartFieldBase<IEntityReference | null, ISmartLookupProps> {
  /** Owned by this smart wrapper: it is the host for search results. */
  private readonly results = new Observable<IEntityReference[]>([]);
  private readonly searching = new Observable<boolean>(false);
  private readonly searchFailed = new Observable<boolean>(false);
  private debounceHandle: ReturnType<typeof setTimeout> | undefined;
  private searchSequence = 0;

  protected override onUnmount(): void {
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
    }
  }

  /**
   * Reset the per-target caches when the binding changes on a reused instance
   * (a form branch or wizard step swaps entity, attribute, or targetEntity). The
   * base class reloads metadata and re-subscribes the value; the resolved view id
   * and icon are this subclass's own, so it clears them here, otherwise the next
   * search would run the previous target's saved view against the new entity.
   */
  override componentDidUpdate(prevProps: ISmartLookupProps): void {
    super.componentDidUpdate(prevProps);
    if (
      prevProps.entity !== this.props.entity ||
      prevProps.attribute !== this.props.attribute ||
      prevProps.targetEntity !== this.props.targetEntity
    ) {
      // Invalidate any search still in flight: it departed against the OLD
      // target, and without the bump its late response would pass the
      // stale-response guard and fill the flyout with cross-target rows.
      this.searchSequence++;
      this.resolvedViewId = undefined;
      this.resolvedIcon = undefined;
      this.results.value = [];
      this.searching.value = false;
      this.searchFailed.value = false;
      if (this.debounceHandle !== undefined) {
        clearTimeout(this.debounceHandle);
        this.debounceHandle = undefined;
      }
    }
  }

  private resolveTarget(metadata: IAttributeMetadata): string | undefined {
    return this.props.targetEntity ?? attributeTargets(metadata)[0];
  }

  private readonly handleSearchTextChanged = (searchText: string): void => {
    const metadata = this.currentMetadata;
    if (!metadata) {
      return;
    }
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
    }
    const delay = this.props.searchDebounceMs ?? 250;
    if (delay <= 0) {
      void this.runSearch(searchText, metadata);
    } else {
      this.debounceHandle = setTimeout(() => void this.runSearch(searchText, metadata), delay);
    }
  };

  private currentMetadata: IAttributeMetadata | undefined;
  private resolvedViewId: Promise<string | undefined> | undefined;
  private resolvedIcon: Promise<string | undefined> | undefined;

  /**
   * Saved view id for the search source, resolved once and cached. Defaults to
   * the entity's lookup view (querytype 64), what the native lookup uses, so a
   * plain `SmartLookup` searches the same records the platform lookup shows
   * (the unfiltered table would surface non-interactive/application users a
   * lookup view hides). `viewId`/`viewName` override it.
   */
  private resolveViewId(target: string): Promise<string | undefined> {
    if (!this.resolvedViewId) {
      // A failed resolution clears the cache slot before degrading, so one
      // transient failure does not lock every later search out of the lookup
      // view (the view is what filters non-interactive users out).
      this.resolvedViewId = this.props.viewId
        ? Promise.resolve(this.props.viewId)
        : this.props.viewName
          ? this.vmContext.metadata
              .getViewByName(target, this.props.viewName)
              .then((view) => view.id)
              .catch((error) => {
                // The fallback searches WITHOUT the view's filtering, which is
                // the point of a lookup view, so the degrade must leave a trace.
                console.warn("Lookup view resolution failed, searching without a view", error);
                this.resolvedViewId = undefined;
                return undefined;
              })
          : this.vmContext.metadata
              .getLookupView(target)
              .then((view) => view.id)
              .catch((error) => {
                console.warn("Lookup view resolution failed, searching without a view", error);
                this.resolvedViewId = undefined;
                return undefined;
              });
    }
    return this.resolvedViewId;
  }

  /** Target entity icon URL, resolved once and cached; a failure retries next search. */
  private resolveIcon(target: string): Promise<string | undefined> {
    if (!this.props.showIcons) {
      return Promise.resolve(undefined);
    }
    if (!this.resolvedIcon) {
      this.resolvedIcon = this.vmContext.metadata
        .getEntityIconUrl(target)
        .catch(() => {
          this.resolvedIcon = undefined;
          return undefined;
        });
    }
    return this.resolvedIcon;
  }

  private async runSearch(searchText: string, metadata: IAttributeMetadata): Promise<void> {
    const target = this.resolveTarget(metadata);
    if (!target) {
      return;
    }
    const sequence = ++this.searchSequence;
    this.searching.value = true;
    try {
      const entityMetadata = await this.vmContext.utils.getEntityMetadata(target, []);
      const nameAttribute = entityMetadata.PrimaryNameAttribute ?? "name";
      const idAttribute = entityMetadata.PrimaryIdAttribute ?? `${target}id`;
      const [viewId, iconUrl] = await Promise.all([
        this.resolveViewId(target),
        this.resolveIcon(target),
      ]);
      // Begins-with, matching the native lookup's default match behavior.
      const clauses = [
        searchText
          ? `startswith(${nameAttribute},'${LibraryUtils.escapeODataString(searchText)}')`
          : undefined,
        this.props.filter,
      ].filter(Boolean);
      // URL-encode the expression: search text like "R&D" would otherwise cut
      // the filter off at the ampersand, the server would reject it, and the
      // catch below would read as "no matches" for a record that exists.
      const filter =
        clauses.length > 0 ? `&$filter=${encodeURIComponent(clauses.join(" and "))}` : "";
      const top = this.props.top ?? 10;
      // $top is deliberate here, unlike the paged grid path: the lookup flyout
      // wants a small capped suggestion list, not server-side paging, so capping
      // with $top (which suppresses the nextLink paging relies on) is exactly
      // what we want.
      // View-driven: run the saved view as the source, else a plain select.
      const options = viewId
        ? `?savedQuery=${viewId}${filter}&$top=${top}`
        : `?$select=${idAttribute},${nameAttribute}${filter}&$top=${top}`;
      const result = await this.vmContext.webAPI.retrieveMultipleRecords(target, options);
      // Stale-response guard: only the latest search may write results.
      if (this.isDisposed || sequence !== this.searchSequence) {
        return;
      }
      this.results.value = result.entities.map((record) => ({
        id: normalizeGuid(String(record[idAttribute] ?? "")),
        logicalName: target,
        name: (record[nameAttribute] as string | undefined) ?? undefined,
        iconUrl,
      }));
      this.searchFailed.value = false;
    } catch (error) {
      // A failed query must never read as "no matches": the user would
      // conclude the record does not exist and create a duplicate. Log for
      // developers and flag the flyout's failed state for the user.
      console.error("Lookup search failed", error);
      if (!this.isDisposed && sequence === this.searchSequence) {
        this.results.value = [];
        this.searchFailed.value = true;
      }
    } finally {
      if (!this.isDisposed && sequence === this.searchSequence) {
        this.searching.value = false;
      }
    }
  }

  /** Dialog mode: summon the native picker and commit the chosen record. */
  private readonly handleBrowse = async (): Promise<void> => {
    const metadata = this.currentMetadata;
    if (!metadata) {
      return;
    }
    const target = this.resolveTarget(metadata);
    if (!target) {
      return;
    }
    const options: ILookupOptions = {
      entityTypes: [target],
      defaultEntityType: target,
      allowMultiSelect: false,
      filters: this.props.filterXml
        ? [{ entityLogicalName: target, filterXml: this.props.filterXml }]
        : undefined,
    };
    try {
      const result = await this.vmContext.navigation.lookupObjects(options);
      // Empty array means cancelled, so keep the current value (clearing is explicit).
      if (!this.isDisposed && result.length > 0) {
        this.commitChange(result[0]);
      }
    } catch (error) {
      // Dialog unavailable on this host (PCF has no lookupObjects surface): a
      // dead Browse button reads as a broken control, so say what happened.
      console.error("Lookup dialog unavailable", error);
      if (!this.isDisposed) {
        void this.vmContext.navigation.openErrorDialog({
          message: kitStrings().pickerUnavailable,
        });
      }
    }
  };

  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    this.currentMetadata = metadata;
    return (
      <LookupField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.resolveReadOnly(metadata)}
        hint={this.resolveHint(metadata)}
        labelPosition={this.props.labelPosition}
        errorMessage={this.props.errorMessage}
        selected={this.props.value}
        results={this.results}
        searching={this.searching}
        searchFailed={this.searchFailed}
        mode={this.props.mode}
        onBrowse={() => void this.handleBrowse()}
        onSearchTextChanged={this.handleSearchTextChanged}
        onChange={this.commitChange}
        onOpenRecord={(ref) => void this.vmContext.navigation.openForm(ref.logicalName, ref.id)}
      />
    );
  }
}
