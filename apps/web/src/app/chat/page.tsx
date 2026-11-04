"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Braces, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatTurnView } from "@/components/chat/chat-turn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChat } from "@/hooks/use-chat";

const EXAMPLES = [
  "Headcount by department",
  "Monthly revenue for the last 12 months",
  "Top 5 products by revenue",
];

export default function ChatPage() {
  const { turns, ask, stop, isStreaming } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const last = turns[turns.length - 1];

  useEffect(() => {
    if (turns.length > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turns.length, last?.status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat"
        description="Ask a question in plain English. The agent drafts a QuerySpec; the API validates and executes it, and the answer arrives with the rows behind it."
        actions={
          <Button variant="outline" asChild>
            <Link href="/semantic">
              <Braces className="size-4" />
              Semantic model
            </Link>
          </Button>
        }
      />

      {turns.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              Ask about your data
            </CardTitle>
            <CardDescription>
              Answers come from the saved semantic model and the source
              database&apos;s read-only connection. Nothing is stored: this
              transcript disappears on reload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  size="sm"
                  onClick={() => void ask(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
            <Alert>
              <AlertCircle />
              <AlertTitle>Needs a semantic model</AlertTitle>
              <AlertDescription>
                <p>
                  Chat resolves metric and dimension names from the saved model.
                  If a question fails with a model error, save one first.
                </p>
                <Button className="mt-3" size="sm" variant="outline" asChild>
                  <Link href="/semantic">
                    Open the semantic model
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {turns.map((turn) => (
            <ChatTurnView
              key={turn.id}
              turn={turn}
              onAsk={(question) => void ask(question)}
              disabled={isStreaming}
            />
          ))}
        </div>
      )}

      <div ref={endRef} />

      <div className="sticky bottom-4">
        <ChatComposer onSubmit={(message) => void ask(message)} onStop={stop} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
