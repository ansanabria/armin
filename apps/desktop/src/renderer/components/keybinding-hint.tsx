import { Kbd } from "@/components/ui/kbd";
import { parseBinding, stepLabels } from "@/lib/keybindings/keys";
import { cn } from "@/lib/utils";

/** Render a binding string ("g d", "Mod+k", "Space") as a row of <Kbd> chips. */
export function KeybindingHint({
  binding,
  className,
}: {
  binding: string;
  className?: string;
}) {
  const steps = parseBinding(binding);
  if (steps.length === 0) {
    return <span className={cn("text-xs text-muted", className)}>Unbound</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {steps.map((step, i) => (
        // Steps render in fixed order, so the index is a stable key here.
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[0.625rem] text-muted">then</span>}
          {stepLabels(step).map((label, j) => (
            <Kbd key={j}>{label}</Kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
