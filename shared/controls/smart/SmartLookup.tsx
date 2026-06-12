import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { Observable } from "../../reactivity/Observable";
import { EntityReference, type IEntityReference } from "../../utils/EntityModel";
import { escapeODataString } from "../../utils/odata";
import { LookupField } from "../presentational/LookupField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartLookupProps extends ISmartFieldProps<IEntityReference | null> {
  /**
   * Target entity override. Default: the attribute's first metadata target
   * (Customer/Owner lookups have several, pick explicitly for those).
   */
  targetEntity?: string;
  /** Extra OData $filter clause ANDed into the search (custom filtering step). */
  filter?: string;
  /** Max results per search. Default 10, like the native lookup flyout. */
  top?: number;
  /** Debounce for search-as-you-type, ms. Default 250. 0 disables (tests). */
  searchDebounceMs?: number;
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
      const clauses = [
        searchText ? `contains(${nameAttribute},'${escapeODataString(searchText)}')` : undefined,
        this.props.filter,
      ].filter(Boolean);
      const filter = clauses.length > 0 ? `&$filter=${clauses.join(" and ")}` : "";
      const result = await this.vmContext.webAPI.retrieveMultipleRecords(
        target,
        `?$select=${idAttribute},${nameAttribute}${filter}&$top=${this.props.top ?? 10}`
      );
      // Stale-response guard: only the latest search may write results.
      if (this.isDisposed || sequence !== this.searchSequence) {
        return;
      }
      this.results.value = result.entities.map(
        (record) =>
          new EntityReference(
            target,
            String(record[idAttribute] ?? ""),
            (record[nameAttribute] as string | undefined) ?? undefined
          )
      );
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
        onSearchTextChanged={this.handleSearchTextChanged}
        onChange={this.commitChange}
      />
    );
  }
}
