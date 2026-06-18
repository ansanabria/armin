import type { FlashcardType } from "../../main/services/flashcard-types";
import { cn } from "@/lib/utils";

export const CARD_TYPE_LABELS: Record<FlashcardType, string> = {
  basic: "Basic",
  basic_reversed: "Reversed",
  cloze: "Cloze",
  type_answer: "Type answer",
  image_occlusion: "Image occlusion",
};

/** Small chip showing a note's card type. Hidden for plain basic cards. */
export function FlashcardTypeBadge({
  type,
  className,
}: {
  type: FlashcardType;
  className?: string;
}) {
  if (type === "basic") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted",
        className,
      )}
    >
      {CARD_TYPE_LABELS[type]}
    </span>
  );
}
