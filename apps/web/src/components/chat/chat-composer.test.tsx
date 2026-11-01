import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./chat-composer";

function setup(isStreaming = false) {
  const onSubmit = vi.fn();
  const onStop = vi.fn();

  render(
    <ChatComposer
      onSubmit={onSubmit}
      onStop={onStop}
      isStreaming={isStreaming}
    />,
  );

  return { onSubmit, onStop, box: screen.getByLabelText(/your question/i) };
}

describe("ChatComposer", () => {
  it("submits the trimmed question and clears the box", async () => {
    const { onSubmit, box } = setup();

    await userEvent.type(box, "  Headcount by department  ");
    await userEvent.click(screen.getByRole("button", { name: /ask/i }));

    expect(onSubmit).toHaveBeenCalledWith("Headcount by department");
    expect(box).toHaveValue("");
  });

  it("sends on Enter and keeps Shift+Enter as a newline", async () => {
    const { onSubmit, box } = setup();

    await userEvent.type(box, "Revenue{Shift>}{Enter}{/Shift}by month");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue("Revenue\nby month");

    await userEvent.type(box, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("Revenue\nby month");
  });

  it("does not send a blank question", async () => {
    const { onSubmit, box } = setup();

    await userEvent.type(box, "   ");
    expect(screen.getByRole("button", { name: /ask/i })).toBeDisabled();

    await userEvent.type(box, "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows Stop instead of Ask while a run is active", async () => {
    const { onStop, box } = setup(true);

    expect(box).toBeDisabled();
    expect(screen.queryByRole("button", { name: /ask/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /stop/i }));

    expect(onStop).toHaveBeenCalledOnce();
  });
});
