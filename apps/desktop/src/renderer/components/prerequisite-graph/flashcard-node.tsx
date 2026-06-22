import { memo, useEffect } from "react";
import {
  Handle,
  Position,
  useNodeId,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { StateBadge, type ReviewState } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { FlashcardTypeBadge } from "@/components/flashcard-type-badge";
import type { FlashcardType } from "../../../shared/flashcard-types";
import { cn } from "@/lib/utils";

/**
 * How a node is emphasized relative to the current selection:
 * - `active`: the selected card
 * - `connected`: a direct prerequisite/dependent of the selected card
 * - `dimmed`: pushed back (not selected/connected, or filtered out)
 * - `null`: neutral (nothing selected and not filtered)
 */
export type NodeEmphasis = "active" | "connected" | "dimmed" | null;

export type CardNodeData = {
  front: string;
  back: string;
  type: FlashcardType;
  state: ReviewState;
  locked: boolean;
  isIsolated: boolean;
  deckName: string;
  deckColor: string;
  emphasis: NodeEmphasis;
};

export type CardFlowNode = Node<CardNodeData, "card">;

/**
 * Four connect points, one per side. With `ConnectionMode.Loose` each acts as
 * both source and target, so a link can be drawn from/to any border. Visuals
 * are handled by floating edges, so handle position only affects where the
 * drag begins.
 */
const SIDES: { id: string; position: Position }[] = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
];

function CardNodeComponent({ data, selected }: NodeProps<CardFlowNode>) {
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();

  // Re-measure handle bounds when text (and therefore height) changes.
  useEffect(() => {
    if (nodeId) updateNodeInternals(nodeId);
  }, [nodeId, data.front, data.back, updateNodeInternals]);

  const isActive = selected || data.emphasis === "active";
  const isConnected = data.emphasis === "connected";
  const isDimmed = data.emphasis === "dimmed";

  return (
    <div
      className={cn(
        "group relative w-[240px] overflow-hidden border border-border bg-surface px-3.5 py-3 pl-4 transition-[opacity,border-color,box-shadow] duration-150",
        isActive
          ? "border-accent ring-2 ring-accent/30"
          : isConnected
            ? "border-accent/50"
            : "hover:border-border-strong",
        data.locked && "opacity-65",
        isDimmed && "opacity-35",
      )}
    >
      {/* Deck lens: left color stripe (decorative — the deck chip is the cue). */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: data.deckColor }}
      />

      {SIDES.map(({ id, position }) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={position}
          className="card-graph-handle"
        />
      ))}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <StateBadge state={data.state} locked={data.locked} />
        <FlashcardTypeBadge type={data.type} />
        <span className="inline-flex items-center gap-1 text-[0.625rem] font-medium text-muted">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: data.deckColor }}
          />
          {data.deckName}
        </span>
        {data.isIsolated && (
          <span className="text-[0.625rem] font-medium uppercase tracking-wide text-muted">
            Isolated
          </span>
        )}
      </div>

      <MarkdownContent
        content={data.front}
        images="placeholder"
        className="line-clamp-2 text-[0.8125rem] font-semibold leading-snug text-ink"
      />
      {data.back && (
        <MarkdownContent
          content={data.back}
          images="placeholder"
          className="mt-1 line-clamp-2 border-t border-border/60 pt-1.5 text-[0.6875rem] leading-snug text-muted"
        />
      )}
    </div>
  );
}

export const FlashcardNode = memo(CardNodeComponent);
