import * as React from "react";
import { kitStrings } from "../../localization/kitStrings";
import type {
  IAttributeMetadata,
  IEntityMetadata,
  ILookupOptions,
  IViewDefinition,
} from "../../context/IViewModelContext";
import { Observable } from "../../reactivity/Observable";
import { normalizeGuid, type IEntityReference } from "../../utils/EntityModel";
import { LibraryUtils } from "../../utils/LibraryUtils";
import {
  NativeLookupField,
  type INativeLookupResult,
  type INativeLookupTarget,
} from "../presentational/NativeLookupField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartNativeLookupProps extends ISmartFieldProps<IEntityReference | null> {
  /**
   * Target entity override. Defaults to the attribute's first metadata target.
   * Customer/Owner lookups have several; the flyout shows a target switcher and
   * this picks the initial one.
   */
  targetEntity?: string;
  /** Extra OData `$filter` clause ANDed into the inline search. */
  filter?: string;
  /** Max results per page. Default 10, like the native lookup flyout. */
  top?: number;
  /** Debounce for search-as-you-type, ms. Default 250. 0 disables (tests). */
  searchDebounceMs?: number;
  /** FetchXML `<filter>` applied to the Advanced dialog's view. */
  filterXml?: string;
  /** Lookup view id whose layout drives the flyout columns; default is the entity's grid view. */
  viewId?: string;
  /** Lookup view by name; resolved via getViewByName. */
  viewName?: string;
  /** Resolve and show the target entity's icon in the flyout rows. Default true. */
  showIcons?: boolean;
  /** Show the footer "Advanced" escalation to the native picker. Default true. */
  showAdvanced?: boolean;
  /** Show the footer "+ New" quick-create. Default false. */
  showNew?: boolean;
}

/** Per-target resolution: entity keys, the view layout, and the icon, cached once. */
interface ITargetContext {
  entityMetadata: IEntityMetadata;
  view: IViewDefinition;
  iconUrl?: string;
}

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

/**
 * Native-parity lookup field. Resolves the target entity from the attribute
 * (Customer/Owner expose several, offered through the flyout's target switcher),
 * loads the target's view layout for the flyout columns, and runs the lookup
 * view's first page on open plus quick-find as the user types. The presentational
 * {@link NativeLookupField} stays unaware of all of it. The footer "Advanced"
 * escalates to the native picker; the value link opens the record.
 */
export class SmartNativeLookup extends SmartFieldBase<
  IEntityReference | null,
  ISmartNativeLookupProps
