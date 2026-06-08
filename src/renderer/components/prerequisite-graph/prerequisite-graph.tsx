import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  ConnectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnEdgesDelete,
  type XYPosition,
} from "@xyflow/react";
import { LayoutGrid, Pencil, Trash2 } from "lucide-react";
import type { UiDeckGraph } from "@/types/view-models";
import { wouldCreateCycle } from "@/lib/graph-cycle";
import {
  EDGE_MARKER_END,
  EDGE_STROKE,
  graphToFlowElements,
  makeFlowEdge,
  refreshNodeData,
  toFlowNode,
} from "@/lib/graph-flow";
import { layoutGraph } from "@/lib/graph-layout";
import { cn } from "@/lib/utils";
import { FloatingEdge } from "./floating-edge";
import { CardNode, type CardFlowNode, type CardNodeData } from "./card-node";
import { GraphContextMenu } from "./graph-context-menu";

const nodeTypes = { card: CardNode };
const edgeTypes = { floating: FloatingEdge };

type MenuState = { kind: "node"; x: number; y: number; nodeId: string } | null;

type PrerequisiteGraphProps = {
  graph: UiDeckGraph;
  onGraphChange: (graph: UiDeckGraph) => void;
  onConnectError?: (message: string) => void;
  nodePlacements?: Record<string, XYPosition>;
  onCreateCardRequest?: (flowPosition: XYPosition) => void;
  onEditCardRequest?: (nodeId: string) => void;
};

