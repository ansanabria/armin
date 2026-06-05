import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "flex h-14 w-[46px] shrink-0 items-center justify-center rounded-none border-l border-border text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol";

function RestoreIcon() {
  return (
    <span className="relative h-3.5 w-3.5" aria-hidden>
      <span className="absolute bottom-0 left-0 h-2.5 w-2.5 border border-current" />
      <span className="absolute right-0 top-0 h-2.5 w-2.5 border border-current bg-surface" />
    </span>
  );
}

export function WindowControls() {
  const shell = window.arminShell;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!shell) return;
    shell.isMaximized().then(setMaximized);
    return shell.onMaximizedChange(setMaximized);
  }, [shell]);

  if (!shell || shell.platform === "darwin") return null;

  const toggleMaximize = async () => {
    const result = await shell.maximize();
    setMaximized(result.maximized);
  };

  return (
    <div className="titlebar-no-drag flex h-14 shrink-0 items-stretch">
      <button
        type="button"
        aria-label="Minimize window"
        className={control}
        onClick={() => shell.minimize()}
      >
        <Minus className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore window" : "Maximize window"}
        className={control}
        onClick={() => toggleMaximize()}
      >
        {maximized ? (
          <RestoreIcon />
        ) : (
          <Square className="h-3.5 w-3.5" strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        aria-label="Close window"
        className={cn(
          control,
          "hover:bg-again hover:text-white focus-visible:ring-again",
        )}
        onClick={() => shell.close()}
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
