import {
  AlertCircle,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

interface SemanticEditorProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onValidate: () => void;
  onSave: () => void;
  onReset: () => void;
  onLoadExample: () => void;
  onDelete: () => void;
  isValidating: boolean;
  isSaving: boolean;
  isLoadingExample: boolean;
  isDeleting: boolean;
  modelExists: boolean;
  updatedAt: string | null;
  errorMessage?: string | null;
}

export function SemanticEditor({
  draft,
  onDraftChange,
  onValidate,
  onSave,
  onReset,
  onLoadExample,
  onDelete,
  isValidating,
  isSaving,
  isLoadingExample,
  isDeleting,
  modelExists,
  updatedAt,
  errorMessage,
}: SemanticEditorProps) {
  const busy = isValidating || isSaving || isLoadingExample || isDeleting;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Model document</CardTitle>
            <CardDescription>
              Metrics and dimensions share one namespace. Save validates every
              source column and join against the current metadata snapshot.
            </CardDescription>
          </div>
          <Badge
            variant={modelExists ? "secondary" : "outline"}
            data-testid="semantic-status"
          >
            {modelExists ? "Saved model" : "No model saved"}
            {modelExists && updatedAt
              ? ` · ${formatDateTime(updatedAt)}`
              : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onLoadExample}
            disabled={busy}
            variant="secondary"
          >
            {isLoadingExample ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {isLoadingExample ? "Loading…" : "Load example"}
          </Button>
          <Button onClick={onValidate} disabled={busy} variant="outline">
            {isValidating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {isValidating ? "Validating…" : "Validate"}
          </Button>
          <Button onClick={onSave} disabled={busy}>
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {isSaving ? "Saving…" : "Save model"}
          </Button>
          <Button onClick={onReset} disabled={busy} variant="ghost">
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button
            onClick={onDelete}
            disabled={busy || !modelExists}
            variant="destructive"
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {isDeleting ? "Deleting…" : "Delete model"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          JSON only in v0. Use the metadata page to look up source columns and
          FK directions; joins must follow child → parent.
        </p>

        {errorMessage ? (
          <Alert variant="destructive" data-testid="semantic-error">
            <AlertCircle />
            <AlertTitle>The model was not accepted</AlertTitle>
            <AlertDescription>
              <p className="whitespace-pre-wrap">{errorMessage}</p>
            </AlertDescription>
          </Alert>
        ) : null}

        <label className="sr-only" htmlFor="semantic-json">
          Semantic model JSON
        </label>
        <textarea
          id="semantic-json"
          data-testid="semantic-json-editor"
          aria-label="Semantic model JSON"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          spellCheck={false}
          className="min-h-[34rem] w-full resize-y rounded-lg border bg-muted/20 p-4 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </CardContent>
    </Card>
  );
}
