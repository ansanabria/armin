export type GraphEdge = {
  prereqId: string;
  dependentId: string;
};

/** Would adding prereq → dependent introduce a cycle? */
export function wouldCreateCycle(
  edges: GraphEdge[],
  prereqId: string,
  dependentId: string,
): boolean {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adj.get(edge.prereqId) ?? [];
    list.push(edge.dependentId);
    adj.set(edge.prereqId, list);
  }

  const list = adj.get(prereqId) ?? [];
  list.push(dependentId);
  adj.set(prereqId, list);

  const seen = new Set<string>();
  const stack = [dependentId];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === prereqId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(adj.get(node) ?? []));
  }
  return false;
}

export function isIsolatedNode(
  nodeId: string,
  edges: GraphEdge[],
): boolean {
  return !edges.some(
    (e) => e.prereqId === nodeId || e.dependentId === nodeId,
  );
}