function PaneDoubleClickListener({
  onDoubleClick,
}: {
  onDoubleClick: (screen: { x: number; y: number }, flow: XYPosition) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const handlerRef = useRef(onDoubleClick);
  handlerRef.current = onDoubleClick;

  useEffect(() => {
    const onDblClick = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const target = event.target as HTMLElement;
      if (!target.classList.contains("react-flow__pane")) return;
      event.preventDefault();
      handlerRef.current(
        { x: event.clientX, y: event.clientY },
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    };

    const pane = document.querySelector(".react-flow__pane");
    pane?.addEventListener("dblclick", onDblClick);
    return () => pane?.removeEventListener("dblclick", onDblClick);
  }, [screenToFlowPosition]);

  return null;
}

function PrerequisiteGraphCanvas({
  graph,
  onGraphChange,
  onConnectError,
  nodePlacements,
  onCreateCardRequest,
  onEditCardRequest,
}: PrerequisiteGraphProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const initialized = useRef(false);
  const knownNodeIds = useRef(new Set<string>());
  const nodeIdsKey = graph.nodes.map((n) => n.id).join(",");
  const nodeContentKey = graph.nodes
    .map((n) => `${n.id}:${n.front}:${n.back}:${n.state}:${n.locked}`)
    .join("|");
  const [menu, setMenu] = useState<MenuState>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const initial = graphToFlowElements(graph);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardFlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      knownNodeIds.current = new Set(graph.nodes.map((n) => n.id));
      return;
    }

    const currentIds = new Set(graph.nodes.map((n) => n.id));
    const added = graph.nodes.filter((n) => !knownNodeIds.current.has(n.id));
    const removed = [...knownNodeIds.current].filter((id) => !currentIds.has(id));

    if (removed.length > 0) {
      setNodes((current) => current.filter((n) => !removed.includes(n.id)));
      setEdges((current) =>
        current.filter(
          (e) => !removed.includes(e.source) && !removed.includes(e.target),
        ),
      );
    }

    if (added.length > 0) {
      const fallback = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      setNodes((current) => [
        ...current,
        ...added.map((node, index) => {
          const placement = nodePlacements?.[node.id];
          return toFlowNode(
            node,
            graph.edges,
            placement ?? {
              x: fallback.x + index * 32,
              y: fallback.y + index * 32,
            },
          );
        }),
      ]);
    }

    knownNodeIds.current = currentIds;
  }, [
    nodeIdsKey,
    graph.edges,
    graph.nodes,
    nodePlacements,
    screenToFlowPosition,
    setEdges,
    setNodes,
  ]);

  useEffect(() => {
    setNodes((current) =>
      refreshNodeData(
        current.map((node) => {
          const source = graph.nodes.find((n) => n.id === node.id);
          if (!source) return node;
          return {
            ...node,
            data: {
              front: source.front,
              back: source.back,
              state: source.state,
              locked: source.locked,
              isIsolated: node.data.isIsolated,
            },
          };
        }),
        graph.edges,
      ),
    );
  }, [nodeContentKey, graph.edges, graph.nodes, setNodes]);

  const syncEdges = useCallback(
    (nextEdges: UiDeckGraph["edges"]) => {
      onGraphChange({ ...graph, edges: nextEdges });
      setNodes((current) => refreshNodeData(current, nextEdges));
    },
    [graph, onGraphChange, setNodes],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nextNodes = graph.nodes.filter((n) => n.id !== nodeId);
      const nextEdges = graph.edges.filter(
        (e) => e.prereqId !== nodeId && e.dependentId !== nodeId,
      );
      setNodes((current) => current.filter((n) => n.id !== nodeId));
      setEdges((current) =>
        current.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      onGraphChange({ nodes: nextNodes, edges: nextEdges });
      knownNodeIds.current.delete(nodeId);
    },
    [graph, onGraphChange, setEdges, setNodes],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return false;
      if (
        graph.edges.some(
          (e) => e.prereqId === source && e.dependentId === target,
        )
      ) {
        return false;
      }
      return !wouldCreateCycle(graph.edges, source, target);
    },
    [graph.edges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;

      if (source === target) {
        onConnectError?.("A card can't depend on itself.");
        return;
      }

      if (
        graph.edges.some(
          (e) => e.prereqId === source && e.dependentId === target,
        )
      ) {
        return;
      }

      if (wouldCreateCycle(graph.edges, source, target)) {
        onConnectError?.("That link would create a cycle.");
        return;
      }

      const flowEdge = makeFlowEdge(source, target);
      setEdges((current) => addEdge(flowEdge, current));
      syncEdges([...graph.edges, { prereqId: source, dependentId: target }]);
    },
    [graph, onConnectError, setEdges, syncEdges],
  );

  const onEdgesDelete: OnEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const deletedIds = new Set(deleted.map((e) => e.id));
      const nextEdges = graph.edges.filter(
        (e) => !deletedIds.has(`${e.prereqId}-${e.dependentId}`),
      );
      setEdges((current) => current.filter((e) => !deletedIds.has(e.id)));
      onGraphChange({ ...graph, edges: nextEdges });
      setNodes((current) => refreshNodeData(current, nextEdges));
    },
    [graph, onGraphChange, setEdges, setNodes],
  );

  const onPaneDoubleClick = useCallback(
    (_screen: { x: number; y: number }, flowPosition: XYPosition) => {
      onCreateCardRequest?.(flowPosition);
    },
    [onCreateCardRequest],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: CardFlowNode) => {
      event.preventDefault();
      setMenu({
        kind: "node",
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [],
  );

  const onTidy = useCallback(() => {
    setNodes((current) => {
      const { nodes: laidOut } = layoutGraph<CardNodeData>(current, edges);
      return laidOut as CardFlowNode[];
    });
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
  }, [edges, fitView, setNodes]);

  const menuItems =
    menu?.kind === "node"
      ? [
          {
            label: "Edit card",
            icon: <Pencil className="h-4 w-4" />,
            onClick: () => onEditCardRequest?.(menu.nodeId),
          },
          {
            label: "Delete card",
            icon: <Trash2 className="h-4 w-4" />,
            variant: "destructive" as const,
            onClick: () => deleteNode(menu.nodeId),
          },
        ]
      : [];

  return (
    <>
      <ReactFlow
        className={cn(isConnecting && "graph-connecting")}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={() => setIsConnecting(true)}
        onConnectEnd={() => setIsConnecting(false)}
        isValidConnection={isValidConnection}
        onEdgesDelete={onEdgesDelete}
        onNodeContextMenu={onNodeContextMenu}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={36}
        minZoom={0.25}
        maxZoom={1.5}
        zoomOnDoubleClick={false}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{
          stroke: "var(--color-accent)",
          strokeWidth: 1.5,
        }}
        defaultEdgeOptions={{
          type: "floating",
          style: { stroke: EDGE_STROKE, strokeWidth: 1.5 },
          markerEnd: EDGE_MARKER_END,
        }}
      >
        <Background
          variant={BackgroundVariant.Cross}
          gap={24}
          size={1}
          color="var(--armin-grid-v)"
        />
        <Controls showInteractive={false} position="bottom-right" />
        <Panel position="top-right">
          <button
            type="button"
            onClick={onTidy}
            className="inline-flex cursor-default items-center gap-1.5 border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Tidy layout
          </button>
        </Panel>
        <PaneDoubleClickListener onDoubleClick={onPaneDoubleClick} />
      </ReactFlow>

      <GraphContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
    </>
  );
}

export function PrerequisiteGraph(props: PrerequisiteGraphProps) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <PrerequisiteGraphCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
