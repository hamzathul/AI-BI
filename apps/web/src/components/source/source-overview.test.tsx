import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  connectionTest,
  sourceStatusFailed,
  sourceStatusNoSync,
} from "@/test/fixtures";
import { SourceOverview } from "./source-overview";

describe("SourceOverview", () => {
  it("renders a loading skeleton", () => {
    render(<SourceOverview isPending error={null} onRetry={vi.fn()} />);

    expect(screen.getByTestId("source-overview-loading")).toBeInTheDocument();
  });

  it("renders an error with a retry action", async () => {
    const onRetry = vi.fn();
    render(
      <SourceOverview
        isPending={false}
        error={new Error("Cannot reach the API")}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Cannot reach the API")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the configured database and the empty sync state", () => {
    render(
      <SourceOverview
        status={sourceStatusNoSync}
        isPending={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText(/no sync yet/i)).toBeInTheDocument();
  });

  it("renders a failed sync with its safe error message", () => {
    render(
      <SourceOverview
        status={sourceStatusFailed}
        isPending={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByTestId("last-sync-status")).toHaveTextContent("FAILED");
    expect(
      screen.getByText("The source database rejected the credentials."),
    ).toBeInTheDocument();
  });

  it("renders a successful connection test", () => {
    render(
      <SourceOverview
        status={sourceStatusNoSync}
        isPending={false}
        error={null}
        onRetry={vi.fn()}
        testResult={connectionTest}
      />,
    );

    expect(screen.getByTestId("connection-result")).toHaveTextContent("18.6");
    expect(screen.getByText("Read-only role")).toBeInTheDocument();
  });

  it("renders a connector error code", () => {
    render(
      <SourceOverview
        status={sourceStatusNoSync}
        isPending={false}
        error={null}
        onRetry={vi.fn()}
        testError={new ApiError("Credentials rejected", 502, "AUTH")}
      />,
    );

    expect(screen.getByTestId("test-error")).toHaveTextContent(
      "Credentials rejected",
    );
    expect(screen.getByText("AUTH")).toBeInTheDocument();
  });
});
