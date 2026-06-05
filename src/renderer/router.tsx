import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import RootLayout from "./routes/__root";
import DecksPage from "./routes/decks";
import DeckPage from "./routes/deck";
import ReviewPage from "./routes/review";
import SettingsPage from "./routes/settings";

const rootRoute = createRootRoute({ component: RootLayout });

const decksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DecksPage,
});

const deckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId",
  component: DeckPage,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/review",
  component: ReviewPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  decksRoute,
  deckRoute,
  reviewRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
