import { memo, useEffect } from "react";
import {
  Handle,
  Position,
  useNodeId,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { StateBadge, type CardState } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { CardTypeBadge } from "@/components/card-type-badge";
import type { CardType } from "../../../main/services/card-types";
import { cn } from "@/lib/utils";

export type CardNodeData = {
  front: string;
  back: string;
  type: CardType;
  state: CardState;
  locked: boolean;
  isIsolated: boolean;
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

  return (
    <div
      className={cn(
        "group relative w-[240px] border border-border bg-surface px-3.5 py-3 transition-colors duration-150",
        selected
          ? "border-accent ring-2 ring-accent/30"
          : "hover:border-border-strong",
        data.locked && "opacity-65",
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
        <CardTypeBadge type={data.type} />
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

export const CardNode = memo(CardNodeComponent);
