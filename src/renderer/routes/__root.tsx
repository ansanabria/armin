import { Link, Outlet } from "@tanstack/react-router";
import { Brain, Layers, Settings } from "lucide-react";
import { WindowControls } from "@/components/window-controls";
import { cn } from "@/lib/utils";

const navLink =
  "titlebar-no-drag -mb-px flex h-14 items-center gap-1.5 border-b-2 border-l border-b-transparent border-border px-4 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol";
const navLinkActive =
  "titlebar-no-drag -mb-px flex h-14 items-center gap-1.5 border-b-2 border-l !border-b-clay border-border bg-clay-tint px-4 text-sm font-medium text-clay-deep transition-colors duration-150 hover:bg-clay-tint hover:text-clay-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol";

const platform = window.arminShell?.platform ?? "linux";

export default function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="titlebar-drag z-30 flex h-14 w-full shrink-0 items-stretch border-b border-border bg-surface">
        <Link
          to="/"
          className={cn(
            "titlebar-no-drag flex h-14 items-center gap-2 px-6 text-[0.9375rem] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol",
            platform === "darwin" && "pl-[78px]",
          )}
        >
          <Brain className="h-5 w-5 text-clay" strokeWidth={1.75} />
          Armin
        </Link>

        <div className="min-w-0 flex-1" aria-hidden />

        <nav className="flex shrink-0 items-stretch">
          <Link
            to="/"
            className={navLink}
            activeProps={{ className: navLinkActive }}
            activeOptions={{ exact: true }}
          >
            <Layers className="h-4 w-4" strokeWidth={1.5} />
            Decks
          </Link>
          <Link
            to="/settings"
            className={navLink}
            activeProps={{ className: navLinkActive }}
          >
            <Settings className="h-4 w-4" strokeWidth={1.5} />
            Settings
          </Link>
        </nav>

        <WindowControls />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
