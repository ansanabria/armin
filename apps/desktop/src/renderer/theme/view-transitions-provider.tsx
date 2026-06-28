import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyViewTransitionsPreference,
  readViewTransitionsEnabled,
  storeViewTransitionsEnabled,
} from "@/lib/view-transitions";

type ViewTransitionsContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const ViewTransitionsContext =
  createContext<ViewTransitionsContextValue | null>(null);

export function ViewTransitionsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() =>
    readViewTransitionsEnabled(),
  );

  const setEnabled = (next: boolean) => {
    storeViewTransitionsEnabled(next);
    setEnabledState(next);
  };

  useEffect(() => {
    applyViewTransitionsPreference(enabled);
  }, [enabled]);

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled]);

  return (
    <ViewTransitionsContext.Provider value={value}>
      {children}
    </ViewTransitionsContext.Provider>
  );
}

export function useViewTransitions() {
  const ctx = useContext(ViewTransitionsContext);
  if (!ctx) {
    throw new Error(
      "useViewTransitions must be used within ViewTransitionsProvider",
    );
  }
  return ctx;
}
