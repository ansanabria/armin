import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { mcpKeys } from "@/lib/armin-query";
import {
  buildClaudeCliCommand,
  buildCodexCliCommand,
  buildCursorMcpConfig,
  buildOpenCodeMcpConfig,
  DEFAULT_MCP_PORT,
  isValidMcpPort,
} from "../../shared/mcp";

type AgentTab = "cursor" | "claude" | "codex" | "opencode";

const AGENT_TABS: { value: AgentTab; label: string }[] = [
  { value: "cursor", label: "Cursor" },
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
];

const invalidInputClass =
  "border-again focus-visible:border-again focus-visible:ring-again/30";

function McpPortInput({
  value,
  disabled,
  onSave,
}: {
  value: number;
  disabled?: boolean;
  onSave: (port: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (isValidMcpPort(parsed)) {
      setInvalid(false);
      setDraft(String(parsed));
      if (parsed !== value) onSave(parsed);
      return;
    }
    setInvalid(true);
    setDraft(String(value));
  };

  return (
    <Input
      inputMode="numeric"
      value={draft}
      disabled={disabled}
      aria-invalid={invalid}
      aria-label="MCP server port"
      className={cn(
        "w-24 text-right tabular-nums",
        invalid && invalidInputClass,
      )}
      onChange={(event) => {
        setInvalid(false);
        setDraft(event.target.value.replace(/[^\d]/g, ""));
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function McpSettings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [agent, setAgent] = useState<AgentTab>("cursor");

  const enabledQuery = useQuery({
    queryKey: mcpKeys.enabled,
    queryFn: () => window.armin.mcp.getEnabled(),
  });
  const enabled = enabledQuery.data ?? true;

  const setEnabled = useMutation({
    mutationFn: (next: boolean) => window.armin.mcp.setEnabled(next),
    onSuccess: ({ enabled: next }) => {
      queryClient.setQueryData(mcpKeys.enabled, next);
      void queryClient.invalidateQueries({ queryKey: mcpKeys.setup });
      toast({
        tone: "success",
        title: next ? "MCP server enabled" : "MCP server disabled",
      });
    },
    onError: () =>
      toast({ tone: "error", title: "Couldn't update MCP server" }),
  });

  const retry = useMutation({
    mutationFn: () => window.armin.mcp.retry(),
    onSuccess: (status) => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.setup });
      toast({
        tone: status.running ? "success" : "error",
        title: status.running
          ? "MCP server started"
          : "MCP server still unavailable",
      });
    },
    onError: () =>
      toast({ tone: "error", title: "Couldn't start MCP server" }),
  });

  const setPort = useMutation({
    mutationFn: (port: number) => window.armin.mcp.setPort(port),
    onSuccess: (status) => {
      void queryClient.invalidateQueries({ queryKey: mcpKeys.setup });
      toast({
        tone: status.running ? "success" : "error",
        title: status.running
          ? "MCP port updated"
          : "Port saved, but MCP server couldn't start",
      });
    },
    onError: () =>
      toast({ tone: "error", title: "Couldn't update MCP port" }),
  });

  const setupQuery = useQuery({
    queryKey: mcpKeys.setup,
    queryFn: () => window.armin.mcp.getSetup(),
    enabled,
  });

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: `${label} copied` });
    } catch {
      toast({ tone: "error", title: "Couldn't copy to clipboard" });
    }
  };

  const setup = setupQuery.data;

  const agentSnippet =
    setup?.running && setup.url
      ? agent === "cursor"
        ? {
            title: ".cursor/mcp.json",
            hint: "Add this in the project where your agent should create flashcards.",
            body: buildCursorMcpConfig(setup),
          }
        : agent === "claude"
          ? {
              title: "Claude Code setup",
              hint: "Run this in your project to register the Armin MCP server.",
              body: buildClaudeCliCommand(setup),
            }
          : agent === "codex"
            ? {
                title: "Codex CLI",
                hint: "Run this in your project to register the Armin MCP server.",
                body: buildCodexCliCommand(setup),
              }
            : {
                title: "opencode.jsonc",
                hint: "Add this under mcp in opencode.json or opencode.jsonc.",
                body: buildOpenCodeMcpConfig(setup),
              }
      : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-6 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Enable MCP server</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
            Run Armin&apos;s local MCP server so coding agents can create
            flashcards. Turn off if you don&apos;t use AI to build flashcards.
          </p>
        </div>
        <div className="flex shrink-0 justify-end pt-0.5">
          <Switch
            checked={enabled}
            disabled={enabledQuery.isLoading || setEnabled.isPending}
            onCheckedChange={(next) => setEnabled.mutate(next)}
          />
        </div>
      </div>

      {!enabled ? null : (
        <>
          {setupQuery.isError && (
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3.5">
              <p className="text-sm text-muted">
                Couldn&apos;t load MCP setup info.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void setupQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          )}

          {setupQuery.isLoading && (
            <div className="px-4 py-3.5">
              <p className="text-sm text-muted">Loading setup info…</p>
            </div>
          )}

          {setup && (
            <div className="flex items-start justify-between gap-6 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Port</p>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
                  Armin tries this port first (default {DEFAULT_MCP_PORT}), then
                  nearby fallbacks if it is already in use. Change it to match
                  your agent config or free a blocked port.
                </p>
                {setup.running &&
                  setup.activePort != null &&
                  setup.activePort !== setup.configuredPort && (
                    <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                      Currently listening on port {setup.activePort}.
                    </p>
                  )}
              </div>
              <div className="flex shrink-0 justify-end pt-0.5">
                <McpPortInput
                  value={setup.configuredPort}
                  disabled={setPort.isPending}
                  onSave={(port) => setPort.mutate(port)}
                />
              </div>
            </div>
          )}

          {setup && !setup.running && (
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  MCP server couldn&apos;t start
                </p>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
                  {setup.error ??
                    "All candidate ports are in use. Free a port or retry."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={retry.isPending}
                onClick={() => void retry.mutate()}
              >
                Retry
              </Button>
            </div>
          )}

          {setup?.running && setup.url && (
            <>
              <div className="border-b border-border px-4 py-3.5">
                <p className="text-sm font-medium text-ink">
                  Automatic profile
                </p>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
                  The MCP server writes to whichever Armin profile is currently
                  open in the desktop app. If multiple profiles are open, your
                  agent will ask which one to use before creating flashcards.
                </p>
                <p className="mt-2 font-mono text-[0.75rem] text-ink">
                  {setup.url}
                </p>
              </div>

              <div className="border-b border-border px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">Agent setup</p>
                  <Segmented
                    options={AGENT_TABS}
                    value={agent}
                    onChange={setAgent}
                    size="sm"
                  />
                </div>
                {agentSnippet && (
                  <>
                    <p className="mt-1 text-[0.8125rem] text-muted">
                      {agentSnippet.hint}
                    </p>
                    <div className="mt-3 flex items-start gap-2 border border-border bg-surface-sunken py-2 pl-3 pr-2">
                      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[0.75rem] leading-relaxed text-ink">
                        {agentSnippet.body}
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Copy ${agentSnippet.title}`}
                        onClick={() =>
                          void copy(agentSnippet.body, agentSnippet.title)
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="px-4 py-3.5">
                <p className="text-[0.8125rem] leading-snug text-muted">
                  Armin hosts the MCP server while the app is open. Keep Armin
                  running with the target profile selected while your agent is
                  creating flashcards, or choose from the open profiles when
                  your agent asks.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
