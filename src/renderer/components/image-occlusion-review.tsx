import type { ImageOcclusionContent } from "../../main/services/flashcard-types";
import { cn } from "@/lib/utils";

export function isImageOcclusionMaskHidden({
  revealMode,
  targetId,
  maskId,
  flipped,
}: {
  revealMode: ImageOcclusionContent["revealMode"];
  targetId: string;
  maskId: string;
  flipped: boolean;
}) {
  if (flipped) return false;
  return revealMode === "hide_all" || maskId === targetId;
}

export function ImageOcclusionReview({
  content,
  targetId,
  flipped,
}: {
  content: ImageOcclusionContent;
  targetId: string;
  flipped: boolean;
}) {
  const target = content.masks.find((mask) => mask.id === targetId);

  return (
    <div className="flex w-full flex-col items-center">
      {content.header && (
        <p className="mb-4 max-w-[52ch] text-pretty text-lg font-medium text-ink">
          {content.header}
        </p>
      )}
      <div className="relative overflow-hidden rounded-md border border-border-strong">
        <img
          src={content.baseImage}
          alt="Image occlusion"
          className="block max-h-[360px] w-full object-contain"
        />
        {content.masks.map((mask) => {
          const hidden = isImageOcclusionMaskHidden({
            revealMode: content.revealMode,
            targetId,
            maskId: mask.id,
            flipped,
          });
          const isTarget = mask.id === targetId;
          if (!hidden && !isTarget) return null;
          return (
            <div
              key={mask.id}
              className={cn(
                "pointer-events-none absolute border-2",
                hidden
                  ? "border-ink/80 bg-ink/80"
                  : "border-good bg-good/15",
                isTarget && !flipped && "animate-pulse border-accent",
              )}
              style={{
                left: `${mask.geometry.x * 100}%`,
                top: `${mask.geometry.y * 100}%`,
                width: `${mask.geometry.w * 100}%`,
                height: `${mask.geometry.h * 100}%`,
              }}
            />
          );
        })}
      </div>
      {!flipped && (
        <p className="mt-4 text-sm text-muted">
          {target?.hint ? `What is hidden here? (${target.hint})` : "What is hidden here?"}
        </p>
      )}
      {flipped && (
        <div className="mt-4 space-y-2 text-center">
          {target?.label && (
            <p className="text-lg font-medium text-ink">{target.label}</p>
          )}
          {content.extra && <p className="text-sm text-muted">{content.extra}</p>}
        </div>
      )}
    </div>
  );
}
