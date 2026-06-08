import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const platform = window.arminShell?.platform ?? "linux";

const closeControl =
  "titlebar-no-drag flex h-11 w-11 shrink-0 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

export function ProfilePickerShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shell = window.arminShell;

  return (
    <div className={cn("flex h-screen flex-col bg-bg text-ink", className)}>
      <header
        className={cn(
          "titlebar-drag flex h-11 shrink-0 items-center border-b border-border bg-bg",
          platform === "darwin" && "pl-[72px]",
        )}
      >
        <div className="titlebar-no-drag flex flex-1 items-center px-4">
          <span className="font-serif text-base font-semibold tracking-tight">
            Armin
          </span>
        </div>
        {shell && platform !== "darwin" && (
          <button
            type="button"
            aria-label="Close"
            className={cn(closeControl, "hover:bg-again hover:text-white")}
            onClick={() => shell.close()}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </header>
      <div className="notebook-bg flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
