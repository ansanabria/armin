import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  ConnectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnConnectEnd,
  type OnConnectStart,
  type OnEdgesDelete,
  type OnSelectionChangeFunc,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import {
  Check,
  LayoutGrid,
  Layers,
  Maximize,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { UiDeckGraph } from "@/types/view-models";
import { wouldCreateCycle } from "@/lib/graph-cycle";
import {
  EDGE_MARKER_END,
  EDGE_STROKE,
  graphToFlowElements,
  makeFlowEdge,
  refreshNodeData,
  styleEdgeForEmphasis,
  toFlowNode,
} from "@/lib/graph-flow";
import { layoutGraph } from "@/lib/graph-layout";
import { cn } from "@/lib/utils";
import { FloatingEdge } from "./floating-edge";
import {
  FlashcardNode,
  type CardFlowNode,
  type CardNodeData,
  type NodeEmphasis,
} from "./flashcard-node";
import { GraphContextMenu } from "./graph-context-menu";

const nodeTypes = { card: FlashcardNode };
const edgeTypes = { floating: FloatingEdge };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

type NodePlacement = { flashcardId: string; x: number; y: number };

type MenuState = { kind: "node"; x: number; y: number; nodeId: string } | null;
type ConnectMenuState = {
  x: number;
  y: number;
  flow: XYPosition;
  sourceId: string;
} | null;

type DeckLensOption = { id: string; name: string; color: string };

type PrerequisiteGraphProps = {
  graph: UiDeckGraph;
  onGraphChange: (graph: UiDeckGraph) => void;
  onConnectError?: (message: string) => void;
  nodePlacements?: Record<string, XYPosition>;
  decks?: DeckLensOption[];
  focusDeckId?: string | null;
  onCreateCardRequest?: (
    flowPosition: XYPosition,
    connectFromNodeId?: string,
  ) => void;
  onEditCardRequest?: (nodeId: string) => void;
  onDeleteCardRequest?: (nodeId: string) => void;
  onPersistLayout?: (placements: NodePlacement[]) => void;
  initialViewport?: Viewport;
  onViewportChange?: (viewport: Viewport) => void;
  onReady?: () => void;
};

/**
 * Decide how each node reads against the current selection + deck/search lens.
 * Selection wins: a selected card and its direct neighbors stay lit even when a
 * deck filter or search would otherwise dim them, so connections are always
 * legible. Otherwise a node is dimmed only when it falls outside an active
 * filter.
 */
function nodeEmphasisFor(
  node: UiDeckGraph["nodes"][number],
  opts: {
    selectedId: string | null;
    neighborIds: Set<string>;
    query: string;
    focusedDeckIds: Set<string>;
  },
): NodeEmphasis {
  const { selectedId, neighborIds, query, focusedDeckIds } = opts;
  if (selectedId) {
    if (node.id === selectedId) return "active";
    if (neighborIds.has(node.id)) return "connected";
    return "dimmed";
  }
  const inScope =
    (focusedDeckIds.size === 0 || focusedDeckIds.has(node.deckId)) &&
    (query === "" ||
      `${node.front} ${node.back}`.toLowerCase().includes(query));
  if (focusedDeckIds.size === 0 && query === "") return null;
  return inScope ? null : "dimmed";
}

function savedPositionsOf(graph: UiDeckGraph): Map<string, XYPosition> {
  const map = new Map<string, XYPosition>();
  for (const node of graph.nodes) {
    if (node.x != null && node.y != null) {
      map.set(node.id, { x: node.x, y: node.y });
    }
  }
  return map;
}

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

function ZoomControl() {
  const { zoom } = useViewport();
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const [draft, setDraft] = useState<string | null>(null);
  const percent = Math.round(zoom * 100);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parsed / 100));
    void zoomTo(clamped, { duration: 150 });
  };

  const buttonClass =
    "flex h-7 w-7 items-center justify-center text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

  return (
    <div className="flex items-center border border-border bg-surface shadow-overlay">
      <button
        type="button"
        onClick={() => void zoomOut({ duration: 150 })}
        aria-label="Zoom out"
        className={buttonClass}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center border-x border-border px-1">
        <input
          aria-label="Zoom level"
          inputMode="numeric"
          className="w-9 bg-transparent text-right text-xs tabular-nums text-ink outline-none"
          value={draft ?? String(percent)}
          onChange={(event) =>
            setDraft(event.target.value.replace(/[^0-9]/g, ""))
          }
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
        <span className="pl-0.5 text-xs text-muted">%</span>
      </div>
      <button
        type="button"
        onClick={() => void zoomIn({ duration: 150 })}
        aria-label="Zoom in"
        className={buttonClass}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void zoomTo(1, { duration: 150 })}
        aria-label="Reset zoom to 100%"
        title="Reset zoom"
        className={cn(buttonClass, "border-l border-border")}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void fitView({ padding: 0.2, duration: 300 })}
        aria-label="Fit view"
        className={cn(buttonClass, "border-l border-border")}
      >
        <Maximize className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PrerequisiteGraphCanvas({
  graph,
  onGraphChange,
  onConnectError,
  nodePlacements,
  decks,
  focusDeckId,
  onCreateCardRequest,
  onEditCardRequest,
  onDeleteCardRequest,
  onPersistLayout,
  initialViewport,
  onViewportChange,
  onReady,
}: PrerequisiteGraphProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const knownNodeIds = useRef(new Set(graph.nodes.map((n) => n.id)));
  const connectFrom = useRef<string | null>(null);
  const nodeIdsKey = graph.nodes.map((n) => n.id).join(",");
  const nodeContentKey = graph.nodes
    .map((n) => `${n.id}:${n.front}:${n.back}:${n.state}:${n.locked}`)
    .join("|");
  const edgeKey = graph.edges
    .map((e) => `${e.prereqId}->${e.dependentId}`)
    .join("|");
  const [menu, setMenu] = useState<MenuState>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Selection + deck/search lens. The selected card lights up itself, its edges,
  // and its direct neighbors; the deck filter and search dim everything outside
  // their scope.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusedDeckIds, setFocusedDeckIds] = useState<Set<string>>(() =>
    focusDeckId ? new Set([focusDeckId]) : new Set(),
  );
  const [deckMenuOpen, setDeckMenuOpen] = useState(false);

  // Mirror the URL's focused deck into the filter whenever it changes, so the
  // sidebar Graph link (focus cleared) and deck-page links (focus set) can both
  // update or clear the deck lens. Manual deck toggles don't touch focusDeckId,
  // so they aren't clobbered by this effect.
  useEffect(() => {
    setFocusedDeckIds(focusDeckId ? new Set([focusDeckId]) : new Set());
  }, [focusDeckId]);

  // Build the initial canvas once, synchronously, from the graph the parent
  // hands us (it gates mount until the deck has loaded). Computing this at mount
  // — rather than populating an empty canvas in an effect — lets ReactFlow frame
  // the graph on its first paint, avoiding an empty/unframed flicker.
  const initialElements = useRef<{
    nodes: CardFlowNode[];
    edges: Edge[];
  } | null>(null);
  if (!initialElements.current) {
    initialElements.current = graphToFlowElements(
      graph,
      savedPositionsOf(graph),
    );
  }

  const [nodes, setNodes, onNodesChange] = useNodesState<CardFlowNode>(
    initialElements.current.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialElements.current.edges,
  );

  // Always-fresh snapshot of node positions for layout persistence.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Incrementally add/remove nodes as the underlying deck changes, preserving
  // the positions of cards that are already on the canvas.
  useEffect(() => {
    const currentIds = new Set(graph.nodes.map((n) => n.id));
    const added = graph.nodes.filter((n) => !knownNodeIds.current.has(n.id));
    const removed = [...knownNodeIds.current].filter(
      (id) => !currentIds.has(id),
    );

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
          const saved =
            node.x != null && node.y != null
              ? { x: node.x, y: node.y }
              : undefined;
          const placement = saved ?? nodePlacements?.[node.id];
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

  // Keep the rendered edges in sync with the persisted prerequisite edges so
  // arrows survive a reload of the graph.
  useEffect(() => {
    setEdges((current) => {
      const desiredIds = new Set(
        graph.edges.map((e) => `${e.prereqId}-${e.dependentId}`),
      );
      const currentIds = new Set(current.map((e) => e.id));
      const kept = current.filter((e) => desiredIds.has(e.id));
      const additions = graph.edges
        .filter((e) => !currentIds.has(`${e.prereqId}-${e.dependentId}`))
        .map((e) => makeFlowEdge(e.prereqId, e.dependentId));
      return additions.length > 0 ? [...kept, ...additions] : kept;
    });
  }, [edgeKey, graph.edges, setEdges]);

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
              type: source.type,
              state: source.state,
              locked: source.locked,
              isIsolated: node.data.isIsolated,
              deckName: source.deckName,
              deckColor: source.deckColor,
              emphasis: node.data.emphasis,
            },
          };
        }),
        graph.edges,
      ),
    );
  }, [nodeContentKey, graph.edges, graph.nodes, setNodes]);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );
  const query = search.trim().toLowerCase();

  // Re-derive selection/filter emphasis for every node and edge whenever the
  // selection or lens changes. Selected card + its incident edges + direct
  // neighbors light up; out-of-scope elements dim.
  useEffect(() => {
    const neighborIds = new Set<string>();
    if (selectedId) {
      for (const e of graph.edges) {
        if (e.prereqId === selectedId) neighborIds.add(e.dependentId);
        if (e.dependentId === selectedId) neighborIds.add(e.prereqId);
      }
    }

    setNodes((current) =>
      current.map((node) => {
        const source = nodeById.get(node.id);
        if (!source) return node;
        const emphasis = nodeEmphasisFor(source, {
          selectedId,
          neighborIds,
          query,
          focusedDeckIds,
        });
        if (node.data.emphasis === emphasis) return node;
        return { ...node, data: { ...node.data, emphasis } };
      }),
    );

    const lensActive = focusedDeckIds.size > 0 || query !== "";
    const inScope = (id: string) => {
      const n = nodeById.get(id);
      return (
        !!n &&
        nodeEmphasisFor(n, {
          selectedId: null,
          neighborIds,
          query,
          focusedDeckIds,
        }) === null
      );
    };
    setEdges((current) =>
      current.map((edge) => {
        if (selectedId) {
          return styleEdgeForEmphasis(
            edge,
            edge.source === selectedId || edge.target === selectedId
              ? "active"
              : "dimmed",
          );
        }
        if (lensActive) {
          return styleEdgeForEmphasis(
            edge,
            inScope(edge.source) && inScope(edge.target) ? null : "dimmed",
          );
        }
        return styleEdgeForEmphasis(edge, null);
      }),
    );
  }, [selectedId, query, focusedDeckIds, nodeById, graph.edges, setNodes, setEdges]);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      setSelectedId(selectedNodes.length === 1 ? selectedNodes[0].id : null);
    },
    [],
  );

  const toggleDeckFocus = useCallback((deckId: string) => {
    setFocusedDeckIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }, []);

  const persistLayout = useCallback(
    (flowNodes: CardFlowNode[]) => {
      onPersistLayout?.(
        flowNodes.map((node) => ({
          flashcardId: node.id,
          x: node.position.x,
          y: node.position.y,
        })),
      );
    },
    [onPersistLayout],
  );

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
        onConnectError?.("A flashcard can’t depend on itself.");
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

  const onConnectStart: OnConnectStart = useCallback((_, params) => {
    setIsConnecting(true);
    connectFrom.current = params.nodeId ?? null;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      setIsConnecting(false);
      const sourceId = connectFrom.current;
      connectFrom.current = null;

      // A valid drop is handled by onConnect; a drop onto another node should
      // not spawn a card. Only an empty-pane release opens the add-card popup.
      if (!sourceId || connectionState.isValid || connectionState.toNode) {
        return;
      }

      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) return;
      const screen = { x: point.clientX, y: point.clientY };
      setConnectMenu({
        x: screen.x,
        y: screen.y,
        flow: screenToFlowPosition(screen),
        sourceId,
      });
    },
    [screenToFlowPosition],
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

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: CardFlowNode) => {
      onEditCardRequest?.(node.id);
    },
    [onEditCardRequest],
  );

  const onNodeDragStop = useCallback(() => {
    persistLayout(nodesRef.current);
  }, [persistLayout]);

  const onTidy = useCallback(() => {
    const { nodes: laidOut } = layoutGraph<CardNodeData>(
      nodesRef.current,
      edges,
    );
    const typed = laidOut as CardFlowNode[];
    setNodes(typed);
    persistLayout(typed);
    requestAnimationFrame(() =>
      fitView({ padding: 0.2, maxZoom: 1, duration: 300 }),
    );
  }, [edges, fitView, persistLayout, setNodes]);

  const menuItems =
    menu?.kind === "node"
      ? [
          {
            label: "Edit flashcard",
            icon: <Pencil className="h-4 w-4" />,
            onClick: () => onEditCardRequest?.(menu.nodeId),
          },
          {
            label: "Delete flashcard",
            icon: <Trash2 className="h-4 w-4" />,
            variant: "destructive" as const,
            onClick: () => onDeleteCardRequest?.(menu.nodeId) ?? deleteNode(menu.nodeId),
          },
        ]
      : [];

  const connectMenuItems = connectMenu
    ? [
        {
          label: "Add connected flashcard",
          icon: <Plus className="h-4 w-4" />,
          onClick: () =>
            onCreateCardRequest?.(connectMenu.flow, connectMenu.sourceId),
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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onEdgesDelete={onEdgesDelete}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onMoveEnd={(_, viewport) => onViewportChange?.(viewport)}
        onInit={() => {
          // The initial frame (fitView/defaultViewport) is applied during init;
          // wait for it to paint before signalling ready, so the canvas is only
          // revealed once it's framed — never in an intermediate unframed state.
          requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
        }}
        defaultViewport={initialViewport}
        fitView={!initialViewport}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={36}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnDoubleClick={false}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        deleteKeyCode={null}
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
        <Panel position="bottom-right">
          <ZoomControl />
        </Panel>
        <Panel position="top-left">
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-1.5 border border-border bg-surface px-2 shadow-overlay focus-within:ring-2 focus-within:ring-accent">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
              <input
                aria-label="Search flashcards"
                placeholder="Search cards…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-40 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="text-muted transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {decks && decks.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDeckMenuOpen((open) => !open)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 border border-border bg-surface px-2.5 text-xs font-medium shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    focusedDeckIds.size > 0 ? "text-accent" : "text-ink",
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  {focusedDeckIds.size > 0
                    ? `${focusedDeckIds.size} deck${focusedDeckIds.size === 1 ? "" : "s"}`
                    : "Decks"}
                </button>
                {deckMenuOpen && (
                  <div className="absolute left-0 top-9 z-10 w-56 border border-border bg-surface p-1 shadow-overlay">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-[0.625rem] font-medium uppercase tracking-wide text-muted">
                        Focus decks
                      </span>
                      {focusedDeckIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setFocusedDeckIds(new Set())}
                          className="text-[0.625rem] font-medium text-accent hover:text-accent-deep"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <ul className="max-h-64 overflow-y-auto">
                      {decks.map((deck) => {
                        const active = focusedDeckIds.has(deck.id);
                        return (
                          <li key={deck.id}>
                            <button
                              type="button"
                              onClick={() => toggleDeckFocus(deck.id)}
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                            >
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: deck.color }}
                              />
                              <span className="flex-1 truncate">{deck.name}</span>
                              {active && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>
        <Panel position="top-right">
          <button
            type="button"
            onClick={onTidy}
            className="inline-flex cursor-pointer items-center gap-1.5 border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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

      <GraphContextMenu
        open={connectMenu !== null}
        x={connectMenu?.x ?? 0}
        y={connectMenu?.y ?? 0}
        items={connectMenuItems}
        onClose={() => setConnectMenu(null)}
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
