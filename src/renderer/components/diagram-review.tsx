import type { DiagramContent } from "../../main/services/flashcard-types";
import { cn } from "@/lib/utils";

/**
 * Review presentation for a diagram card. The target region (matched by
 * `targetId`) is highlighted; flipping reveals its label.
 */
export function DiagramReview({
  content,
  targetId,
  flipped,
  label,
}: {
  content: DiagramContent;
  targetId: string;
  flipped: boolean;
  label: string;
}) {
  const target = content.regions.find((region) => region.id === targetId);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative overflow-hidden rounded-md border border-border-strong">
        <img
          src={content.image}
          alt="Diagram"
          className="block max-h-[360px] w-full object-contain"
        />
        {target && (
          <div
            className={cn(
              "pointer-events-none absolute border-2",
              flipped
                ? "border-good bg-good/20"
                : "animate-pulse border-accent bg-accent/25",
            )}
            style={{
              left: `${target.x * 100}%`,
              top: `${target.y * 100}%`,
              width: `${target.w * 100}%`,
              height: `${target.h * 100}%`,
            }}
          />
        )}
      </div>
      {!flipped && (
        <p className="mt-4 text-sm text-muted">
          {target?.hint
            ? `What is the highlighted region? (${target.hint})`
            : "What is the highlighted region?"}
        </p>
      )}
      {flipped && <p className="mt-4 text-lg font-medium text-ink">{label}</p>}
    </div>
  );
}
