import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import type { Viewport, XYPosition } from "@xyflow/react";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog";
import { PrerequisiteGraph } from "@/components/prerequisite-graph/prerequisite-graph";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { deckKeys, graphKeys } from "@/lib/armin-query";
import { deckColor } from "@/lib/deck-color";
import { useGraphCanvasEdits } from "@/lib/use-graph-canvas-edits";
import { toUiGlobalGraph, type UiDeckGraph } from "@/types/view-models";
import type {
  FlashcardContent,
  FlashcardDeleteConsequences,
  FlashcardType,
} from "@/types/window";
import { cn } from "@/lib/utils";

const viewportStorageKey = "armin:graph-viewport:global";

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatReviewHistory(consequences: FlashcardDeleteConsequences | null) {
  if (!consequences) return "Loading review history…";
  if (consequences.reviewLogCount === 0) {
    return `No review history will be destroyed across ${plural(consequences.reviewUnitCount, "review unit")}.`;
  }

  const first = consequences.firstReviewAt?.toLocaleDateString();
  const last = consequences.lastReviewAt?.toLocaleDateString();
  const span = first && last ? ` from ${first} to ${last}` : "";
  return `${plural(consequences.reviewLogCount, "review log")} across ${plural(consequences.reviewUnitCount, "review unit")} will be destroyed${span}.`;
}

function readSavedViewport(): Viewport | undefined {
  try {
    const raw = localStorage.getItem(viewportStorageKey);
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

export default function GlobalGraphPage() {
  const { focus } = useSearch({ from: "/graph" });
  const toast = useToast();

  const [initialViewport] = useState<Viewport | undefined>(() =>
    readSavedViewport(),
  );

  const persistViewport = (viewport: Viewport) => {
    try {
      localStorage.setItem(viewportStorageKey, JSON.stringify(viewport));
    } catch {
      // Ignore storage write failures (e.g. private mode quota).
    }
  };

  const decksQuery = useQuery({
    queryKey: deckKeys.all,
    queryFn: () => window.armin.decks.list(),
  });
  const graphQuery = useQuery({
    queryKey: graphKeys.global,
    queryFn: () => window.armin.graph.getGlobal(),
  });

  const decks = useMemo(() => decksQuery.data ?? [], [decksQuery.data]);
  const persistedGraph = useMemo(
    () =>
      graphQuery.data ? toUiGlobalGraph(graphQuery.data, decks) : null,
    [graphQuery.data, decks],
  );
  const deckLensOptions = useMemo(
    () =>
      decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        color: deckColor(deck.id),
      })),
    [decks],
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
  const [createDeckId, setCreateDeckId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConsequences, setDeleteConsequences] =
    useState<FlashcardDeleteConsequences | null>(null);
  const [deleteConsequencesError, setDeleteConsequencesError] = useState(false);

  const [graphReady, setGraphReady] = useState(false);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (persistedGraph) {
      setGraph(persistedGraph);
      setGraphReady(true);
    }
  }, [persistedGraph]);

  // Default the deck picker to the first deck once decks load.
  useEffect(() => {
    if (createDeckId === null && decks.length > 0) {
      setCreateDeckId(decks[0].id);
    }
  }, [createDeckId, decks]);

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
    // Fetch the full flashcard content before opening: the form hydrates on the
    // open transition, and graph nodes only carry display strings.
    const card = await window.armin.flashcards.get(nodeId);
    setEditingType(card?.type ?? node.type);
    setEditingContent(card?.content ?? null);
    setOpen(true);
  };

  const openDelete = (nodeId: string) => {
    setDeleteId(nodeId);
    setDeleteConsequences(null);
    setDeleteConsequencesError(false);
    void window.armin.flashcards
      .deleteConsequences(nodeId)
      .then((summary) => setDeleteConsequences(summary))
      .catch(() => setDeleteConsequencesError(true));
  };

  // Adding from a drag inherits the source card's deck; a blank-canvas add uses
  // the deck chosen in the dialog.
  const inheritedDeckId = pendingConnectFrom
    ? (graph.nodes.find((n) => n.id === pendingConnectFrom)?.deckId ?? null)
    : null;

  const graphEdits = useGraphCanvasEdits({
    graph,
    setGraph,
    createDeckId,
    inheritedDeckId,
    pendingPlacement,
    pendingConnectFrom,
    editingId,
    closeDialog,
    refetchGraph: () => void graphQuery.refetch(),
    toast,
  });

  const confirmGraphDelete = async () => {
    if (await graphEdits.confirmGraphDelete(deleteId)) {
      setDeleteId(null);
    }
  };

  return (
    <div data-fullbleed className="relative h-full w-full">
      {!graphQuery.isError && (
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
      {graphQuery.isError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg">
          <div className="pointer-events-auto flex flex-col items-center border border-border bg-bg-2 px-6 py-5 text-center shadow-overlay">
            <p className="text-sm font-medium text-ink">Couldn’t load graph</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void graphQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
      {canvasMounted && !graphQuery.isError && graph.nodes.length === 0 ? (
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
                Add your first card
              </Button>
            }
          />
        </div>
      ) : null}
      {canvasMounted && (
        <PrerequisiteGraph
          graph={graph}
          onGraphChange={graphEdits.applyGraphChange}
          nodePlacements={graphEdits.nodePlacements}
          decks={deckLensOptions}
          focusDeckId={focus ?? null}
          onCreateCardRequest={openCreate}
          onEditCardRequest={openEdit}
          onDeleteCardRequest={openDelete}
          onPersistLayout={graphEdits.saveLayout}
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
        onSubmit={graphEdits.saveCard}
        decks={inheritedDeckId ? undefined : decks}
        deckId={createDeckId}
        onDeckChange={setCreateDeckId}
      />
      <Dialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Delete flashcard?"
        description="This flashcard will be permanently hard-deleted."
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            Archive from the deck or browse view if you want a reversible way to
            set this aside. Delete removes the flashcard, its review units, and
            its review history permanently.
          </p>
          <ul className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
            <li>
              {deleteConsequencesError
                ? "Dependent count could not be loaded."
                : deleteConsequences
                  ? `${plural(deleteConsequences.dependentCount, "dependent")} will be unlocked or recomputed.`
                  : "Loading dependent count…"}
            </li>
            <li>
              {deleteConsequencesError
                ? "Review history could not be loaded."
                : formatReviewHistory(deleteConsequences)}
            </li>
          </ul>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={graphEdits.deletePending || !deleteConsequences}
            onClick={() => void confirmGraphDelete()}
          >
            Delete flashcard
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
