import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { XYPosition } from "@xyflow/react";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { invalidateCoreData } from "@/lib/armin-query";
import type { UiDeckGraph } from "@/types/view-models";

type Toast = (input: {
  title: string;
  description?: string;
  tone?: "default" | "success" | "error";
}) => void;

type GraphEdge = UiDeckGraph["edges"][number];
type GraphLayoutPlacement = { flashcardId: string; x: number; y: number };

type UseGraphCanvasEditsInput = {
  graph: UiDeckGraph;
  setGraph: Dispatch<SetStateAction<UiDeckGraph>>;
  deckId: string;
  createDeckId: string | null;
  inheritedDeckId: string | null;
  pendingPlacement: XYPosition | null;
  pendingConnectFrom: string | null;
  editingId: string | null;
  closeDialog: () => void;
  refetchGraph: () => void;
  toast: Toast;
};

function edgeKey(edge: GraphEdge) {
  return `${edge.prereqId}->${edge.dependentId}`;
}

export function useGraphCanvasEdits({
  graph,
  setGraph,
  deckId,
  createDeckId,
  inheritedDeckId,
  pendingPlacement,
  pendingConnectFrom,
  editingId,
  closeDialog,
  refetchGraph,
  toast,
}: UseGraphCanvasEditsInput) {
  const queryClient = useQueryClient();
  const [nodePlacements, setNodePlacements] = useState<
    Record<string, XYPosition>
  >({});

  const addPrereq = useMutation({
    mutationFn: (edge: GraphEdge) =>
      window.armin.graph.addPrereq(edge.prereqId, edge.dependentId),
    onSuccess: () => invalidateCoreData(queryClient),
    onError: () => {
      toast({ tone: "error", title: "Couldn’t link flashcards" });
      refetchGraph();
    },
  });

  const removePrereq = useMutation({
    mutationFn: (edge: GraphEdge) =>
      window.armin.graph.removePrereq(edge.prereqId, edge.dependentId),
    onSuccess: () => invalidateCoreData(queryClient),
    onError: () => {
      toast({ tone: "error", title: "Couldn’t remove link" });
      refetchGraph();
    },
  });

  const saveLayout = useMutation({
    mutationFn: (placements: GraphLayoutPlacement[]) =>
      window.armin.graph.saveLayout(deckId, placements),
    onError: () => toast({ tone: "error", title: "Couldn’t save layout" }),
  });

  const createCard = useMutation({
    mutationFn: (values: CardFormValues) => {
      const deckId = inheritedDeckId ?? createDeckId;
      if (!deckId) {
        return Promise.reject(new Error("Pick a deck for this card."));
      }
      return window.armin.flashcards.create({ deckId, ...values });
    },
    onSuccess: (card) => {
      if (pendingPlacement) {
        setNodePlacements((current) => ({
          ...current,
          [card.id]: pendingPlacement,
        }));
        saveLayout.mutate([
          {
            flashcardId: card.id,
            x: pendingPlacement.x,
            y: pendingPlacement.y,
          },
        ]);
      }
      if (pendingConnectFrom) {
        addPrereq.mutate({
          prereqId: pendingConnectFrom,
          dependentId: card.id,
        });
      }
      invalidateCoreData(queryClient, card.deckId);
      toast({ tone: "success", title: "Flashcard added to graph" });
      closeDialog();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t add flashcard" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string }) =>
      window.armin.flashcards.update(values),
    onSuccess: (card) => {
      invalidateCoreData(queryClient, card?.deckId);
      toast({ tone: "success", title: "Flashcard updated" });
      closeDialog();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t update flashcard" }),
  });

  const deleteCard = useMutation({
    mutationFn: ({ id }: { id: string; deckId?: string }) =>
      window.armin.flashcards.delete(id),
    onSuccess: (_result, { deckId }) => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "error", title: "Flashcard deleted" });
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t delete flashcard" });
      refetchGraph();
    },
  });

  const saveCard = async (values: CardFormValues) => {
    if (editingId) {
      await updateCard.mutateAsync({ id: editingId, ...values });
    } else {
      await createCard.mutateAsync(values);
    }
  };

  const applyGraphChange = (next: UiDeckGraph) => {
    const previous = graph;
    setGraph(next);

    const previousNodeById = new Map(
      previous.nodes.map((node) => [node.id, node]),
    );
    const previousNodeIds = new Set(previous.nodes.map((node) => node.id));
    const nextNodeIds = new Set(next.nodes.map((node) => node.id));
    for (const nodeId of previousNodeIds) {
      if (!nextNodeIds.has(nodeId)) {
        const deckId = previousNodeById.get(nodeId)?.deckId;
        deleteCard.mutate({ id: nodeId, deckId });
      }
    }

    const previousEdges = new Set(previous.edges.map(edgeKey));
    const nextEdges = new Set(next.edges.map(edgeKey));

    for (const edge of next.edges) {
      if (!previousEdges.has(edgeKey(edge))) addPrereq.mutate(edge);
    }
    for (const edge of previous.edges) {
      if (!nextEdges.has(edgeKey(edge))) removePrereq.mutate(edge);
    }
  };

  const confirmGraphDelete = async (deleteId: string | null) => {
    if (!deleteId) return false;
    const deckId = graph.nodes.find((node) => node.id === deleteId)?.deckId;
    await deleteCard.mutateAsync({ id: deleteId, deckId });
    setGraph((current) => ({
      nodes: current.nodes.filter((node) => node.id !== deleteId),
      edges: current.edges.filter(
        (edge) => edge.prereqId !== deleteId && edge.dependentId !== deleteId,
      ),
    }));
    return true;
  };

  const persistLayout = (placements: GraphLayoutPlacement[]) => {
    saveLayout.mutate(placements);
  };

  return {
    nodePlacements,
    saveCard,
    applyGraphChange,
    confirmGraphDelete,
    saveLayout: persistLayout,
    deletePending: deleteCard.isPending,
  };
}
