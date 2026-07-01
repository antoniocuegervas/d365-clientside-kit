import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import { fieldContext, withContext, sample } from "./smartStoryHarness";

/**
 * The smallest complete thing that runs, the "picture" the per-control stories
 * leave out: a ViewModel that owns the Observables, a View (ObserverComponent)
 * that observe()s them and renders smart controls, all inside a
 * ViewModelContextProvider. Each control story shows a loose Observable plus a
 * JSX tag; this is where those pieces fit together.
 */

// 1. The ViewModel owns the Observables (the host state). In a real app it also
//    takes IViewModelContext in its constructor and holds the load/save logic.
class ContactViewModel {
  readonly firstName = new Observable<string | null>("Nancy");
  readonly gender = new Observable<number | null>(2);
}

interface IContactViewProps {
  viewModel: ContactViewModel;
}

// 2. The View is an ObserverComponent. It observe()s every Observable its render
//    reads (miss one and that value silently stops updating the UI), then binds
//    them to smart controls, which resolve label/options/targets from metadata.
class ContactView extends ObserverComponent<IContactViewProps> {
  constructor(props: IContactViewProps) {
    super(props);
    this.observe(props.viewModel.firstName, props.viewModel.gender);
  }

  override render(): React.ReactNode {
    const { viewModel } = this.props;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}>
        <SmartTextField entity="contact" attribute="firstname" value={viewModel.firstName} />
        <SmartOptionSet entity="contact" attribute="gendercode" value={viewModel.gender} />
      </div>
    );
  }
}

const meta: Meta = {
  title: "Smart Controls/End-to-end wiring",
  parameters: {
    docs: {
      description: {
        component:
          "The smallest complete thing that runs: a ViewModel that owns the Observables, a View " +
          "(an ObserverComponent) that observe()s them and renders smart controls, all inside a " +
          "ViewModelContextProvider. The per-control stories each show a loose Observable and a JSX " +
          "tag; this page shows how those pieces assemble. In a real app the provider is created " +
          "once in the host (createViewApp for a webresource, the PCF root for a control) and the " +
          "ViewModel takes IViewModelContext to load and save. Runs against an in-memory metadata " +
          "fake (no org).",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const viewModel = new ContactViewModel();

export const EndToEnd: Story = {
  name: "ViewModel + View + provider",
  decorators: [withContext(fieldContext)],
  render: () => <ContactView viewModel={viewModel} />,
  parameters: sample(
    `// The whole assembly, top to bottom. Copy this shape to start a new app.

// 1. ViewModel: owns the Observables (the host state). In a real app it also
//    takes IViewModelContext in its constructor and holds the load/save logic.
class ContactViewModel {
  readonly firstName = new Observable<string | null>("Nancy");
  readonly gender = new Observable<number | null>(2);
}

// 2. View: an ObserverComponent. Call observe() with every Observable the render
//    reads, so the view re-renders when any changes. Miss one and that value
//    silently stops updating the UI (the kit's one silent contract). You pass
//    only entity + attribute + the value Observable; the smart control resolves
//    the label, option list, and targets from Dataverse metadata.
class ContactView extends ObserverComponent<{ viewModel: ContactViewModel }> {
  constructor(props: { viewModel: ContactViewModel }) {
    super(props);
    this.observe(props.viewModel.firstName, props.viewModel.gender);
  }
  override render() {
    const { viewModel } = this.props;
    return (
      <>
        <SmartTextField entity="contact" attribute="firstname" value={viewModel.firstName} />
        <SmartOptionSet entity="contact" attribute="gendercode" value={viewModel.gender} />
      </>
    );
  }
}

// 3. Host: supply the IViewModelContext once, above the View. A webresource does
//    this in createViewApp; a field or dataset PCF does it in its root. That
//    context is how the smart controls reach Dataverse metadata.
<ViewModelContextProvider context={context}>
  <ContactView viewModel={new ContactViewModel()} />
</ViewModelContextProvider>`,
    "Every per-control story shows a loose Observable and a JSX tag; this is where they assemble " +
      "into something that runs. The ViewModel owns the Observables, the View observe()s them and " +
      "renders the smart controls, and the provider supplies the metadata context once at the top " +
      "(createViewApp for a webresource, the PCF root for a control). Copy this shape to start a " +
      "new app."
  ),
};
