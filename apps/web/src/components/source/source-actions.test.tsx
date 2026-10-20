import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { syncResult } from "@/test/fixtures";
import { SourceActions } from "./source-actions";

describe("SourceActions", () => {
  it("calls the test and sync handlers", async () => {
    const onTest = vi.fn();
    const onSync = vi.fn();

    render(
      <SourceActions
        onTest={onTest}
        onSync={onSync}
        isTesting={false}
        isSyncing={false}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /test connection/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /sync metadata/i }),
    );

    expect(onTest).toHaveBeenCalledOnce();
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("disables both actions while one is running", () => {
    render(
      <SourceActions
        onTest={vi.fn()}
        onSync={vi.fn()}
        isTesting
        isSyncing={false}
      />,
    );

    expect(screen.getByRole("button", { name: /testing/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /sync metadata/i }),
    ).toBeDisabled();
  });

  it("renders sync counts and a metadata link", () => {
    render(
      <SourceActions
        onTest={vi.fn()}
        onSync={vi.fn()}
        isTesting={false}
        isSyncing={false}
        syncResult={syncResult}
      />,
    );

    expect(screen.getByTestId("sync-result")).toHaveTextContent("8 objects");
    expect(
      screen.getByRole("link", { name: /browse metadata/i }),
    ).toHaveAttribute("href", "/metadata");
  });

  it("renders a sync error with its connector code", () => {
    render(
      <SourceActions
        onTest={vi.fn()}
        onSync={vi.fn()}
        isTesting={false}
        isSyncing={false}
        syncError={new ApiError("A sync is already running.", 409)}
      />,
    );

    expect(screen.getByText("A sync is already running.")).toBeInTheDocument();
  });
});
