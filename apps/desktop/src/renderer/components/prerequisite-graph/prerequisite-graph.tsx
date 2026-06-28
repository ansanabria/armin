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
  ArrowLeft,
  LayoutGrid,
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
import {
  createGraphCycleIndex,
  graphEdgeKey,
  wouldCreateCycleIndexed,
} from "@/lib/graph-cycle";
import {
  EDGE_MARKER_END,
  EDGE_STROKE,
  buildGraphFlowElementsAsync,
  graphNodePreview,
  incidentNodeIdsOf,
  makeFlowEdge,
  refreshNodeData,
  styleEdgeForEmphasis,
  toFlowNode,
} from "@/lib/graph-flow";
import { layoutGraph } from "@/lib/graph-layout";
import type {
  GraphLayoutWorkerRequest,
  GraphLayoutWorkerResponse,
} from "@/lib/graph-layout-worker";
import { cn } from "@/lib/utils";
import { TruncatedLabel } from "@/components/ui/truncated-label";
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
const fitViewOptions = { padding: 0.2, maxZoom: 1 };
const connectionLineStyle = {
  stroke: "var(--color-accent)",
  strokeWidth: 1.5,
};
const defaultEdgeOptions = {
  type: "floating",
  style: { stroke: EDGE_STROKE, strokeWidth: 1.5 },
  markerEnd: EDGE_MARKER_END,
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

// First-open framing when there's no saved viewport. We deliberately do NOT
// fit the whole graph on open: fitting a large Deck brings every node on-screen,
// which (with virtualization) would force all of them to render at once. Landing
// at a normal zoom keeps the first paint to a screenful of cards; the Fit-view
// control frames the whole graph on demand.
const DEFAULT_VIEWPORT: Viewport = { x: 48, y: 48, zoom: 1 };

type NodePlacement = { flashcardId: string; x: number; y: number };

type MenuState = { kind: "node"; x: number; y: number; nodeId: string } | null;
type ConnectMenuState = {
  x: number;
  y: number;
  flow: XYPosition;
  sourceId: string;
} | null;

type PrerequisiteGraphProps = {
  graph: UiDeckGraph;
  deckName?: string;
  onBack?: () => void;
  onGraphChange: (graph: UiDeckGraph) => void;
  onConnectError?: (message: string) => void;
  nodePlacements?: Record<string, XYPosition>;
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

function savedPositionsOf(graph: UiDeckGraph): Map<string, XYPosition> {
  const map = new Map<string, XYPosition>();
  for (const node of graph.nodes) {
    if (node.x != null && node.y != null) {
      map.set(node.id, { x: node.x, y: node.y });
    }
  }
  return map;
}

function markGraphPerf(name: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  performance.mark(`armin:graph:${name}`);
}

function measureGraphPerf(name: string, start: string, end: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  try {
    performance.measure(
      `armin:graph:${name}`,
      `armin:graph:${start}`,
      `armin:graph:${end}`,
    );
  } catch {
    // Marks are best-effort in development.
  }
}

function scheduleGraphWork(work: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(work, { timeout: 500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(work, 0);
  return () => globalThis.clearTimeout(id);
}

function afterCanvasPaint(work: () => void) {
  let done = false;
  let inner = 0;
  const run = () => {
    if (done) return;
    done = true;
    work();
  };
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(run);
  });
  const timeout = window.setTimeout(run, 250);
  return () => {
    done = true;
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    window.clearTimeout(timeout);
  };
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
  deckName,
  onBack,
  onGraphChange,
  onConnectError,
  nodePlacements,
  onCreateCardRequest,
  onEditCardRequest,
  onDeleteCardRequest,
  onPersistLayout,
  initialViewport,
  onViewportChange,
  onReady,
}: PrerequisiteGraphProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const knownNodeIds = useRef(new Set<string>());
  const connectFrom = useRef<string | null>(null);
  // Set once the async builder commits the first real graph; the incremental
  // sync effects below stay dormant until then so they don't fight the build.
  const initialFlowLoaded = useRef(false);
  const backgroundLaidOutIds = useRef(new Set<string>());
  const layoutWorker = useRef<Worker | null>(null);
  const layoutRequestId = useRef(0);
  const cancelReadySignal = useRef<(() => void) | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [interactive, setInteractive] = useState(false);
  // Two-part readiness gate: `flowReady` once the async build commits nodes and
  // edges, `reactFlowReady` once ReactFlow's `onInit` fires. Marking the graph
  // interactive needs both, so we never signal ready on the empty init.
  const [flowReady, setFlowReady] = useState(false);
  const [reactFlowReady, setReactFlowReady] = useState(false);

  // Selection + search lens. The selected card lights up itself, its edges, and
  // its direct neighbors; search dims everything outside its scope.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Start ReactFlow empty: the initial conversion happens off the render path in
  // an abortable, chunked effect (see below) so a large Deck graph can't freeze
  // the renderer while it mounts.
  const [nodes, setNodes, onNodesChange] = useNodesState<CardFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Always-fresh snapshot of node positions for layout persistence.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Keep `onReady` in a ref so the readiness effect doesn't re-run (and cancel a
  // pending ready signal) when the parent passes a fresh callback identity.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(
    () => () => {
      cancelReadySignal.current?.();
      layoutWorker.current?.terminate();
      layoutWorker.current = null;
    },
    [],
  );

  // Convert the persisted graph into ReactFlow elements off the render path, in
  // an abortable chunked task. Runs once for the initial graph; afterwards the
  // incremental sync effects own updates. If the route unmounts (or the graph is
  // replaced) before the build finishes, the controller aborts and the stale
  // result is dropped instead of being committed into an unmounted canvas.
  useEffect(() => {
    if (initialFlowLoaded.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    setFlowReady(false);
    setInteractive(false);
    markGraphPerf("buildFlowElements:start");
    void buildGraphFlowElementsAsync(graph, savedPositionsOf(graph), {
      signal,
    }).then((result) => {
      if (!result || signal.aborted) return;
      markGraphPerf("buildFlowElements:end");
      measureGraphPerf(
        "buildFlowElements",
        "buildFlowElements:start",
        "buildFlowElements:end",
      );
      setNodes(result.nodes);
      setEdges(result.edges);
      knownNodeIds.current = new Set(graph.nodes.map((n) => n.id));
      initialFlowLoaded.current = true;
      setFlowReady(true);
    });
    return () => controller.abort();
  }, [graph, setNodes, setEdges]);

  // Signal ready only after both the async build has committed real nodes/edges
  // and ReactFlow has initialized, then reveal the canvas on the next paint. We
  // don't fit-to-all here: framing is handled by `defaultViewport` so the first
  // paint stays cheap (see DEFAULT_VIEWPORT).
  useEffect(() => {
    if (!flowReady || !reactFlowReady || interactive) return;
    cancelReadySignal.current?.();
    cancelReadySignal.current = afterCanvasPaint(() => {
      cancelReadySignal.current = null;
      markGraphPerf("interactive:end");
      measureGraphPerf("interactive", "routeRender:start", "interactive:end");
      setInteractive(true);
      onReadyRef.current?.();
    });
    return () => {
      cancelReadySignal.current?.();
      cancelReadySignal.current = null;
    };
  }, [flowReady, reactFlowReady, interactive]);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );
  const graphIndex = useMemo(
    () => createGraphCycleIndex(graph.edges),
    [graph.edges],
  );

  // Incrementally add/remove nodes as the underlying deck changes, preserving
  // the positions of cards that are already on the canvas.
  useEffect(() => {
    if (!initialFlowLoaded.current) return;
    const currentIds = new Set(graph.nodes.map((n) => n.id));
    const added = graph.nodes.filter((n) => !knownNodeIds.current.has(n.id));
    const removed = [...knownNodeIds.current].filter(
      (id) => !currentIds.has(id),
    );

    if (removed.length > 0) {
      const removedIds = new Set(removed);
      setNodes((current) => current.filter((n) => !removedIds.has(n.id)));
      setEdges((current) =>
        current.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        ),
      );
    }

    if (added.length > 0) {
      const fallback = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const incidentNodeIds = incidentNodeIdsOf(graph.edges);

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
            incidentNodeIds,
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
    if (!initialFlowLoaded.current) return;
    setEdges((current) => {
      const desiredIds = new Set(
        graph.edges.map((e) => `${e.prereqId}-${e.dependentId}`),
      );
      const currentIds = new Set(current.map((e) => e.id));
      const kept = current.filter((e) => desiredIds.has(e.id));
      const additions = graph.edges
        .filter((e) => !currentIds.has(`${e.prereqId}-${e.dependentId}`))
        .map((e) => makeFlowEdge(e.prereqId, e.dependentId));
      if (additions.length === 0 && kept.length === current.length) {
        return current;
      }
      return [...kept, ...additions];
    });
  }, [graph.edges, setEdges]);

  useEffect(() => {
    if (!initialFlowLoaded.current) return;
    setNodes((current) => {
      let changed = false;
      const updated = current.map((node) => {
        const source = nodeById.get(node.id);
        if (!source) return node;
        const front = graphNodePreview(source.front);
        const back = graphNodePreview(source.back);
        if (
          node.data.front === front &&
          node.data.back === back &&
          node.data.type === source.type &&
          node.data.state === source.state &&
          node.data.locked === source.locked
        ) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: {
            front,
            back,
            type: source.type,
            state: source.state,
            locked: source.locked,
            isIsolated: node.data.isIsolated,
            emphasis: node.data.emphasis,
          },
        };
      });
      const withIsolation = refreshNodeData(
        changed ? updated : current,
        graph.edges,
      );
      return changed || withIsolation !== current ? withIsolation : current;
    });
  }, [graph.edges, nodeById, setNodes]);
  const query = search.trim().toLowerCase();

  useEffect(() => {
    if (!interactive || graph.nodes.length === 0) return;
    const placedIds = new Set(
      graph.nodes
        .filter(
          (node) =>
            (node.x != null && node.y != null) || nodePlacements?.[node.id],
        )
        .map((node) => node.id),
    );
    const unplacedIds = graph.nodes
      .filter(
        (node) =>
          !placedIds.has(node.id) && !backgroundLaidOutIds.current.has(node.id),
      )
      .map((node) => node.id);
    if (unplacedIds.length === 0) return;

    let cancelled = false;
    const cancelScheduled = scheduleGraphWork(() => {
      if (cancelled) return;
      markGraphPerf("backgroundLayout:start");
      const worker =
        layoutWorker.current ??
        new Worker(
          new URL("../../lib/graph-layout.worker.ts", import.meta.url),
          {
            type: "module",
          },
        );
      layoutWorker.current = worker;
      const requestId = ++layoutRequestId.current;
      const request: GraphLayoutWorkerRequest = {
        requestId,
        nodes: nodesRef.current.map((node) => ({
          id: node.id,
          position: node.position,
          placed: placedIds.has(node.id),
        })),
        edges: graph.edges.map((edge) => ({
          source: edge.prereqId,
          target: edge.dependentId,
        })),
      };

      worker.onmessage = (event: MessageEvent<GraphLayoutWorkerResponse>) => {
        if (cancelled || event.data.requestId !== layoutRequestId.current) {
          return;
        }
        const placements = event.data.placements;
        if (placements.length > 0) {
          for (const placement of placements) {
            backgroundLaidOutIds.current.add(placement.flashcardId);
          }
          const placementById = new Map(
            placements.map((placement) => [placement.flashcardId, placement]),
          );
          setNodes((current) =>
            current.map((node) => {
              const placement = placementById.get(node.id);
              return placement
                ? { ...node, position: { x: placement.x, y: placement.y } }
                : node;
            }),
          );
          onPersistLayout?.(placements);
        }
        markGraphPerf("backgroundLayout:end");
        measureGraphPerf(
          "backgroundLayout",
          "backgroundLayout:start",
          "backgroundLayout:end",
        );
      };

      worker.onerror = () => {
        worker.terminate();
        if (layoutWorker.current === worker) layoutWorker.current = null;
      };

      worker.postMessage(request);
    });

    return () => {
      cancelled = true;
      cancelScheduled();
    };
  }, [
    graph.edges,
    graph.nodes,
    interactive,
    nodePlacements,
    onPersistLayout,
    setNodes,
  ]);

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
    const searchMatches = new Map<string, boolean>();
    if (query !== "") {
      for (const node of graph.nodes) {
        searchMatches.set(
          node.id,
          `${node.front} ${node.back}`.toLowerCase().includes(query),
        );
      }
    }

    setNodes((current) => {
      let changed = false;
      const nextNodes = current.map((node) => {
        const source = nodeById.get(node.id);
        if (!source) return node;
        let emphasis: NodeEmphasis;
        if (selectedId) {
          if (source.id === selectedId) emphasis = "active";
          else if (neighborIds.has(source.id)) emphasis = "connected";
          else emphasis = "dimmed";
        } else if (query === "" || searchMatches.get(source.id)) {
          emphasis = null;
        } else {
          emphasis = "dimmed";
        }
        if (node.data.emphasis === emphasis) return node;
        changed = true;
        return { ...node, data: { ...node.data, emphasis } };
      });
      return changed ? nextNodes : current;
    });

    const lensActive = query !== "";
    const inScope = (id: string) => {
      if (!nodeById.has(id)) return false;
      return query === "" || searchMatches.get(id) === true;
    };
    setEdges((current) => {
      let changed = false;
      const nextEdges = current.map((edge) => {
        let next: Edge;
        if (selectedId) {
          next = styleEdgeForEmphasis(
            edge,
            edge.source === selectedId || edge.target === selectedId
              ? "active"
              : "dimmed",
          );
        } else if (lensActive) {
          next = styleEdgeForEmphasis(
            edge,
            inScope(edge.source) && inScope(edge.target) ? null : "dimmed",
          );
        } else {
          next = styleEdgeForEmphasis(edge, null);
        }
        if (next !== edge) changed = true;
        return next;
      });
      return changed ? nextEdges : current;
    });
  }, [
    selectedId,
    query,
    nodeById,
    graph.nodes,
    graph.edges,
    setNodes,
    setEdges,
  ]);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      setSelectedId(selectedNodes.length === 1 ? selectedNodes[0].id : null);
    },
    [],
  );

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
      if (graphIndex.edgeKeys.has(graphEdgeKey(source, target))) {
        return false;
      }
      return !wouldCreateCycleIndexed(graphIndex, source, target);
    },
    [graphIndex],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;

      if (source === target) {
        onConnectError?.("A flashcard can’t depend on itself.");
        return;
      }

      if (graphIndex.edgeKeys.has(graphEdgeKey(source, target))) {
        return;
      }

      if (wouldCreateCycleIndexed(graphIndex, source, target)) {
        onConnectError?.("That link would create a cycle.");
        return;
      }

      const flowEdge = makeFlowEdge(source, target);
      setEdges((current) => addEdge(flowEdge, current));
      syncEdges([...graph.edges, { prereqId: source, dependentId: target }]);
    },
    [graph, graphIndex, onConnectError, setEdges, syncEdges],
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
            onClick: () =>
              onDeleteCardRequest?.(menu.nodeId) ?? deleteNode(menu.nodeId),
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
        className={cn(
          isConnecting && "graph-connecting",
          // Keep the still-loading canvas from capturing pointer events so the
          // surrounding app stays clickable while the graph builds.
          !interactive && "pointer-events-none",
        )}
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
          markGraphPerf("reactFlow:onInit");
          // ReactFlow may init before the async build commits real nodes; the
          // readiness effect waits for both before signalling ready, so we never
          // mark interactive on the empty init.
          setReactFlowReady(true);
        }}
        defaultViewport={initialViewport ?? DEFAULT_VIEWPORT}
        fitViewOptions={fitViewOptions}
        onlyRenderVisibleElements
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
        connectionLineStyle={connectionLineStyle}
        defaultEdgeOptions={defaultEdgeOptions}
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
            {(onBack || deckName) && (
              <button
                type="button"
                onClick={onBack}
                disabled={!onBack}
                aria-label={deckName ? `Back to ${deckName}` : "Back to deck"}
                className="flex h-8 items-center gap-1.5 border border-border bg-surface px-2 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-surface"
              >
                {onBack && (
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted" />
                )}
                {deckName && (
                  <TruncatedLabel
                    label={deckName}
                    side="bottom"
                    className="max-w-44"
                  />
                )}
              </button>
            )}
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
