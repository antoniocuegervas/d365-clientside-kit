import * as React from "react";
import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { ActivityCommandBar } from "../../../shared/features/counterparty/ActivityCommandBar";
import {
  CounterpartyGridView,
  type ICounterpartyGridViewProps,
} from "../../../shared/features/counterparty/CounterpartyGridView";
import { CounterpartyGridViewModel } from "./CounterpartyGridViewModel";

/**
 * The webresource hosting owns the vertical scroll: the shell pins body
 * overflow hidden, so a result set taller than the viewport would otherwise be
 * unreachable past the fold. The dataset PCF hosting scrolls the form itself,
 * so the shared View stays height-neutral and this bound lives here,
 * webresource-only.
 */
const BoundedCounterpartyGridView: React.FC<ICounterpartyGridViewProps> = (props) =>
  React.createElement(
    "div",
    { style: { height: "100%", overflowY: "auto", overflowX: "hidden" } },
    React.createElement(CounterpartyGridView, props)
  );

registerApp(
  "sample-counterparty-grid",
  createViewApp(
    "Counterparty grid: cross-type activities with the external party",
    BoundedCounterpartyGridView,
    (host) => {
      const viewModel = new CounterpartyGridViewModel(host.context);
      return {
        columns: viewModel.columns,
        rows: viewModel.rows,
        loading: viewModel.loading,
        onOpenRow: viewModel.openActivity,
        selectedKey: viewModel.selectedKey,
        searchText: viewModel.searchText,
        commandBar: React.createElement(ActivityCommandBar, {
          selectedKey: viewModel.selectedKey,
          activityTypes: viewModel.activityTypes,
          onCreate: viewModel.onCreate,
          onEdit: viewModel.onEdit,
          onRefresh: viewModel.onRefresh,
        }),
        title: "Activities with their Counterparty (recent, across accounts)",
        viewModel,
      };
    }
  )
);
