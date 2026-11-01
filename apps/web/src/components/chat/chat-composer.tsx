"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Mirrors core-api's Zod `max(2000)`, so the client fails before the round trip. */
export const MAX_MESSAGE_CHARS = 2000;

interface ChatComposerProps {
  onSubmit: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

/**
 * The textarea owns its draft; submitting clears it. Enter sends, Shift+Enter
 * makes a newline — the shortcut people expect from every chat box.
 */
export function ChatComposer({ onSubmit, onStop, isStreaming }: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const message = draft.trim();
  const canSend = message.length > 0 && !isStreaming;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSubmit(message);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm"
    >
      <Textarea
        aria-label="Your question"
        placeholder="Ask a question about the connected data…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={MAX_MESSAGE_CHARS}
        rows={2}
        disabled={isStreaming}
        className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Enter sends · Shift+Enter adds a line
        </p>
        {isStreaming ? (
          <Button type="button" size="sm" variant="outline" onClick={onStop}>
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={!canSend}>
            <Send className="size-3.5" />
            Ask
          </Button>
        )}
      </div>
    </form>
  );
}
