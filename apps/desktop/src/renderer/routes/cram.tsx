import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Dumbbell, Layers, Share2, Shuffle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { CramSession, type CramMode } from "@/components/cram-session";
import { cramKeys, deckKeys, flashcardKeys } from "@/lib/armin-query";
import { withViewTransition } from "@/lib/view-transition";
import { toUiReviewUnit } from "@/types/view-models";
import type { CramCombine } from "../../main/services/cram";
import { cn } from "@/lib/utils";

type StartedScope = {
  deckIds: string[];
  tags: string[];
  combine: CramCombine;
  mode: CramMode;
};

const MODES: {
  value: CramMode;
  label: string;
  icon: typeof Shuffle;
  description: string;
}[] = [
  {
    value: "free",
    label: "Free drill",
    icon: Shuffle,
    description:
      "Shuffle every card in scope, ignoring prerequisites. Missed cards come back until you clear them.",
  },
  {
    value: "graph",
    label: "Graph-follow",
    icon: Share2,
    description:
      "Start from cards whose prerequisites are met within the scope; clearing a card unlocks its dependents as you go.",
  },
];

function scopeSummary(
  deckCount: number,
  tagCount: number,
  combine: CramCombine,
): string {
  const deckPart = deckCount === 0 ? null : `${deckCount} deck${deckCount === 1 ? "" : "s"}`;
  const tagPart =
    tagCount === 0 ? null : `${tagCount} tag${tagCount === 1 ? "" : "s"}`;
  if (!deckPart && !tagPart) return "Your whole library, minus archived cards.";
  if (deckPart && tagPart) {
    return combine === "union"
      ? `Cards in ${deckPart} or carrying ${tagPart}.`
      : `Cards in ${deckPart} that also carry ${tagPart}.`;
  }
  if (deckPart) return `Cards in ${deckPart}.`;
  return `Cards carrying ${tagPart}.`;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted hover:border-ui-3 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent/10 px-1.5 text-xs font-medium tabular-nums text-accent">
      {count}
    </span>
  );
}

function SectionLabel({
  icon: Icon,
  children,
  count,
  hint,
}: {
  icon: typeof Layers;
  children: React.ReactNode;
  count: number;
  hint: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
      <Icon className="h-4 w-4 text-muted" />
      {children}
      {count > 0 ? (
        <CountBadge count={count} />
      ) : (
        <span className="font-normal text-muted">{hint}</span>
      )}
    </div>
  );
}

