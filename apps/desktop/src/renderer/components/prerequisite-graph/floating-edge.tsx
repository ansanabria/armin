import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
} from "@xyflow/react";
import { getEdgeParams } from "@/lib/graph-geometry";

/**
 * Floating edge: endpoints are computed from node geometry rather than a fixed
 * handle, so the curve meets each card's border on whichever side faces the
 * other card and the arrowhead points cleanly into the dependent.
 */
function FloatingEdgeComponent({
  id,
  source,
  target,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
  );

  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth ?? 16}
    />
  );
}

export const FloatingEdge = memo(FloatingEdgeComponent);
