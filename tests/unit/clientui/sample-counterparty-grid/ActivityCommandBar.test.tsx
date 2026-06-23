import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityCommandBar } from "../../../../shared/features/counterparty/ActivityCommandBar";
import { Observable } from "../../../../shared/reactivity/Observable";
import type { IActivityTypeInfo } from "../../../../shared/context/IViewModelContext";

const types: IActivityTypeInfo[] = [
  { logicalName: "email", displayName: "Email", objectTypeCode: 4202 },
  { logicalName: "phonecall", displayName: "Phone Call", objectTypeCode: 4210 },
];

function renderBar(selectedKey: string | null, handlers: Partial<{
  onCreate: (logicalName: string) => void;
  onEdit: () => void;
  onRefresh: () => void;
}> = {}) {
  return render(
    <ActivityCommandBar
      selectedKey={new Observable<string | null>(selectedKey)}
      activityTypes={types}
      onCreate={handlers.onCreate ?? (() => undefined)}
      onEdit={handlers.onEdit ?? (() => undefined)}
      onRefresh={handlers.onRefresh ?? (() => undefined)}
    />
  );
}

describe("ActivityCommandBar", () => {
  it("shows New and Refresh when nothing is selected", () => {
    renderBar(null);
    expect(screen.getByRole("button", { name: /New/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
  });

  it("shows only Edit when a row is selected", () => {
    renderBar("call-1");
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /New/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Refresh/ })).toBeNull();
  });

  it("lists every activity type in the New flyout and fires onCreate", () => {
    const onCreate = jest.fn();
    renderBar(null, { onCreate });
    fireEvent.click(screen.getByRole("button", { name: /New/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Phone Call" }));
    expect(onCreate).toHaveBeenCalledWith("phonecall");
  });

  it("fires onEdit and onRefresh", () => {
    const onEdit = jest.fn();
    renderBar("call-1", { onEdit });
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    const onRefresh = jest.fn();
    renderBar(null, { onRefresh });
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