export default function CramPage() {
  const decksQuery = useQuery({
    queryKey: deckKeys.all,
    queryFn: () => window.armin.decks.list(),
  });
  const tagsQuery = useQuery({
    queryKey: flashcardKeys.tags,
    queryFn: () => window.armin.flashcards.listTags(),
  });

  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [combine, setCombine] = useState<CramCombine>("intersection");
  const [mode, setMode] = useState<CramMode>("free");
  const [scope, setScope] = useState<StartedScope | null>(null);

  const poolQuery = useQuery({
    queryKey: cramKeys.pool(scope),
    queryFn: () =>
      window.armin.cram.pool({
        deckIds: scope!.deckIds,
        tags: scope!.tags,
        combine: scope!.combine,
      }),
    enabled: scope !== null,
    refetchOnWindowFocus: false,
  });

  const units = useMemo(
    () => (poolQuery.data?.units ?? []).map(toUiReviewUnit),
    [poolQuery.data],
  );

  const toggle = (list: string[], value: string) =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];

  if (scope) {
    const decks = decksQuery.data ?? [];
    const deckLabel =
      scope.deckIds.length === 0
        ? "all decks"
        : scope.deckIds
            .map((id) => decks.find((d) => d.id === id)?.name ?? "deck")
            .join(", ");
    const tagLabel =
      scope.tags.length === 0 ? "any tag" : scope.tags.join(", ");
    const joiner =
      scope.deckIds.length > 0 && scope.tags.length > 0
        ? scope.combine === "union"
          ? " or "
          : " and "
        : " · ";

    return (
      <CramSession
        resetKey={JSON.stringify(scope)}
        units={units}
        groups={poolQuery.data?.flashcards ?? []}
        edges={poolQuery.data?.edges ?? []}
        mode={scope.mode}
        isLoading={poolQuery.isLoading}
        isError={poolQuery.isError}
        onRetry={() => void poolQuery.refetch()}
        header={
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
            Cram
          </h1>
        }
        subtitle={
          <>
            {scope.mode === "graph" ? "Graph-follow" : "Free drill"} ·{" "}
            {deckLabel}
            {joiner}
            {tagLabel}
          </>
        }
        doneAction={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => withViewTransition(() => setScope(null))}
            >
              Change scope
            </Button>
            <Link to="/">
              <Button variant="ghost">Back to decks</Button>
            </Link>
          </div>
        }
      />
    );
  }

  const decks = decksQuery.data ?? [];
  const tags = tagsQuery.data ?? [];
  const showCombine = selectedDeckIds.length > 0 && selectedTags.length > 0;
  const hasSelection = selectedDeckIds.length > 0 || selectedTags.length > 0;
  const summary = scopeSummary(
    selectedDeckIds.length,
    selectedTags.length,
    combine,
  );

  const clearSelection = () => {
    setSelectedDeckIds([]);
    setSelectedTags([]);
  };

  const start = () =>
    withViewTransition(() =>
      setScope({
        deckIds: selectedDeckIds,
        tags: selectedTags,
        combine,
        mode,
      }),
    );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
        Cram
      </h1>
      <p className="mt-1.5 max-w-[60ch] text-sm text-muted">
        Drill cards to reinforce a topic, outside the normal review schedule.
        Nothing here changes your FSRS scheduling.
      </p>

      <div className="mt-7 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="space-y-7 p-6 sm:p-7">
          <section>
            <SectionLabel icon={Layers} count={selectedDeckIds.length} hint="(none = all decks)">
              Decks
            </SectionLabel>
            {decksQuery.isLoading ? (
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-28 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
            ) : decks.length === 0 ? (
              <p className="text-sm text-muted">No decks yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {decks.map((deck) => (
                  <Chip
                    key={deck.id}
                    active={selectedDeckIds.includes(deck.id)}
                    onClick={() =>
                      setSelectedDeckIds((prev) => toggle(prev, deck.id))
                    }
                  >
                    {deck.name}
                  </Chip>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionLabel icon={Tag} count={selectedTags.length} hint="(none = any tag)">
              Tags
            </SectionLabel>
            {tagsQuery.isLoading ? (
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted">No tags yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    active={selectedTags.includes(tag)}
                    onClick={() => setSelectedTags((prev) => toggle(prev, tag))}
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            )}
          </section>

          {showCombine && (
            <section>
              <div className="mb-3 text-sm font-medium text-ink">
                Combine decks &amp; tags
              </div>
              <Segmented
                value={combine}
                onChange={setCombine}
                options={[
                  { value: "intersection", label: "Match all" },
                  { value: "union", label: "Match any" },
                ]}
              />
              <p className="mt-2 text-sm text-muted">
                {combine === "intersection"
                  ? "Only cards that are in a selected deck and carry a selected tag."
                  : "Any card that is in a selected deck or carries a selected tag."}
              </p>
            </section>
          )}

          <section>
            <div className="mb-3 text-sm font-medium text-ink">Mode</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODES.map((option) => {
                const active = mode === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "border-accent bg-accent/5 ring-1 ring-accent"
                        : "border-border hover:border-ui-3 hover:bg-surface-sunken",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-2 text-sm font-medium",
                        active ? "text-accent" : "text-ink",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </div>
                    <p className="mt-1.5 text-sm text-muted">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border bg-surface-sunken/40 px-6 py-4 sm:px-7">
          <p className="min-w-0 text-sm text-muted">{summary}</p>
          <div className="flex items-center gap-2">
            {hasSelection && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            )}
            <Button size="lg" onClick={start}>
              <Dumbbell className="h-4 w-4" />
              Start cram
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
