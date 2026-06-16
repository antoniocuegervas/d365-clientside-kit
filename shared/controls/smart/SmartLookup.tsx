import * as React from "react";
import type { IAttributeMetadata, ILookupOptions } from "../../context/IViewModelContext";
import { Observable } from "../../reactivity/Observable";
import { normalizeGuid, type IEntityReference } from "../../utils/EntityModel";
import { escapeODataString } from "../../utils/odata";
import { LookupField } from "../presentational/LookupField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartLookupProps extends ISmartFieldProps<IEntityReference | null> {
  /**
   * Target entity override. Default: the attribute's first metadata target
   * (Customer/Owner lookups have several, pick explicitly for those).
   */
  targetEntity?: string;
  /** Extra OData $filter clause ANDed into the inline search. */
  filter?: string;
  /** Max results per search. Default 10, like the native lookup flyout. */
  top?: number;
  /** Debounce for search-as-you-type, ms. Default 250. 0 disables (tests). */
  searchDebounceMs?: number;
  /**
   * "inline" (default) = embedded search-as-you-type; "dialog" = the native CRM
   * picker (recently used, view switching, create-new) via lookupObjects. Same
   * value Observable and onChange contract either way (G-02).
   */
  mode?: "inline" | "dialog";
  /** FetchXML `<filter>` applied to the dialog's view (dialog mode only). */
  filterXml?: string;
  /**
   * View-driven inline search (G-03): run a saved view as the search source so
   * admins control columns/filters. `?savedQuery={id}&$filter=contains(name,…)`.
   */
  viewId?: string;
  /** Saved view by name for view-driven search; resolved via getViewByName. */
  viewName?: string;
  /** Resolve and show the target entity's icon in inline results (G-10). */
  showIcons?: boolean;
}

/**
 * `<SmartLookup entity="contact" attribute="parentcustomerid" value={vm.company} />`
 * Target entity and primary name resolve from metadata; search-as-you-type
 * queries ride the host context. The presentational LookupField never knows
 * any of this happened.
 */
export class SmartLookup extends SmartFieldBase<IEntityReference | null, ISmartLookupProps> {
  /** Owned by this smart wrapper, IT is the host for search results. */
  private readonly results = new Observable<IEntityReference[]>([]);
  private readonly searching = new Observable<boolean>(false);
  private debounceHandle: ReturnType<typeof setTimeout> | undefined;
  private searchSequence = 0;

  override componentWillUnmount(): void {
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
    }
    super.componentWillUnmount();
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

  /** Saved view id for view-driven search (G-03), resolved once and cached. */
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

  /** Target entity icon URL (G-10), resolved once and cached. */
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
        searchText ? `contains(${nameAttribute},'${escapeODataString(searchText)}')` : undefined,
        this.props.filter,
      ].filter(Boolean);
      const filter = clauses.length > 0 ? `&$filter=${clauses.join(" and ")}` : "";
      const top = this.props.top ?? 10;
      // View-driven (G-03): run the saved view as the source; else plain select.
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
      // Empty array = cancelled, keep the current value (clear is explicit).
      if (!this.isDisposed && result.length > 0) {
        this.commitChange(result[0]);
      }
    } catch {
      // Dialog unavailable on this host, leave the value unchanged.
    }
  };

  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    this.currentMetadata = metadata;
    return (
      <LookupField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.props.readOnly}
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
