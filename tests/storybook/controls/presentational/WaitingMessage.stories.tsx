import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WaitingMessage } from "../../../../shared/controls/presentational/WaitingMessage";

const meta: Meta<typeof WaitingMessage> = {
  title: "Controls/WaitingMessage",
  component: WaitingMessage,
};
export default meta;
type Story = StoryObj<typeof WaitingMessage>;

export const Default: Story = {
  render: () => <WaitingMessage />,
};
export const CustomMessage: Story = {
  render: () => <WaitingMessage message="Waiting for the record to load…" />,
};
export const Inline: Story = {
  render: () => <WaitingMessage inline message="Loading metadata…" />,
};
