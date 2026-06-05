import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "default" | "success" | "error";
type ToastItem = { id: number; title: string; description?: string; tone: ToastTone };
type ToastInput = { title: string; description?: string; tone?: ToastTone };

const ToastContext = React.createContext<{
  toast: (t: ToastInput) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}

const TONE: Record<ToastTone, { Icon: typeof Info; color: string }> = {
  default: { Icon: Info, color: "text-petrol" },
  success: { Icon: CheckCircle2, color: "text-good" },
  error: { Icon: AlertCircle, color: "text-again" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const toast = React.useCallback((t: ToastInput) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { tone: "default", ...t, id }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 3500);
  }, []);

  const dismiss = (id: number) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-60 flex flex-col items-center gap-2 px-4">
          {items.map(({ id, title, description, tone }) => {
            const { Icon, color } = TONE[tone];
            return (
              <div
                key={id}
                role="status"
                className="animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-overlay"
              >
                <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", color)} style={{ height: "1.125rem", width: "1.125rem" }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{title}</p>
                  {description && (
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(id)}
                  aria-label="Dismiss"
                  className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
