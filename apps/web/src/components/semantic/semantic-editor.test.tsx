import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SemanticEditor } from "./semantic-editor";

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof SemanticEditor>> = {},
) {
  const props: React.ComponentProps<typeof SemanticEditor> = {
    draft: '{\n  "name": "Acme"\n}',
    onDraftChange: vi.fn(),
    onValidate: vi.fn(),
    onSave: vi.fn(),
    onReset: vi.fn(),
    onLoadExample: vi.fn(),
    onDelete: vi.fn(),
    isValidating: false,
    isSaving: false,
    isLoadingExample: false,
    isDeleting: false,
    modelExists: true,
    updatedAt: "2026-10-22T12:00:00.000Z",
    errorMessage: null,
    ...overrides,
  };

  render(<SemanticEditor {...props} />);
  return props;
}

describe("SemanticEditor", () => {
  it("calls every toolbar action", async () => {
    const props = renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "Load example" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Validate" }));
    await userEvent.click(screen.getByRole("button", { name: "Save model" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete model" }));

    expect(props.onLoadExample).toHaveBeenCalledOnce();
    expect(props.onValidate).toHaveBeenCalledOnce();
    expect(props.onSave).toHaveBeenCalledOnce();
    expect(props.onReset).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it("edits the draft and shows the saved state", async () => {
    const props = renderEditor();

    const editor = screen.getByTestId("semantic-json-editor");
    await userEvent.type(editor, " ");

    expect(props.onDraftChange).toHaveBeenCalled();
    expect(screen.getByTestId("semantic-status")).toHaveTextContent(
      "Saved model",
    );
  });

  it("disables delete until a model is saved", () => {
    renderEditor({ modelExists: false });

    expect(
      screen.getByRole("button", { name: "Delete model" }),
    ).toBeDisabled();
    expect(screen.getByTestId("semantic-status")).toHaveTextContent(
      "No model saved",
    );
  });

  it("disables every action while a request is running", () => {
    renderEditor({ isSaving: true });

    for (const name of [
      /load/i,
      /validat/i,
      /sav/i,
      /reset/i,
      /delete model/i,
    ]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("shows an inline API error", () => {
    renderEditor({ errorMessage: "datasets.0.schema: Required" });

    expect(screen.getByTestId("semantic-error")).toHaveTextContent(
      "datasets.0.schema: Required",
    );
  });
});
