import * as React from "react";
import { SmartComponent } from "../../context/ViewModelContextProvider";
import type { IViewDefinition } from "../../context/IViewModelContext";
import { Observable, type Unsubscribe } from "../../reactivity/Observable";
import type { ObservableEvent } from "../../reactivity/ObservableEvent";
import { formattedValue } from "../../utils/odata";
import { DataGrid, type IGridColumn, type IGridRow } from "../presentational/DataGrid";

export interface ISmartViewGridProps {
  /** Entity logical name, e.g. "account". */
  entity: string;
  /** Saved view (savedquery) id. Omit to use the entity's default grid view. */
  viewId?: string;
  /** Programmatic refresh channel, publish to re-run the view query (#2). */
  refresh?: ObservableEvent<void>;
  /** Row click → the record id behind the row. */
  onRecordSelected?: (recordId: string, row: IGridRow) => void;
  /** Host-owned selected record id for row highlight. */
  selectedRecordId?: Observable<string | null>;
  emptyMessage?: string;
}

interface ISmartViewGridState {
  loadError?: string;
}

/**
 * Read-only saved-view grid: one view id in, native-looking grid out , 
 * the "saved-view grid in a webresource" fast path. The smart tier loads the
 * view, runs its FetchXML, resolves column headers from metadata, and feeds
 * a plain presentational DataGrid.
 */
export class SmartViewGrid extends SmartComponent<ISmartViewGridProps, ISmartViewGridState> {
  /** This wrapper is the host for grid data. */
  private readonly columns = new Observable<IGridColumn[]>([]);
  private readonly rows = new Observable<IGridRow[]>([]);
  private readonly loading = new Observable<boolean>(true);
  private refreshSubscription: Unsubscribe | undefined;
  private view: IViewDefinition | undefined;

  constructor(props: ISmartViewGridProps) {
    super(props);
    this.state = {};
    this.observe(this.columns, this.rows, this.loading, props.selectedRecordId);
  }

  override componentDidMount(): void {
    this.refreshSubscription = this.props.refresh?.subscribe(() => void this.loadRows());
    void this.initialize();
  }

  override componentWillUnmount(): void {
    this.refreshSubscription?.();
    super.componentWillUnmount();
  }

  private async initialize(): Promise<void> {
    try {
      const view = await this.vmContext.metadata.getView(this.props.entity, this.props.viewId);
      if (this.isDisposed) {
        return;
      }
      this.view = view;
      this.columns.value = await this.resolveColumns(view);
      await this.loadRows();
    } catch (error) {
      if (!this.isDisposed) {
        this.loading.value = false;
        this.setState({
          loadError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Column headers come from attribute display names; aliased/linked columns fall back to the raw name. */
  private async resolveColumns(view: IViewDefinition): Promise<IGridColumn[]> {
    return Promise.all(
      view.columns.map(async (column) => {
        let header = column.name;
        try {
          const attribute = await this.vmContext.metadata.getAttributeMetadata(
            view.entityLogicalName,
            column.name
          );
          header = attribute.displayName;
        } catch {
          // linked-entity or aliased column, keep the raw name
        }
        return { key: column.name, name: header, width: column.width } satisfies IGridColumn;
      })
    );
  }

  private async loadRows(): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }
    this.loading.value = true;
    try {
      const result = await this.vmContext.webAPI.fetch(view.entityLogicalName, view.fetchXml);
      if (this.isDisposed) {
        return;
      }
      const entityMetadata = await this.vmContext.metadata.getEntityMetadata(
        view.entityLogicalName
      );
      const idAttribute = entityMetadata.primaryIdAttribute;
      this.rows.value = result.entities.map((record, index) => {
        const row: IGridRow = { key: String(record[idAttribute] ?? index) };
        for (const column of view.columns) {
          row[column.name] = formattedValue(record, column.name) ?? record[column.name] ?? "";
        }
        return row;
      });
    } finally {
      if (!this.isDisposed) {
        this.loading.value = false;
      }
    }
  }

  private readonly handleRowClick = (row: IGridRow): void => {
    if (this.props.selectedRecordId) {
      this.props.selectedRecordId.value = row.key;
    }
    this.props.onRecordSelected?.(row.key, row);
  };

  override render(): React.ReactNode {
    if (this.state.loadError) {
      return <div role="alert">Could not load view: {this.state.loadError}</div>;
    }
    return (
      <DataGrid
        columns={this.columns}
        rows={this.rows}
        loading={this.loading}
        emptyMessage={this.props.emptyMessage}
        onRowClick={
          this.props.onRecordSelected || this.props.selectedRecordId
            ? this.handleRowClick
            : undefined
        }
        selectedKey={this.props.selectedRecordId}
      />
    );
  }
}
