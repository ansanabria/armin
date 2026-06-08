import { Link, Outlet } from "@tanstack/react-router";
import { Layers, GraduationCap, Library, Settings } from "lucide-react";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { WindowControls } from "@/components/window-controls";
import { cn } from "@/lib/utils";

const navLink =
  "titlebar-no-drag -mb-px flex h-14 items-center gap-1.5 border-b-2 border-b-transparent px-4 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";
const navLinkActive =
  "titlebar-no-drag -mb-px flex h-14 items-center gap-1.5 border-b-2 !border-b-accent px-4 text-sm font-medium text-accent transition-colors duration-150 hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

const platform = window.arminShell?.platform ?? "linux";

export default function RootLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="titlebar-drag z-30 grid h-14 w-full shrink-0 grid-cols-[1fr_auto_1fr] items-stretch border-b border-border bg-bg">
        <Link
          to="/"
          className={cn(
            "titlebar-no-drag flex h-14 items-center justify-self-start px-6 font-serif text-xl font-semibold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
            platform === "darwin" && "pl-[78px]",
          )}
        >
          Armin
        </Link>

        <nav className="flex items-stretch justify-self-center">
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
            to="/review"
            className={navLink}
            activeProps={{ className: navLinkActive }}
          >
            <GraduationCap className="h-4 w-4" strokeWidth={1.5} />
            Review
          </Link>
          <Link
            to="/browse"
            className={navLink}
            activeProps={{ className: navLinkActive }}
          >
            <Library className="h-4 w-4" strokeWidth={1.5} />
            Browse
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

        <div className="flex justify-self-end">
          <ThemeToggle />
          <ProfileSwitcher />
          <WindowControls />
        </div>
      </header>
      <main className="route-view flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {/* Layout (centered vs. full-bleed) follows the rendered page via the
            `route-pad`/`route-scroll` `:has([data-fullbleed])` rules, so it
            stays in sync with <Outlet/> during view transitions. */}
        <div className="route-scroll notebook-bg min-h-0 flex-1 overflow-y-auto">
          <div className="route-pad mx-auto w-full max-w-5xl px-6 py-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
