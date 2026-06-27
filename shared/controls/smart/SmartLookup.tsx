import * as React from "react";
import type { IAttributeMetadata, ILookupOptions } from "../../context/IViewModelContext";
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
   * control columns/filters. `?savedQuery={id}&$filter=contains(name,...)`.
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
  private debounceHandle: ReturnType<typeof setTimeout> | undefined;
  private searchSequence = 0;

  protected override onUnmount(): void {
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
    }
  }

  private resolveTarget(metadata: IAttributeMetadata): string | undefined {
    return this.props.targetEntity ?? metadata.targets?.[0];
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

  /** Saved view id for view-driven search, resolved once and cached. */
  private resolveViewId(target: string): Promise<string | undefined> {
    if (!this.props.viewId && !this.props.viewName) {
      return Promise.resolve(undefined);
    }
    if (!this.resolvedViewId) {
      this.resolvedViewId = this.props.viewId
        ? Promise.resolve(this.props.viewId)
        : this.vmContext.metadata
            .getViewByName(target, this.props.viewName!)
            .then((view) => view.id)
            .catch(() => undefined);
    }
    return this.resolvedViewId;
  }

  /** Target entity icon URL, resolved once and cached. */
  private resolveIcon(target: string): Promise<string | undefined> {
    if (!this.props.showIcons) {
      return Promise.resolve(undefined);
    }
    if (!this.resolvedIcon) {
      this.resolvedIcon = this.vmContext.metadata
        .getEntityIconUrl(target)
        .catch(() => undefined);
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
      const entityMetadata = await this.vmContext.metadata.getEntityMetadata(target);
      const nameAttribute = entityMetadata.primaryNameAttribute;
      const idAttribute = entityMetadata.primaryIdAttribute;
      const [viewId, iconUrl] = await Promise.all([
        this.resolveViewId(target),
        this.resolveIcon(target),
      ]);
      const clauses = [
        searchText ? `contains(${nameAttribute},'${LibraryUtils.escapeODataString(searchText)}')` : undefined,
        this.props.filter,
      ].filter(Boolean);
      const filter = clauses.length > 0 ? `&$filter=${clauses.join(" and ")}` : "";
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
    } catch {
      if (!this.isDisposed && sequence === this.searchSequence) {
        this.results.value = [];
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
    } catch {
      // Dialog unavailable on this host, so leave the value unchanged.
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
        mode={this.props.mode}
        onBrowse={() => void this.handleBrowse()}
        onSearchTextChanged={this.handleSearchTextChanged}
        onChange={this.commitChange}
      />
    );
  }
}
