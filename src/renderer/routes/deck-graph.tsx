import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, GitBranch, Plus } from "lucide-react";
import type { Viewport, XYPosition } from "@xyflow/react";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog";
import { PrerequisiteGraph } from "@/components/prerequisite-graph/prerequisite-graph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deckKeys, graphKeys, invalidateCoreData } from "@/lib/armin-query";
import { toUiDeckGraph, type UiDeckGraph } from "@/types/view-models";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import type { FlashcardContent, FlashcardType } from "@/types/window";
import { cn } from "@/lib/utils";

const viewportStorageKey = (deckId: string) => `armin:graph-viewport:${deckId}`;

function readSavedViewport(deckId: string): Viewport | undefined {
  try {
    const raw = localStorage.getItem(viewportStorageKey(deckId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.zoom === "number"
    ) {
      return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
    }
  } catch {
    // Ignore malformed or unavailable storage.
  }
  return undefined;
}

export default function DeckGraphPage() {
  const { deckId } = useParams({ from: "/deck/$deckId/graph" });
  const queryClient = useQueryClient();
  const toast = useToast();

  const [initialViewport] = useState<Viewport | undefined>(() =>
    readSavedViewport(deckId),
  );

  const persistViewport = (viewport: Viewport) => {
    try {
      localStorage.setItem(
        viewportStorageKey(deckId),
        JSON.stringify(viewport),
      );
    } catch {
      // Ignore storage write failures (e.g. private mode quota).
    }
  };

  const deckQuery = useQuery({
    queryKey: deckKeys.detail(deckId),
    queryFn: () => window.armin.decks.get(deckId),
  });
  const graphQuery = useQuery({
    queryKey: graphKeys.deck(deckId),
    queryFn: () => window.armin.graph.get(deckId),
  });
  const persistedGraph = useMemo(
    () => (graphQuery.data ? toUiDeckGraph(graphQuery.data) : null),
    [graphQuery.data],
  );

  const [graph, setGraph] = useState<UiDeckGraph>({ nodes: [], edges: [] });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<FlashcardType>("basic");
  const [editingContent, setEditingContent] = useState<FlashcardContent | null>(
    null,
  );
  const [pendingPlacement, setPendingPlacement] = useState<XYPosition | null>(
    null,
  );
  const [pendingConnectFrom, setPendingConnectFrom] = useState<string | null>(
    null,
  );
  const [nodePlacements, setNodePlacements] = useState<
    Record<string, XYPosition>
  >({});

  const [graphReady, setGraphReady] = useState(false);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (persistedGraph) {
      setGraph(persistedGraph);
      setGraphReady(true);
    }
  }, [persistedGraph]);

  // Once the data is in, let the loading screen paint a frame before mounting
  // the canvas. Building the graph (dagre layout + ReactFlow + every node) is a
  // heavy synchronous burst that blocks the main thread, so deferring it keeps
  // the loading state on screen the whole time instead of freezing the prior
  // page.
  useEffect(() => {
    if (!graphReady || canvasMounted) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setCanvasMounted(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [graphReady, canvasMounted]);

  const closeDialog = () => setOpen(false);

  const handleDialogExitComplete = () => {
    setEditingId(null);
    setPendingPlacement(null);
    setPendingConnectFrom(null);
  };

  const openCreate = (placement?: XYPosition, connectFromNodeId?: string) => {
    setEditingId(null);
    setPendingPlacement(placement ?? null);
    setPendingConnectFrom(connectFromNodeId ?? null);
    setOpen(true);
  };

  const openEdit = async (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setEditingId(nodeId);
    setPendingPlacement(null);
    setPendingConnectFrom(null);
    // Fetch the full note content before opening: the form hydrates on the
    // open transition, and graph nodes only carry display strings.
    const note = await window.armin.flashcards.get(nodeId);
    setEditingType(note?.type ?? node.type);
    setEditingContent(note?.content ?? null);
    setOpen(true);
  };

  const createCard = useMutation({
    mutationFn: (values: CardFormValues) =>
      window.armin.flashcards.create({ deckId, ...values }),
    onSuccess: (card) => {
      if (pendingPlacement) {
        setNodePlacements((current) => ({
          ...current,
          [card.id]: pendingPlacement,
        }));
        void window.armin.graph.saveLayout(deckId, [
          { flashcardId: card.id, x: pendingPlacement.x, y: pendingPlacement.y },
        ]);
      }
      if (pendingConnectFrom) {
        addPrereq.mutate({
          prereqId: pendingConnectFrom,
          dependentId: card.id,
        });
      }
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Flashcard added to graph" });
      closeDialog();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t add flashcard" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string }) =>
      window.armin.flashcards.update(values),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Flashcard updated" });
      closeDialog();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t update flashcard" }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => window.armin.flashcards.delete(id),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "error", title: "Flashcard deleted" });
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t delete flashcard" });
      void graphQuery.refetch();
    },
  });

  const addPrereq = useMutation({
    mutationFn: (edge: { prereqId: string; dependentId: string }) =>
      window.armin.graph.addPrereq(edge.prereqId, edge.dependentId),
    onSuccess: () => invalidateCoreData(queryClient, deckId),
    onError: () => {
      toast({ tone: "error", title: "Couldn’t link flashcards" });
      void graphQuery.refetch();
    },
  });

  const removePrereq = useMutation({
    mutationFn: (edge: { prereqId: string; dependentId: string }) =>
      window.armin.graph.removePrereq(edge.prereqId, edge.dependentId),
    onSuccess: () => invalidateCoreData(queryClient, deckId),
    onError: () => {
      toast({ tone: "error", title: "Couldn’t remove link" });
      void graphQuery.refetch();
    },
  });

  const saveLayout = useMutation({
    mutationFn: (placements: { flashcardId: string; x: number; y: number }[]) =>
      window.armin.graph.saveLayout(deckId, placements),
    onError: () => toast({ tone: "error", title: "Couldn’t save layout" }),
  });

  const saveCard = async (values: CardFormValues) => {
    if (editingId) {
      await updateCard.mutateAsync({ id: editingId, ...values });
    } else {
      await createCard.mutateAsync(values);
    }
  };

  const handleGraphChange = (next: UiDeckGraph) => {
    const previous = graph;
    setGraph(next);

    const previousNodeIds = new Set(previous.nodes.map((node) => node.id));
    const nextNodeIds = new Set(next.nodes.map((node) => node.id));
    for (const nodeId of previousNodeIds) {
      if (!nextNodeIds.has(nodeId)) deleteCard.mutate(nodeId);
    }

    const edgeKey = (edge: UiDeckGraph["edges"][number]) =>
      `${edge.prereqId}->${edge.dependentId}`;
    const previousEdges = new Set(previous.edges.map(edgeKey));
    const nextEdges = new Set(next.edges.map(edgeKey));

    for (const edge of next.edges) {
      if (!previousEdges.has(edgeKey(edge))) addPrereq.mutate(edge);
    }
    for (const edge of previous.edges) {
      if (!nextEdges.has(edgeKey(edge))) removePrereq.mutate(edge);
    }
  };

  if (!deckQuery.isLoading && !deckQuery.isError && !deckQuery.data) {
    return (
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="h-4 w-4" /> All decks
        </Link>
        <EmptyState
          className="mt-8"
          icon={GitBranch}
          title="Deck not found"
          description="This deck doesn't exist in your library."
          action={
            <Link to="/">
              <Button variant="outline">Back to decks</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div data-fullbleed className="relative h-full w-full">
      {!deckQuery.isError && !graphQuery.isError && (
        <div
          aria-hidden={canvasReady}
          className={cn(
            "pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-bg transition-opacity duration-200",
            canvasReady ? "opacity-0" : "opacity-100",
          )}
        >
          <p className="text-sm text-muted">Loading graph…</p>
        </div>
      )}
      {(deckQuery.isError || graphQuery.isError) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg">
          <div className="pointer-events-auto flex flex-col items-center border border-border bg-bg-2 px-6 py-5 text-center shadow-overlay">
            <p className="text-sm font-medium text-ink">Couldn’t load graph</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                void deckQuery.refetch();
                void graphQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
      {canvasMounted &&
      !deckQuery.isError &&
      !graphQuery.isError &&
      graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg">
          <EmptyState
            icon={GitBranch}
            title="No flashcards yet"
            description="Double-click the canvas to add your first card."
            action={
              <Button
                className="pointer-events-auto"
                onClick={() => openCreate()}
              >
                <Plus className="h-4 w-4" /> Add your first card
              </Button>
            }
          />
        </div>
      ) : null}
      <Link
        to="/deck/$deckId"
        params={{ deckId }}
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {deckQuery.data?.name ?? "Deck"}
      </Link>
      {canvasMounted && (
        <PrerequisiteGraph
          graph={graph}
          onGraphChange={handleGraphChange}
          nodePlacements={nodePlacements}
          onCreateCardRequest={openCreate}
          onEditCardRequest={openEdit}
          onPersistLayout={(placements) => saveLayout.mutate(placements)}
          initialViewport={initialViewport}
          onViewportChange={persistViewport}
          onReady={() => setCanvasReady(true)}
          onConnectError={(message) => toast({ tone: "error", title: message })}
        />
      )}

      <FlashcardFormDialog
        open={open}
        onClose={closeDialog}
        onExitComplete={handleDialogExitComplete}
        mode={editingId ? "edit" : "create"}
        reviewUnitId={editingId}
        initialType={editingId ? editingType : "basic"}
        initialContent={editingId ? editingContent : null}
        onSubmit={saveCard}
      />
    </div>
  );
}
