import { Position, type InternalNode } from "@xyflow/react";

type Point = { x: number; y: number };

function nodeSize(node: InternalNode) {
  return {
    width: node.measured.width ?? 0,
    height: node.measured.height ?? 0,
  };
}

function nodeCenter(node: InternalNode): Point {
  const { width, height } = nodeSize(node);
  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: node.internals.positionAbsolute.y + height / 2,
  };
}

/**
 * Point where the line from `node` center to `other` center crosses `node`'s
 * border. Lets edges meet the rectangle edge regardless of which side faces
 * the other card. Adapted from the React Flow floating-edges example.
 */
function getNodeIntersection(node: InternalNode, other: InternalNode): Point {
  const { width, height } = nodeSize(node);
  const w = width / 2;
  const h = height / 2;
  const x2 = node.internals.positionAbsolute.x + w;
  const y2 = node.internals.positionAbsolute.y + h;
  const { x: x1, y: y1 } = nodeCenter(other);

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return {
    x: w * (xx3 + yy3) + x2,
    y: h * (-xx3 + yy3) + y2,
  };
}

/** Which border the intersection point lands on, so the arrow orients correctly. */
function getEdgePosition(node: InternalNode, point: Point): Position {
  const { width, height } = nodeSize(node);
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + height - 1) return Position.Bottom;
  return Position.Top;
}

export function getEdgeParams(source: InternalNode, target: InternalNode) {
  const sourcePoint = getNodeIntersection(source, target);
  const targetPoint = getNodeIntersection(target, source);

  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y,
    sourcePos: getEdgePosition(source, sourcePoint),
    targetPos: getEdgePosition(target, targetPoint),
  };
}
