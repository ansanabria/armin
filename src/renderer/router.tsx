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
import GlobalGraphPage from "./routes/graph";
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
  path: "/graph",
  component: GlobalGraphPage,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
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

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
