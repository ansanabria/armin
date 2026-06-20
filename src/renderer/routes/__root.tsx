import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Layers, Library, Settings, Share2 } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { ReviewNavLink } from "@/components/review-nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { WindowControls } from "@/components/window-controls";
import { cn } from "@/lib/utils";

const navLink =
  "titlebar-no-drag -mb-px flex h-14 items-center gap-1.5 border-b-2 border-b-transparent px-4 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";
const navLinkActive =
  "titlebar-no-drag -mb-px flex h-14 items-center gap-1.5 border-b-2 !border-b-accent px-4 text-sm font-medium text-accent transition-colors duration-150 hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

const platform = window.arminShell?.platform ?? "linux";

export default function RootLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [optimisticPathname, setOptimisticPathname] = useState<string | null>(
    null,
  );
  const activePathname = optimisticPathname ?? pathname;

  useEffect(() => {
    if (optimisticPathname === pathname) {
      setOptimisticPathname(null);
    }
  }, [optimisticPathname, pathname]);

  const navClass = (path: string, exact = false) => {
    const active = exact
      ? activePathname === path
      : activePathname === path || activePathname.startsWith(`${path}/`);
    return active ? navLinkActive : navLink;
  };

  const activateNav = (path: string) => {
    flushSync(() => setOptimisticPathname(path));
  };

  const activateNavFromKeyboard = (
    event: KeyboardEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      activateNav(path);
    }
  };

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
            className={navClass("/", true)}
            onPointerDown={(event) => {
              if (event.button === 0) activateNav("/");
            }}
            onKeyDown={(event) => activateNavFromKeyboard(event, "/")}
          >
            <Layers className="h-4 w-4" strokeWidth={1.5} />
            Decks
          </Link>
          <Link
            to="/browse"
            className={navClass("/browse")}
            onPointerDown={(event) => {
              if (event.button === 0) activateNav("/browse");
            }}
            onKeyDown={(event) => activateNavFromKeyboard(event, "/browse")}
          >
            <Library className="h-4 w-4" strokeWidth={1.5} />
            Browse
          </Link>
          <Link
            to="/graph"
            search={{ focus: undefined }}
            className={navClass("/graph")}
            onPointerDown={(event) => {
              if (event.button === 0) activateNav("/graph");
            }}
            onKeyDown={(event) => activateNavFromKeyboard(event, "/graph")}
          >
            <Share2 className="h-4 w-4" strokeWidth={1.5} />
            Graph
          </Link>
          <Link
            to="/settings"
            className={navClass("/settings")}
            onPointerDown={(event) => {
              if (event.button === 0) activateNav("/settings");
            }}
            onKeyDown={(event) => activateNavFromKeyboard(event, "/settings")}
          >
            <Settings className="h-4 w-4" strokeWidth={1.5} />
            Settings
          </Link>
        </nav>

        <div className="flex items-center justify-self-end">
          <ThemeToggle />
          <ProfileSwitcher />
          <ReviewNavLink />
          <WindowControls />
        </div>
      </header>
      <main className="route-view flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {/* Layout (centered vs. full-bleed) follows the rendered page via the
            `route-pad`/`route-scroll` `:has([data-fullbleed])` rules, so it
            stays in sync with <Outlet/> during view transitions. */}
        <div className="route-scroll armin-scrollbar armin-scrollbar-gutter-bg notebook-bg min-h-0 flex-1 overflow-y-auto">
          <div className="route-pad mx-auto w-full max-w-5xl px-6 py-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
