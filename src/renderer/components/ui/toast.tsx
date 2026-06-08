import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "default" | "success" | "error";
type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  exiting?: boolean;
};
type ToastInput = { title: string; description?: string; tone?: ToastTone };

const EXIT_MS = 280;

const ToastContext = React.createContext<{
  toast: (t: ToastInput) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}

const TONE: Record<ToastTone, { Icon: typeof Info; color: string }> = {
  default: { Icon: Info, color: "text-accent" },
  success: { Icon: CheckCircle2, color: "text-good" },
  error: { Icon: AlertCircle, color: "text-again" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);
  const timeoutsRef = React.useRef<Map<number, number>>(new Map());

  const clearToastTimeout = React.useCallback((id: number) => {
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const remove = React.useCallback(
    (id: number) => {
      clearToastTimeout(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [clearToastTimeout],
  );

  const beginDismiss = React.useCallback(
    (id: number) => {
      clearToastTimeout(id);
      setItems((prev) => {
        const item = prev.find((i) => i.id === id);
        if (!item || item.exiting) return prev;
        return prev.map((i) => (i.id === id ? { ...i, exiting: true } : i));
      });
    },
    [clearToastTimeout],
  );

  const toast = React.useCallback(
    (t: ToastInput) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { tone: "default", ...t, id }]);
      const timeoutId = window.setTimeout(() => beginDismiss(id), 3500);
      timeoutsRef.current.set(id, timeoutId);
    },
    [beginDismiss],
  );

  const dismiss = (id: number) => beginDismiss(id);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-60 flex flex-col items-center gap-2 px-4">
          {items.map(({ id, title, description, tone, exiting }) => {
            const { Icon, color } = TONE[tone];
            return (
              <ToastNotice
                key={id}
                exiting={exiting ?? false}
                onExitComplete={() => remove(id)}
                onDismiss={() => dismiss(id)}
                icon={<Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", color)} style={{ height: "1.125rem", width: "1.125rem" }} aria-hidden />}
                title={title}
                description={description}
              />
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastNotice({
  exiting,
  onExitComplete,
  onDismiss,
  icon,
  title,
  description,
}: {
  exiting: boolean;
  onExitComplete: () => void;
  onDismiss: () => void;
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!exiting) return;

    let finished = false;
    const finishExit = () => {
      if (finished) return;
      finished = true;
      onExitComplete();
    };

    const panel = panelRef.current;
    const onEnd = (event: AnimationEvent) => {
      if (event.target !== panel) return;
      finishExit();
    };

    panel?.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(finishExit, EXIT_MS + 50);

    return () => {
      panel?.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [exiting, onExitComplete]);

  return (
    <div
      ref={panelRef}
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-overlay",
        exiting ? "pointer-events-none animate-rise-out" : "animate-rise",
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && (
          <p className="mt-0.5 text-[0.8125rem] text-muted">{description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
