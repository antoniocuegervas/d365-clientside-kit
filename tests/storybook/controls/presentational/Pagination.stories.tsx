import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { Pagination } from "../../../../shared/controls/presentational/Pagination";

const meta: Meta<typeof Pagination> = {
  title: "Presentational Controls/Pagination",
  component: Pagination,
  parameters: {
    docs: {
      description: {
        component:
          "Pagination control that displays the supplied page state and raises intent. It always " +
          "shows the record range it can compute from the page and page size (for example " +
          "'Showing records 21-40'), appending 'of N' when a total is known. Simple mode " +
          "(previous / Page N / next) suits Dataverse forward-cookie paging; rich mode adds " +
          "first / last / jump-to-page when the host drives server-side page and total count.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof Pagination>;

/**
 * The story plays the smart grid: it owns the page/hasNext observables. pageSize
 * and pageRecordCount drive the range label ("1-20"), which shows even with no
 * total; the last page reports a short count so the range ends accurately.
 */
const make = (initialPage: number, hasNext: boolean, lastPageRecords = 20) => {
  const page = new Observable(initialPage);
  const hasNextPage = new Observable(hasNext);
  const pageRecordCount = new Observable<number | null>(hasNext ? 20 : lastPageRecords);
  return {
    page,
    hasNextPage,
    pageSize: 20,
    pageRecordCount,
    onPrevious: () => {
      if (page.value > 1) page.value -= 1;
      hasNextPage.value = true;
      pageRecordCount.value = 20;
    },
    onNext: () => {
      page.value += 1;
      hasNextPage.value = page.value < 4; // pretend there are 4 pages
      pageRecordCount.value = page.value < 4 ? 20 : lastPageRecords; // last page is short
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
  name: "Last page (short, range ends exactly)",
  render: () => <Pagination {...make(4, false, 7)} />,
};
export const Interactive: Story = {
  name: "Interactive (4 pages)",
  render: () => <Pagination {...make(1, true)} />,
};

/** Rich mode: jump-to-page combobox, first/last, and an "X–Y of N" label. */
const makeRich = (initialPage: number, pageCount: number, pageSize: number, total: number) => {
  const page = new Observable(initialPage);
  const go = (n: number) => {
    page.value = Math.min(Math.max(1, n), pageCount);
  };
  return {
    page,
    pageCount: new Observable<number | null>(pageCount),
    totalRecordCount: new Observable<number | null>(total),
    pageSize,
    onFirst: () => go(1),
    onLast: () => go(pageCount),
    onPrevious: () => go(page.value - 1),
    onNext: () => go(page.value + 1),
    onGoToPage: go,
  };
};

export const Rich: Story = {
  name: "Rich (jump / first-last / total)",
  render: () => <Pagination {...makeRich(2, 5, 25, 118)} />,
};

export const RichUnknownTotal: Story = {
  name: "Rich, unknown total (degrades to next/prev)",
  render: () => {
    const page = new Observable(1);
    return (
      <Pagination
        page={page}
        pageCount={new Observable<number | null>(null)}
        hasNextPage={new Observable(true)}
        onGoToPage={(n) => (page.value = n)}
        onNext={() => (page.value += 1)}
        onPrevious={() => (page.value = Math.max(1, page.value - 1))}
      />
    );
  },
};
