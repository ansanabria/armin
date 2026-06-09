import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { mcpKeys } from "@/lib/armin-query";
import {
  buildClaudeCliCommand,
  buildClaudeMcpConfig,
  buildCodexCliCommand,
  buildCursorMcpConfig,
} from "../../shared/mcp";

type AgentTab = "cursor" | "claude" | "codex";

const AGENT_TABS: { value: AgentTab; label: string }[] = [
  { value: "cursor", label: "Cursor" },
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

export function McpSettings() {
  const toast = useToast();
  const [agent, setAgent] = useState<AgentTab>("cursor");

  const setupQuery = useQuery({
    queryKey: mcpKeys.setup,
    queryFn: () => window.armin.mcp.getSetup(),
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

  const agentSnippet = setup
    ? agent === "cursor"
      ? {
          title: ".cursor/mcp.json",
          hint: "Add this in the project where your agent should create cards.",
          body: buildCursorMcpConfig(setup),
        }
      : agent === "claude"
        ? {
            title: "Claude Code setup",
            hint: "Paste the JSON into .mcp.json, or run the CLI command in your project.",
            body: `${buildClaudeMcpConfig(setup)}\n\n# Or via CLI:\n${buildClaudeCliCommand(setup)}`,
          }
        : {
            title: "Codex CLI",
            hint: "Run this in your project to register the Armin MCP server.",
            body: buildCodexCliCommand(setup),
          }
    : null;

  return (
    <div>
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
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 border-b border-border px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Data directory</p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                Point <code className="font-mono text-ink">ARMIN_DATA_DIR</code>{" "}
                here so agents write to the same database as this profile.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="mt-0.5 shrink-0"
              aria-label="Copy data directory"
              onClick={() => void copy(setup.dataDir, "Data directory")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 border-b border-border px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Profile ID</p>
              <p className="mt-0.5 font-mono text-[0.8125rem] text-ink">
                {setup.profileId}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                Set <code className="font-mono text-ink">ARMIN_PROFILE_ID</code>{" "}
                to this value.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="mt-0.5 shrink-0"
              aria-label="Copy profile ID"
              onClick={() => void copy(setup.profileId, "Profile ID")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          {setup.isPackaged && (
            <div className="border-b border-border px-4 py-3.5">
              <p className="text-[0.8125rem] leading-snug text-muted">
                The MCP server runs from an Armin source checkout via{" "}
                <code className="font-mono text-ink">npm run mcp</code>. Replace{" "}
                <code className="font-mono text-ink">
                  /absolute/path/to/armin
                </code>{" "}
                in the snippets below with that path.
              </p>
            </div>
          )}

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
              The MCP server uses stdio and starts when your agent connects.
              Cards created through MCP appear here after a refresh.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
