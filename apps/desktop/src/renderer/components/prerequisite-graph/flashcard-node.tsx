import { memo, useEffect, useRef } from "react";
import {
  Handle,
  Position,
  useNodeId,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { StateBadge, type ReviewState } from "@/components/ui/badge";
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

  // Re-measure handle bounds when text (and therefore height) changes — but skip
  // the initial mount: ReactFlow already measures nodes on mount, and forcing a
  // re-measure for every node at once turns a large graph's first paint into a
  // layout-thrash storm.
  const measuredOnce = useRef(false);
  useEffect(() => {
    if (!measuredOnce.current) {
      measuredOnce.current = true;
      return;
    }
    if (nodeId) updateNodeInternals(nodeId);
  }, [nodeId, data.front, data.back, updateNodeInternals]);

  const isActive = selected || data.emphasis === "active";
  const isConnected = data.emphasis === "connected";
  const isDimmed = data.emphasis === "dimmed";

  return (
    <div
      className={cn(
        "group relative w-[240px] overflow-hidden border border-border bg-surface px-3.5 py-3 transition-[opacity,border-color,box-shadow] duration-150",
        isActive
          ? "border-accent ring-2 ring-accent/30"
          : isConnected
            ? "border-accent/50"
            : "hover:border-border-strong",
        data.locked && "opacity-65",
        isDimmed && "opacity-35",
      )}
    >
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
        {data.isIsolated && (
          <span className="text-[0.625rem] font-medium uppercase tracking-wide text-muted">
            Isolated
          </span>
        )}
      </div>

      <p className="line-clamp-2 whitespace-pre-wrap break-words text-[0.8125rem] font-semibold leading-snug text-ink">
        {data.front}
      </p>
      {data.back && (
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words border-t border-border/60 pt-1.5 text-[0.6875rem] leading-snug text-muted">
          {data.back}
        </p>
      )}
    </div>
  );
}

export const FlashcardNode = memo(CardNodeComponent);
