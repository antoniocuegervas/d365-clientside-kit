import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createFakeViewModelContext } from "../../mocks/fakeViewModelContext";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { TemplateView } from "../../../clientui/apps/template/TemplateView";
import { TemplateViewModel } from "../../../clientui/apps/template/TemplateViewModel";

/**
 * The REAL template app (clientui/apps/template), its actual View and
 * ViewModel, rendered against the fake context. Unlike the other scenario
 * stories (presentational recreations on fixtures), nothing here is rebuilt
 * for Storybook: the story constructs the ViewModel the way app.ts does and
 * only swaps the context for a seeded fake. This is the copy target for
 * "see your app before you have an org" in docs/adding-a-webresource-app.md:
 * copy this file, point the imports at your app, and seed the fake with the
 * metadata and query results your app reads.
 *
 * Seeding notes that save an afternoon:
 * - `attributes` needs an entry for every `entity.attribute` a smart control
 *   binds, or that control renders its metadata-unavailable message.
 * - If your app has a lookup, seed `entities:` for the TARGET entity when its
 *   primary name attribute is not `name` (contact is `fullname`, systemuser
 *   is `fullname`): the fake defaults every entity's primary name to `name`,
 *   and seeded result rows keyed by the real attribute otherwise render as
 *   blank rows that look like a broken control.
 */
const meta: Meta = {
  title: "Sample Patterns/Template App (real View + ViewModel)",
  parameters: {
    docs: {
      description: {
        component:
          "The template app's own View and ViewModel running on the seeded fake context: " +
          "the smart fields resolve their labels and options from the fake metadata, and " +
          "Save runs the real ViewModel handler against the fake webAPI. Copy this story, " +
          "point it at your app, and reseed. The two seeding traps are commented in the " +
          "story source: seed `attributes` for every bound entity.attribute, and seed " +
          "`entities:` when a lookup target's primary name attribute is not `name`.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function makeSeededContext() {
  const { context } = createFakeViewModelContext({
    attributes: {
      // One entry per entity.attribute a smart control binds in the View.
      "account.name": {
        DisplayName: "Account Name",
        Type: "string",
        RequiredLevel: 2,
        MaxLength: 160,
      },
      "account.industrycode": {
        DisplayName: "Industry",
        Type: "picklist",
        OptionSet: { Options: [
          { Value: 1, Label: "Accounting" },
          { Value: 6, Label: "Consulting" },
          { Value: 34, Label: "Retail" },
        ] },
      },
    },
  });
  return context;
}

export const TemplateAppOnTheFakeContext: Story = {
  render: () => {
    // Exactly what app.ts does at launch, with the fake standing in for the
    // host context: build the ViewModel, hand it to the View, provide the
    // context so the smart controls inside can resolve metadata.
    const context = makeSeededContext();
    const viewModel = new TemplateViewModel(context);
    return (
      <ViewModelContextProvider context={context}>
        <TemplateView viewModel={viewModel} />
      </ViewModelContextProvider>
    );
  },
};
