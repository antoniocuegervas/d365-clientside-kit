import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { Pagination } from "../../../../shared/controls/presentational/Pagination";

const meta: Meta<typeof Pagination> = {
  title: "Controls/Pagination",
  component: Pagination,
};
export default meta;
type Story = StoryObj<typeof Pagination>;

/** The story plays the smart grid: it owns the page/hasNext observables. */
const make = (initialPage: number, hasNext: boolean) => {
  const page = new Observable(initialPage);
  const hasNextPage = new Observable(hasNext);
  return {
    page,
    hasNextPage,
    onPrevious: () => {
      if (page.value > 1) page.value -= 1;
      hasNextPage.value = true;
    },
    onNext: () => {
      page.value += 1;
      hasNextPage.value = page.value < 4; // pretend there are 4 pages
    },
  };
};

export const FirstPage: Story = {
  render: () => <Pagination {...make(1, true)} />,
};
export const MiddlePage: Story = {
  render: () => <Pagination {...make(2, true)} />,
};
export const LastPage: Story = {
  render: () => <Pagination {...make(4, false)} />,
};
export const Interactive: Story = {
  name: "Interactive (4 pages)",
  render: () => <Pagination {...make(1, true)} />,
};
