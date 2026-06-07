import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, GitBranch, Plus } from "lucide-react";
import type { XYPosition } from "@xyflow/react";
import { CardFormDialog } from "@/components/card-form-dialog";
import { PrerequisiteGraph } from "@/components/prerequisite-graph/prerequisite-graph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { getDeck, getDeckGraph, type UiDeckGraph } from "@/data/fixtures";

export default function DeckGraphPage() {
  const { deckId } = useParams({ from: "/deck/$deckId/graph" });
  const deck = getDeck(deckId);
  const toast = useToast();

  const [graph, setGraph] = useState<UiDeckGraph>(() => getDeckGraph(deckId));
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

  const closeDialog = () => {
    setOpen(false);
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

  const saveCard = ({ front, back }: { front: string; back: string }) => {
    if (editingId) {
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((n) =>
          n.id === editingId ? { ...n, front, back } : n,
        ),
      }));
      toast({ tone: "success", title: "Card updated" });
    } else {
      const id = `new-${crypto.randomUUID().slice(0, 8)}`;
      if (pendingPlacement) {
        setNodePlacements((current) => ({
          ...current,
          [id]: pendingPlacement,
        }));
      }
      setGraph((current) => ({
        ...current,
        nodes: [
          ...current.nodes,
          {
            id,
            front,
            back,
            state: 0,
            locked: false,
          },
        ],
      }));
      toast({ tone: "success", title: "Card added to graph" });
    }

    closeDialog();
  };

  if (!deck) {
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
      {graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg/80">
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
        <ArrowLeft className="h-3.5 w-3.5" /> {deck.name}
      </Link>
      <PrerequisiteGraph
        graph={graph}
        onGraphChange={setGraph}
        nodePlacements={nodePlacements}
        onCreateCardRequest={openCreate}
        onEditCardRequest={openEdit}
        onConnectError={(message) => toast({ tone: "error", title: message })}
      />

      <CardFormDialog
        open={open}
        onClose={closeDialog}
        mode={editingId ? "edit" : "create"}
        cardId={editingId}
        initialFront={editingNode?.front ?? ""}
        initialBack={editingNode?.back ?? ""}
        onSubmit={saveCard}
      />
    </div>
  );
}
