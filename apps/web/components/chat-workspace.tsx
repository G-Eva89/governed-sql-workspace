"use client";

import type { ChatTurn, ConnectionPublic, QueryResult } from "@governed-sql/schemas";
import { useState, type KeyboardEvent } from "react";
import { ApiClientError, generateSql, runQuery } from "@/lib/api";
import { QueryErrorBanner } from "@/components/query-error-banner";
import { QueryResultsTable } from "@/components/query-results-table";

type ApiError = { code: string; message: string };

type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      sql: string | null;
      warnings: string[];
      result?: QueryResult;
      error?: ApiError;
      isRunning?: boolean;
    };

type ChatWorkspaceProps = {
  connections: ConnectionPublic[];
};

export function ChatWorkspace({ connections }: ChatWorkspaceProps) {
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    connections[0]?.id ?? "",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<ApiError | null>(null);

  function buildHistory(): ChatTurn[] {
    return messages.map((message) =>
      message.role === "user"
        ? { role: "user" as const, content: message.content }
        : { role: "assistant" as const, content: message.content, sql: message.sql },
    );
  }

  async function handleSend() {
    const question = input.trim();
    if (!selectedConnectionId || !question) {
      return;
    }

    const history = buildHistory();
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setGenerateError(null);
    setIsGenerating(true);

    try {
      const response = await generateSql(selectedConnectionId, { question, history });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.explanation,
          sql: response.sql,
          warnings: response.warnings,
        },
      ]);
    } catch (err) {
      const apiError: ApiError =
        err instanceof ApiClientError
          ? { code: err.code, message: err.message }
          : { code: "CONNECTION_ERROR", message: "Unable to reach the chat service." };
      setGenerateError(apiError);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRun(index: number) {
    const message = messages[index];
    const question = messages[index - 1];
    if (!message || message.role !== "assistant" || !message.sql) {
      return;
    }

    setMessages((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index && item.role === "assistant"
          ? { ...item, isRunning: true, error: undefined }
          : item,
      ),
    );

    try {
      const result = await runQuery(selectedConnectionId, {
        sql: message.sql,
        nlPrompt: question?.role === "user" ? question.content : undefined,
      });
      setMessages((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index && item.role === "assistant"
            ? { ...item, isRunning: false, result, error: undefined }
            : item,
        ),
      );
    } catch (err) {
      const apiError: ApiError =
        err instanceof ApiClientError
          ? { code: err.code, message: err.message }
          : { code: "CONNECTION_ERROR", message: "Unable to run query. Is the API running?" };
      setMessages((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index && item.role === "assistant"
            ? { ...item, isRunning: false, error: apiError, result: undefined }
            : item,
        ),
      );
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSend();
    }
  }

  if (connections.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Chat</h1>
        <p className="mt-2 text-sm text-zinc-600">
          No active connections are registered for your organization. Run{" "}
          <span className="font-mono text-zinc-800">pnpm db:seed</span> to add
          the Pagila demo connection.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Chat</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Ask a question in plain English. Review the generated SQL, then run it
          against the governed query gateway.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1.5 border-b border-zinc-200 p-4">
          <label htmlFor="chat-connection" className="text-sm font-medium text-zinc-700">
            Connection
          </label>
          <select
            id="chat-connection"
            value={selectedConnectionId}
            onChange={(event) => setSelectedConnectionId(event.target.value)}
            className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name} ({connection.database}@{connection.host}:
                {connection.port})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Ask something like &ldquo;how many films are there per category&rdquo;.
            </p>
          ) : null}

          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={index} className="self-end rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
                {message.content}
              </div>
            ) : (
              <div key={index} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm text-zinc-800">{message.content}</p>

                {message.sql ? (
                  <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900">
                    {message.sql}
                  </pre>
                ) : null}

                {message.warnings.length > 0 ? (
                  <ul className="list-inside list-disc text-xs text-amber-700">
                    {message.warnings.map((warning, warningIndex) => (
                      <li key={warningIndex}>{warning}</li>
                    ))}
                  </ul>
                ) : null}

                {message.sql ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => void handleRun(index)}
                      disabled={message.isRunning}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {message.isRunning ? "Running…" : "Run"}
                    </button>
                  </div>
                ) : null}

                {message.error ? (
                  <QueryErrorBanner code={message.error.code} message={message.error.message} />
                ) : null}

                {message.result ? <QueryResultsTable result={message.result} /> : null}
              </div>
            ),
          )}
        </div>

        <div className="border-t border-zinc-200 p-4">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            spellCheck={false}
            placeholder="Ask a question about your data..."
            className="w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-zinc-500">Press Ctrl+Enter to send.</p>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isGenerating || !input.trim()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Thinking…" : "Send"}
            </button>
          </div>
        </div>
      </div>

      {generateError ? (
        <QueryErrorBanner code={generateError.code} message={generateError.message} />
      ) : null}
    </div>
  );
}
