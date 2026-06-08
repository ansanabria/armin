import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, GitBranch, Plus } from "lucide-react";
import type { XYPosition } from "@xyflow/react";
import { CardFormDialog } from "@/components/card-form-dialog";
import { PrerequisiteGraph } from "@/components/prerequisite-graph/prerequisite-graph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  deckKeys,
  graphKeys,
  invalidateCoreData,
} from "@/lib/armin-query";
import { toUiDeckGraph, type UiDeckGraph } from "@/types/view-models";
import type { CardFormValues } from "@/components/card-form-dialog";

export default function DeckGraphPage() {
  const { deckId } = useParams({ from: "/deck/$deckId/graph" });
  const queryClient = useQueryClient();
  const toast = useToast();

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
  const [pendingPlacement, setPendingPlacement] = useState<XYPosition | null>(
    null,
  );
  const [nodePlacements, setNodePlacements] = useState<
    Record<string, XYPosition>
  >({});

  const editingNode = editingId
    ? graph.nodes.find((n) => n.id === editingId)
    : null;

  useEffect(() => {
    if (persistedGraph) setGraph(persistedGraph);
  }, [persistedGraph]);

  const closeDialog = () => setOpen(false);

  const handleDialogExitComplete = () => {
    setEditingId(null);
    setPendingPlacement(null);
  };

  const openCreate = (placement?: XYPosition) => {
    setEditingId(null);
    setPendingPlacement(placement ?? null);
    setOpen(true);
  };

  const openEdit = (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setEditingId(nodeId);
    setPendingPlacement(null);
    setOpen(true);
  };

  const createCard = useMutation({
    mutationFn: (values: CardFormValues) =>
      window.armin.cards.create({ deckId, ...values }),
    onSuccess: (card) => {
      if (pendingPlacement) {
        setNodePlacements((current) => ({
          ...current,
          [card.id]: pendingPlacement,
        }));
      }
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Card added to graph" });
    },
    onError: () => toast({ tone: "error", title: "Couldn’t add card" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string }) =>
      window.armin.cards.update(values),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Card updated" });
      closeDialog();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t update card" }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => window.armin.cards.delete(id),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "error", title: "Card deleted" });
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t delete card" });
      void graphQuery.refetch();
    },
  });

  const addPrereq = useMutation({
    mutationFn: (edge: { prereqId: string; dependentId: string }) =>
      window.armin.graph.addPrereq(edge.prereqId, edge.dependentId),
    onSuccess: () => invalidateCoreData(queryClient, deckId),
    onError: () => {
      toast({ tone: "error", title: "Couldn’t link cards" });
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

  const saveCard = async ({ front, back, tags }: CardFormValues) => {
    if (editingId) {
      await updateCard.mutateAsync({ id: editingId, front, back, tags });
    } else {
      await createCard.mutateAsync({ front, back, tags });
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
      {(deckQuery.isLoading || graphQuery.isLoading) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg">
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
      {!deckQuery.isLoading &&
      !graphQuery.isLoading &&
      !deckQuery.isError &&
      !graphQuery.isError &&
      graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg">
          <EmptyState
            icon={GitBranch}
            title="No cards yet"
            description="Double-click the canvas to add your first card."
            action={
              <Button className="pointer-events-auto" onClick={() => openCreate()}>
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
      <PrerequisiteGraph
        graph={graph}
        onGraphChange={handleGraphChange}
        nodePlacements={nodePlacements}
        onCreateCardRequest={openCreate}
        onEditCardRequest={openEdit}
        onConnectError={(message) => toast({ tone: "error", title: message })}
      />

      <CardFormDialog
        open={open}
        onClose={closeDialog}
        onExitComplete={handleDialogExitComplete}
        mode={editingId ? "edit" : "create"}
        cardId={editingId}
        initialFront={editingNode?.front ?? ""}
        initialBack={editingNode?.back ?? ""}
        onSubmit={saveCard}
      />
    </div>
  );
}
