import * as React from "react";
import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { ActivityCommandBar } from "../../../shared/features/counterparty/ActivityCommandBar";
import { CounterpartyGridView } from "../../../shared/features/counterparty/CounterpartyGridView";
import { CounterpartyGridViewModel } from "./CounterpartyGridViewModel";

registerApp(
  "sample-counterparty-grid",
  createViewApp(
    "Counterparty grid: cross-type activities with the external party",
    CounterpartyGridView,
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
