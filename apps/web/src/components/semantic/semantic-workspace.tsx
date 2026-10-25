"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SemanticEditor } from "@/components/semantic/semantic-editor";
import { getErrorMessage } from "@/lib/api/client";
import type { SemanticModel } from "@/lib/api/types";
import {
  useDeleteSemanticModel,
  useSaveSemanticModel,
  useSemanticExample,
  useValidateSemanticModel,
} from "@/hooks/use-semantic-model";

interface SemanticWorkspaceProps {
  initialModel: SemanticModel | null;
  updatedAt: string | null;
}

function emptyDraft(): string {
  return JSON.stringify(
    {
      name: "My semantic model",
      description: "",
      datasets: [],
      joins: [],
    },
    null,
    2,
  );
}

export function SemanticWorkspace({
  initialModel,
  updatedAt,
}: SemanticWorkspaceProps) {
  const example = useSemanticExample();
  const validate = useValidateSemanticModel();
  const save = useSaveSemanticModel();
  const remove = useDeleteSemanticModel();

  const [draft, setDraft] = useState(() =>
    initialModel ? JSON.stringify(initialModel, null, 2) : emptyDraft(),
  );
  const [baseline, setBaseline] = useState(initialModel);
  const [baselineUpdatedAt, setBaselineUpdatedAt] = useState(updatedAt);
  const [parseError, setParseError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const errorMessage = parseError ?? actionError;

  function readDraft(): SemanticModel | null {
    try {
      const parsed: unknown = JSON.parse(draft);
      setParseError(null);
      return parsed as SemanticModel;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The JSON is malformed.";
      setParseError(`The editor does not contain valid JSON. ${message}`);
      toast.error("The editor does not contain valid JSON.");
      return null;
    }
  }

  function actionFailed(error: unknown) {
    const message = getErrorMessage(error);
    setActionError(message);
    toast.error(message);
  }

  function handleValidate() {
    const model = readDraft();
    if (!model) return;

    setActionError(null);
    validate.mutate(model, {
      onSuccess: (result) => {
        setActionError(null);
        const { datasets, dimensions, metrics, joins } = result.summary;
        toast.success(
          `Valid: ${datasets} datasets, ${dimensions} dimensions, ${metrics} metrics, ${joins} joins.`,
        );
      },
      onError: actionFailed,
    });
  }

  function handleSave() {
    const model = readDraft();
    if (!model) return;

    setActionError(null);
    save.mutate(model, {
      onSuccess: (result) => {
        setActionError(null);
        if (result.model) {
          const saved = JSON.stringify(result.model, null, 2);
          setDraft(saved);
          setBaseline(result.model);
        }
        setBaselineUpdatedAt(result.updatedAt);
        toast.success("Semantic model saved.");
      },
      onError: actionFailed,
    });
  }

  function handleReset() {
    setParseError(null);
    setActionError(null);
    setDraft(baseline ? JSON.stringify(baseline, null, 2) : emptyDraft());
  }

  function handleLoadExample() {
    setActionError(null);
    example.mutate(undefined, {
      onSuccess: ({ model }) => {
        setParseError(null);
        setActionError(null);
        setDraft(JSON.stringify(model, null, 2));
        toast.success("Acme example loaded. Review it, then validate or save.");
      },
      onError: actionFailed,
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        "Delete the saved semantic model? Queries will fail until a new model is saved.",
      )
    ) {
      return;
    }

    setActionError(null);
    remove.mutate(undefined, {
      onSuccess: () => {
        setParseError(null);
        setActionError(null);
        setDraft(emptyDraft());
        setBaseline(null);
        setBaselineUpdatedAt(null);
        toast.success("Semantic model deleted.");
      },
      onError: actionFailed,
    });
  }

  return (
    <SemanticEditor
      draft={draft}
      onDraftChange={setDraft}
      onValidate={handleValidate}
      onSave={handleSave}
      onReset={handleReset}
      onLoadExample={handleLoadExample}
      onDelete={handleDelete}
      isValidating={validate.isPending}
      isSaving={save.isPending}
      isLoadingExample={example.isPending}
      isDeleting={remove.isPending}
      modelExists={Boolean(baseline)}
      updatedAt={baselineUpdatedAt}
      errorMessage={errorMessage}
    />
  );
}
