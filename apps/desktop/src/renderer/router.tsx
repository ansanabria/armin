import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import RootLayout from "./routes/__root";
import DecksPage from "./routes/decks";
import BrowsePage from "./routes/browse";
import DeckPage from "./routes/deck";
import DeckGraphPage from "./routes/graph";
import ReviewPage from "./routes/review";
import ReviewsPage from "./routes/reviews";
import CramPage from "./routes/cram";
import SettingsPage from "./routes/settings";

const rootRoute = createRootRoute({ component: RootLayout });

const decksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DecksPage,
});

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/browse",
  component: BrowsePage,
});

const deckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId",
  component: DeckPage,
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/graph",
  component: DeckGraphPage,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/review",
  component: ReviewPage,
});

const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/review",
  component: ReviewsPage,
});

const cramRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cram",
  component: CramPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  decksRoute,
  browseRoute,
  deckRoute,
  graphRoute,
  reviewRoute,
  reviewsRoute,
  cramRoute,
  settingsRoute,
]);

/**
 * Left-to-right position of each page, mirroring the header nav order
 * (Decks → Browse → Cram → Settings). Drill-in and session routes are
 * slotted next to their parent section. The rank drives the directional view
 * transition: navigating to a higher rank slides forward, lower slides back.
 */
function routeRank(pathname: string): number {
  if (pathname === "/") return 0; // Decks
  if (pathname.startsWith("/deck/") && pathname.endsWith("/review")) return 5;
  if (pathname.startsWith("/deck/")) return 1; // a deck's detail or its graph
  if (pathname.startsWith("/browse")) return 2;
  if (pathname.startsWith("/cram")) return 4;
  if (pathname.startsWith("/review")) return 5; // all-decks review session
  if (pathname.startsWith("/settings")) return 6;
  return 0;
}

/** A deck's detail page or its graph (`/deck/$deckId`), not its review session. */
function isDeckDetail(pathname: string): boolean {
  return pathname.startsWith("/deck/") && !pathname.endsWith("/review");
}

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
  defaultViewTransition: window.__ARMIN_E2E__
    ? false
    : {
        // Tag each navigation with a direction so the content can slide the way the
        // user is moving through the app. CSS keys off these via
        // `:active-view-transition-type(forward|backward)`. Same-rank navigations
        // return no type and fall back to the neutral fade.
        types: ({ fromLocation, toLocation }) => {
          const toPath = toLocation.pathname;
          const fromPath = fromLocation?.pathname;
          if (!fromPath || fromPath === toPath) return false;

          const toDeck = isDeckDetail(toPath);
          const fromDeck = isDeckDetail(fromPath);
          // Opening a deck rises up; going back out of it drops down. Switching
          // directly between two decks falls through to the fade, and leaving a deck
          // to go deeper (e.g. its review) keeps the horizontal forward slide.
          if (toDeck && !fromDeck) return ["deck-enter"];
          if (fromDeck && !toDeck && routeRank(toPath) < routeRank(fromPath!)) {
            return ["deck-leave"];
          }
          const from = routeRank(fromPath);
          const to = routeRank(toPath);
          if (from === to) return [];
          return to > from ? ["forward"] : ["backward"];
        },
      },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
