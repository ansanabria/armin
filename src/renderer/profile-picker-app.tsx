import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Plus, UserRound } from "lucide-react";
import { ProfilePickerShell } from "@/components/profile-picker-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ThemeProvider } from "@/theme/theme-provider";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/window";

type View = "picker" | "create";

async function loadProfiles() {
  return (await window.armin?.profiles?.list()) ?? [];
}

export function ProfilePickerApp() {
  const [view, setView] = useState<View>("picker");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState(false);
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      setLoading(true);
      try {
        const list = await loadProfiles();
        if (!cancelled) setProfiles(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (profiles.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !profiles.some((p) => p.id === selectedId)) {
      setSelectedId(profiles[0].id);
    }
  }, [profiles, selectedId]);

  const openProfile = async (profile: Profile) => {
    if (opening) return;
    setOpening(true);
    try {
      await window.armin?.profiles?.open(profile.id, profile.name);
    } finally {
      setOpening(false);
    }
  };

  const createProfile = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    try {
      const profile = await window.armin.profiles.create(trimmed);
      setProfiles((prev) => [...prev, profile]);
      setName("");
      await openProfile(profile);
    } finally {
      setCreating(false);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (profiles.length === 0) return;

    const index = profiles.findIndex((p) => p.id === selectedId);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = profiles[Math.min(index + 1, profiles.length - 1)];
      if (next) setSelectedId(next.id);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = profiles[Math.max(index - 1, 0)];
      if (prev) setSelectedId(prev.id);
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      void openProfile(selected);
    }
  };

  return (
    <ThemeProvider>
      <ProfilePickerShell>
        {view === "picker" ? (
          <PickerView
            profiles={profiles}
            loading={loading}
            selectedId={selectedId}
            opening={opening}
            listRef={listRef}
            onSelect={setSelectedId}
            onOpen={() => selected && void openProfile(selected)}
            onCreate={() => setView("create")}
            onListKeyDown={handleListKeyDown}
          />
        ) : (
          <CreateView
            name={name}
            creating={creating}
            onNameChange={setName}
            onBack={() => {
              setName("");
              setView("picker");
            }}
            onCreate={createProfile}
          />
        )}
      </ProfilePickerShell>
    </ThemeProvider>
  );
}

function PickerView({
  profiles,
  loading,
  selectedId,
  opening,
  listRef,
  onSelect,
  onOpen,
  onCreate,
  onListKeyDown,
}: {
  profiles: Profile[];
  loading: boolean;
  selectedId: string | null;
  opening: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onOpen: () => void;
  onCreate: () => void;
  onListKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const hasProfiles = profiles.length > 0;

  return (
    <>
      <div className="flex flex-1 flex-col px-6 pb-4 pt-6">
        <div className="mb-6">
          <h1 className="font-serif text-xl font-semibold tracking-tight text-balance text-ink">
            Open profile
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Each profile keeps its own decks, settings, and study progress.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Loading profiles…
          </div>
        ) : hasProfiles ? (
          <div
            ref={listRef}
            role="listbox"
            aria-label="Profiles"
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ul className="divide-y divide-border">
              {profiles.map((profile) => {
                const isSelected = profile.id === selectedId;
                return (
                  <li key={profile.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => onSelect(profile.id)}
                      onDoubleClick={() => void onOpen()}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150",
                        isSelected
                          ? "bg-accent-tint text-ink"
                          : "text-ink hover:bg-surface-sunken",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          isSelected
                            ? "bg-accent text-on-accent"
                            : "bg-bg-2 text-muted",
                        )}
                        aria-hidden
                      >
                        <UserRound className="h-4 w-4" strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {profile.name}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isSelected ? "text-accent-deep" : "text-faint",
                        )}
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={UserRound}
            title="No profiles yet"
            description="Create a profile to keep decks and settings separate for each learner or context."
            action={
              <Button onClick={onCreate}>
                <Plus className="h-4 w-4" />
                Create profile
              </Button>
            }
            className="flex-1 justify-center"
          />
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-2 bg-bg px-6 py-4">
        {hasProfiles ? (
          <>
            <Button
              className="w-full"
              disabled={!selectedId || opening}
              onClick={onOpen}
            >
              {opening ? "Opening…" : "Open profile"}
            </Button>
            <Button variant="outline" className="w-full" onClick={onCreate}>
              <Plus className="h-4 w-4" />
              Create profile
            </Button>
          </>
        ) : null}
      </footer>
    </>
  );
}

function CreateView({
  name,
  creating,
  onNameChange,
  onBack,
  onCreate,
}: {
  name: string;
  creating: boolean;
  onNameChange: (value: string) => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const canCreate = name.trim().length > 0;

  return (
    <form
      className="flex flex-1 flex-col px-6 pb-4 pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canCreate) onCreate();
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="titlebar-no-drag -ml-1 mb-4 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
        Back
      </button>

      <div className="mb-6">
        <h1 className="font-serif text-xl font-semibold tracking-tight text-ink">
          Create profile
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Pick a name you will recognize later, like a course or your own name.
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Profile name
        </span>
        <Input
          data-autofocus
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. Elliot, Justin, Eve..."
          autoFocus
        />
      </label>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Button
          type="submit"
          className="w-full"
          disabled={!canCreate || creating}
        >
          {creating ? "Creating…" : "Create profile"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onBack}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
