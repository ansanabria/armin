import { cn } from "@/lib/utils";

/** Slim progress meter. Accent fill on a border-toned track. */
export function Progress({
  value,
  max = 100,
  className,
  tone = "accent",
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: "accent" | "good" | "ink";
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const fill =
    tone === "good" ? "bg-good" : tone === "ink" ? "bg-ink" : "bg-accent";
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-border",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-quart)]",
          fill,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