> {
  // Owned by this smart wrapper: it is the data host for the flyout.
  private readonly results = new Observable<INativeLookupResult[]>([]);
  private readonly searching = new Observable<boolean>(false);
  private readonly activeTarget = new Observable<string | undefined>(undefined);
  private readonly tableLabel = new Observable<string | undefined>(undefined);
  // Icon for the selected value, resolved from its entity so the resting chip
  // shows it on load (a value from the host carries no icon).
  private readonly selectedIcon = new Observable<string | undefined>(undefined);
  private selectedIconEntity: string | undefined;
  private readonly switcherTargets = new Observable<INativeLookupTarget[] | undefined>(undefined);

  private currentMetadata: IAttributeMetadata | undefined;
  private readonly targetContexts = new Map<string, Promise<ITargetContext>>();
  private debounceHandle: ReturnType<typeof setTimeout> | undefined;
  private searchSequence = 0;
  private initialized = false;

  protected override onUnmount(): void {
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
    }
  }

  /**
   * Reset the per-target state when the binding changes on a reused instance
   * (a form branch or wizard step swaps entity, attribute, or targetEntity). The
   * base class reloads metadata; the initialized flag, active target, switcher
   * list, and result caches are this subclass's own, so it clears them here,
   * otherwise the flyout would keep searching the previous target.
   */
  override componentDidMount(): void {
    super.componentDidMount();
    this.syncTargetState();
  }

  override componentDidUpdate(prevProps: ISmartNativeLookupProps): void {
    super.componentDidUpdate(prevProps);
    const attributeChanged =
      prevProps.entity !== this.props.entity || prevProps.attribute !== this.props.attribute;
    const targetChanged = prevProps.targetEntity !== this.props.targetEntity;
    if (attributeChanged || targetChanged) {
      this.resetTargetState();
    }
    // Target and icon state syncs AFTER every commit, never during render:
    // initTargets and ensureSelectedIcon write observables, and a state write
    // from render is one Fluent update away from an update-depth loop. The
    // reset above cleared currentMetadata, so a stale binding cannot re-init
    // until renderField has run with the new metadata.
    this.syncTargetState();
  }

  /** (Re)initializes the target set and the selected value's icon, post-commit. */
  private syncTargetState(): void {
    if (this.currentMetadata) {
      this.initTargets(this.currentMetadata);
    }
    this.ensureSelectedIcon();
  }

  /** Clears every per-target field so the next binding starts clean. */
  private resetTargetState(): void {
    // Invalidate any search still in flight: it departed against the OLD
    // binding, and without the bump its late response would pass the
    // stale-response guard and fill the flyout with cross-target rows.
    this.searchSequence++;
    // Cleared so syncTargetState cannot re-init from the previous binding's
    // metadata; renderField repopulates it when the new metadata renders.
    this.currentMetadata = undefined;
    this.initialized = false;
    this.activeTarget.value = undefined;
    this.switcherTargets.value = undefined;
    this.results.value = [];
    this.searching.value = false;
    this.tableLabel.value = undefined;
    this.targetContexts.clear();
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = undefined;
    }
  }

  /** Picks the initial target and, for a polymorphic lookup, resolves the switcher labels. */
  private initTargets(metadata: IAttributeMetadata): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    const targets = metadata.targets ?? [];
    const initial = this.props.targetEntity ?? targets[0];
    this.activeTarget.value = initial;
    if (targets.length > 1) {
      // Resolve each target's display name for the switcher, then publish the list.
      void Promise.all(
        targets.map(async (entity) => ({
          entity,
          label: await this.vmContext.metadata
            .getEntityMetadata(entity)
            .then((m) => m.displayName)
            .catch(() => entity),
        }))
      ).then((resolved) => {
        if (!this.isDisposed) {
          this.switcherTargets.value = resolved;
        }
      });
    }
  }

  private resolveView(target: string): Promise<IViewDefinition> {
    if (this.props.viewId) {
      return this.vmContext.metadata.getView(target, this.props.viewId);
    }
    if (this.props.viewName) {
      return this.vmContext.metadata.getViewByName(target, this.props.viewName);
    }
    // Default to the entity's lookup view (querytype 64), what the native lookup
    // uses, not the default grid view (which filters and columns differently).
    return this.vmContext.metadata.getLookupView(target);
  }

  /** Resolves (and caches) the entity keys, view layout, and icon for a target. */
  private resolveTargetContext(target: string): Promise<ITargetContext> {
    let pending = this.targetContexts.get(target);
    if (!pending) {
      pending = (async () => {
        const [entityMetadata, view, iconUrl] = await Promise.all([
          this.vmContext.metadata.getEntityMetadata(target),
          this.resolveView(target),
          this.props.showIcons === false
            ? Promise.resolve(undefined)
            : this.vmContext.metadata.getEntityIconUrl(target).catch(() => undefined),
        ]);
        return { entityMetadata, view, iconUrl };
      })();
      this.targetContexts.set(target, pending);
      // A failed resolution must not stay cached: evict it so the next search
      // retries instead of failing for the life of the mounted control.
      pending.catch(() => {
        if (this.targetContexts.get(target) === pending) {
          this.targetContexts.delete(target);
        }
      });
    }
    return pending;
  }

  private readonly handleSearchTextChanged = (searchText: string): void => {
    if (!this.activeTarget.value) {
      return;
    }
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
    }
    const delay = this.props.searchDebounceMs ?? 250;
    if (delay <= 0) {
      void this.runSearch(searchText);
    } else {
      this.debounceHandle = setTimeout(() => void this.runSearch(searchText), delay);
    }
  };

  private async runSearch(searchText: string): Promise<void> {
    const target = this.activeTarget.value;
    if (!target) {
      return;
    }
    const sequence = ++this.searchSequence;
    this.searching.value = true;
    try {
      const context = await this.resolveTargetContext(target);
      if (!this.isDisposed && sequence === this.searchSequence) {
        this.tableLabel.value = context.entityMetadata.displayName;
      }
      const nameAttribute = context.entityMetadata.primaryNameAttribute;
      const clauses = [
        searchText
          ? `contains(${nameAttribute},'${LibraryUtils.escapeODataString(searchText)}')`
          : undefined,
        this.props.filter,
      ].filter(Boolean);
      // URL-encode the expression: search text like "R&D" would otherwise cut
      // the filter off at the ampersand, the server would reject it, and the
      // catch below would read as "no matches" for a record that exists.
      const filter =
        clauses.length > 0 ? `&$filter=${encodeURIComponent(clauses.join(" and "))}` : "";
      const top = this.props.top ?? 10;
      // Run the view as the source so its layout columns come back (with formatted
      // values), and cap with $top: the flyout wants a small suggestion list, not
      // server paging, so suppressing the nextLink is exactly right.
      const options = `?savedQuery=${context.view.id}${filter}&$top=${top}`;
      const result = await this.vmContext.webAPI.retrieveMultipleRecords(target, options);
      // Stale-response guard: only the latest search may write results.
      if (this.isDisposed || sequence !== this.searchSequence) {
        return;
      }
      this.results.value = result.entities.map((record) =>
        this.toResult(record, target, context)
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

  /** Maps a record to a flyout row: name on line 1, the view's other columns below. */
  private toResult(
    record: Record<string, unknown>,
    target: string,
    context: ITargetContext
  ): INativeLookupResult {
    const idAttribute = context.entityMetadata.primaryIdAttribute;
    const nameAttribute = context.entityMetadata.primaryNameAttribute;
    const columns = context.view.columns
      .filter((column) => column.name !== nameAttribute)
      .map((column) => ({ value: cellValue(record, column.name) }))
      .filter((column) => column.value !== "");
    return {
      id: normalizeGuid(String(record[idAttribute] ?? "")),
      name: (record[nameAttribute] as string | undefined) ?? "",
      logicalName: target,
      iconUrl: context.iconUrl,
      columns,
    };
  }

  private readonly handleTargetChange = (entity: string): void => {
    if (entity === this.activeTarget.value) {
      return;
    }
    // Cancel a search still debounced against the previous target, so it cannot
    // fire after the switch (searchSequence would discard its response, but the
    // query itself is wasted), the same clear onUnmount does.
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = undefined;
    }
    this.activeTarget.value = entity;
    this.results.value = [];
    this.tableLabel.value = undefined;
    // Reload the new target's first page right away (the flyout stays open).
    void this.runSearch("");
  };

  /** Footer "Advanced": the native picker, seeded with the resolved lookup view. */
  private readonly handleAdvanced = (): void => {
    const target = this.activeTarget.value;
    if (!target) {
      return;
    }
    void (async () => {
      const context = await this.resolveTargetContext(target);
      const options: ILookupOptions = {
        entityTypes: [target],
        defaultEntityType: target,
        allowMultiSelect: false,
        viewIds: [context.view.id],
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
        // Dialog unavailable on this host (PCF has no lookupObjects surface):
        // a dead Advanced button reads as a broken control, so say what happened.
        console.error("Lookup dialog unavailable", error);
        if (!this.isDisposed) {
          void this.vmContext.navigation.openErrorDialog({
            message: kitStrings().pickerUnavailable,
          });
        }
      }
    })();
  };

  /** Footer "+ New": quick-create the target record. */
  private readonly handleNew = (): void => {
    const target = this.activeTarget.value;
    if (target) {
      void this.vmContext.navigation.openForm({ entityName: target, useQuickCreateForm: true });
    }
  };

  /**
   * Resolves the selected value's entity icon (once per entity) so the resting
   * chip shows it without opening the flyout. Skipped when icons are off.
   */
  private ensureSelectedIcon(): void {
    if (this.props.showIcons === false) {
      return;
    }
    const entity = this.props.value.value?.logicalName;
    if (!entity) {
      if (this.selectedIcon.value !== undefined) {
        this.selectedIcon.value = undefined;
      }
      this.selectedIconEntity = undefined;
      return;
    }
    if (entity === this.selectedIconEntity) {
      return;
    }
    this.selectedIconEntity = entity;
    void this.vmContext.metadata
      .getEntityIconUrl(entity)
      .then((url) => {
        // Guard against a stale resolve after the value's entity changed.
        if (!this.isDisposed && this.props.value.value?.logicalName === entity) {
          this.selectedIcon.value = url;
        }
      })
      .catch(() => undefined);
  }

  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    // Render only records the metadata; the observable writes that depend on
    // it (initTargets, ensureSelectedIcon) run post-commit in syncTargetState.
    this.currentMetadata = metadata;
    return (
      <NativeLookupField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.resolveReadOnly(metadata)}
        hint={this.resolveHint(metadata)}
        labelPosition={this.props.labelPosition}
        errorMessage={this.props.errorMessage}
        // The placeholder uses the metadata display name even when the label is
        // suppressed (label="", e.g. a PCF inside a form field that already shows
        // the label), so it stays meaningful rather than "Look for ".
        placeholder={kitStrings().lookFor(this.props.label || metadata.displayName)}
        selected={this.props.value}
        results={this.results}
        searching={this.searching}
        selectedIconUrl={this.selectedIcon}
        tableLabel={this.tableLabel}
        targets={this.switcherTargets}
        activeTarget={this.activeTarget}
        onTargetChange={this.handleTargetChange}
        onSearchTextChanged={this.handleSearchTextChanged}
        onChange={this.commitChange}
        onOpenRecord={(ref) => void this.vmContext.navigation.openForm(ref.logicalName, ref.id)}
        onAdvanced={this.props.showAdvanced === false ? undefined : this.handleAdvanced}
        onNew={this.props.showNew ? this.handleNew : undefined}
      />
    );
  }
}

/**
 * Reads a column value for display: the formatted value when the platform
 * supplies one (option sets, money, dates, lookups), else the raw value. Lookups
 * arrive under `_attr_value`, so their formatted annotation is checked too.
 * Empty/absent values come back as "" so the caller drops them (which is what
 * keeps a value-less column from forcing the expand chevron).
 */
function cellValue(record: Record<string, unknown>, key: string): string {
  const formatted = record[`${key}${FORMATTED}`];
  if (formatted != null && formatted !== "") {
    return String(formatted);
  }
  const lookupFormatted = record[`_${key}_value${FORMATTED}`];
  if (lookupFormatted != null && lookupFormatted !== "") {
    return String(lookupFormatted);
  }
  const raw = record[key];
  if (raw != null && raw !== "") {
    return String(raw);
  }
  return "";
}
