import * as React from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

/**
 * UI-PREVIEW SCAFFOLDING — not part of the product.
 *
 * Lets a reviewer drive every data screen through its visual states without a
 * backend. The `scenario` stands in for what a real query would return. When
 * wiring the backend, delete this folder and replace `usePreview()` reads with
 * `useQuery(...)` status branches.
 */
export type Scenario = "loading" | "empty" | "ready" | "error";

const PreviewContext = React.createContext<{
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
} | null>(null);

export function usePreview() {
  const ctx = React.useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
}

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "loading", label: "Loading" },
  { value: "empty", label: "Empty" },
  { value: "ready", label: "Ready" },
  { value: "error", label: "Error" },
];

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [scenario, setScenario] = React.useState<Scenario>("ready");
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <PreviewContext.Provider value={{ scenario, setScenario }}>
      {children}
      <div className="fixed bottom-4 left-4 z-40 print:hidden">
        <div className="w-[260px] overflow-hidden rounded-xl border border-border-strong bg-surface/90 shadow-overlay backdrop-blur">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <FlaskConical className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-[0.8125rem] font-semibold text-ink">
              Preview states
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 text-muted transition-transform duration-200",
                collapsed && "-rotate-90",
              )}
              aria-hidden
            />
          </button>
          {!collapsed && (
            <div className="space-y-2.5 border-t border-border px-3 py-3">
              <div>
                <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">
                  Data
                </p>
                <Segmented
                  size="sm"
                  options={SCENARIOS}
                  value={scenario}
                  onChange={setScenario}
                  className="w-full justify-between"
                />
              </div>
              <p className="text-[0.6875rem] leading-snug text-muted">
                Drives the decks, deck, and review screens. Not wired to the
                backend.
              </p>
            </div>
          )}
        </div>
      </div>
    </PreviewContext.Provider>
  );
}
