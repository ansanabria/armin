import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { resolveViewTransitionTypes } from "@/lib/view-transitions";
import RootLayout from "./routes/__root";
import DecksPage from "./routes/decks";
import BrowsePage from "./routes/browse";
import DeckPage from "./routes/deck";
import DeckGraphPage from "./routes/deck-graph";
import ReviewPage from "./routes/review";
import ReviewsPage from "./routes/reviews";
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

const deckGraphRoute = createRoute({
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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  decksRoute,
  browseRoute,
  deckRoute,
  deckGraphRoute,
  reviewRoute,
  reviewsRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
  defaultViewTransition: {
    types: resolveViewTransitionTypes,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
