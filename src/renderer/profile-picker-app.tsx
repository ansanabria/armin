import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Star,
  StarOff,
  Trash2,
  UserRound,
} from "lucide-react";
import { ProfilePickerShell } from "@/components/profile-picker-shell";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ThemeProvider } from "@/theme/theme-provider";
import { useMenuCloseAction } from "@/lib/menu-close-action";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/window";

type View = "picker" | "create";

async function loadProfileData() {
  const [profiles, defaultId] = await Promise.all([
    window.armin?.profiles?.list() ?? [],
    window.armin?.profiles?.getDefault() ?? null,
  ]);
  return { profiles, defaultId };
}

export function ProfilePickerApp() {
  const [view, setView] = useState<View>("picker");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const openingRef = useRef(false);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const refresh = async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const data = await loadProfileData();
      setProfiles(data.profiles);
      setDefaultId(data.defaultId);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const runRefresh = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const data = await loadProfileData();
        if (!cancelled) {
          setProfiles(data.profiles);
          setDefaultId(data.defaultId);
        }
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    void runRefresh(true);
    const onFocus = () => void runRefresh(false);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
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
    if (openingRef.current) return;
    openingRef.current = true;
    try {
      await window.armin?.profiles?.open(profile.id, profile.name);
    } finally {
      openingRef.current = false;
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

  const setDefaultProfile = async (id: string) => {
    await window.armin.profiles.setDefault(id);
    setDefaultId(id);
  };

  const clearDefaultProfile = async () => {
    await window.armin.profiles.clearDefault();
    setDefaultId(null);
  };

  const requestDelete = (profile: Profile) => {
    setDeletingProfile(profile);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleDeleteDialogExit = () => {
    setDeletingProfile(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deletingProfile || deleting) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await window.armin.profiles.delete(deletingProfile.id);
      setDeleteOpen(false);
      await refresh(false);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Couldn't delete profile",
      );
    } finally {
      setDeleting(false);
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
            defaultId={defaultId}
            loading={loading}
            selectedId={selectedId}
            listRef={listRef}
            onSelect={setSelectedId}
            onOpen={() => selected && void openProfile(selected)}
            onCreate={() => setView("create")}
            onListKeyDown={handleListKeyDown}
            onSetDefault={(id) => void setDefaultProfile(id)}
            onClearDefault={() => void clearDefaultProfile()}
            onDelete={requestDelete}
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

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onExitComplete={handleDeleteDialogExit}
        title="Delete profile?"
        description={
          deletingProfile
            ? `“${deletingProfile.name}” and all of its decks, flashcards, and study progress will be permanently removed.`
            : undefined
        }
      >
        {deleteError && (
          <p className="mb-3 text-sm text-again">{deleteError}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => void confirmDelete()}
          >
            {deleting ? "Deleting…" : "Delete profile"}
          </Button>
        </div>
      </Dialog>
    </ThemeProvider>
  );
}

function ProfileActionItems({
  isDefault,
  onSetDefault,
  onClearDefault,
  onDelete,
  Item,
  Separator,
}: {
  isDefault: boolean;
  onSetDefault: () => void;
  onClearDefault: () => void;
  onDelete: () => void;
  Item: typeof ContextMenuItem;
  Separator: typeof ContextMenuSeparator;
}) {
  return (
    <>
      {isDefault ? (
        <Item onClick={onClearDefault}>
          <StarOff className="h-4 w-4" />
          Remove as default profile
        </Item>
      ) : (
        <Item onClick={onSetDefault}>
          <Star className="h-4 w-4" />
          Set as default profile
        </Item>
      )}
      <Separator />
      <Item variant="destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
        Delete profile
      </Item>
    </>
  );
}

function PickerView({
  profiles,
  defaultId,
  loading,
  selectedId,
  listRef,
  onSelect,
  onOpen,
  onCreate,
  onListKeyDown,
  onSetDefault,
  onClearDefault,
  onDelete,
}: {
  profiles: Profile[];
  defaultId: string | null;
  loading: boolean;
  selectedId: string | null;
  listRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onOpen: () => void;
  onCreate: () => void;
  onListKeyDown: (event: React.KeyboardEvent) => void;
  onSetDefault: (id: string) => void;
  onClearDefault: () => void;
  onDelete: (profile: Profile) => void;
}) {
  const hasProfiles = profiles.length > 0;
  const menuClose = useMenuCloseAction();

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

        {loading && !hasProfiles ? (
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
                const isDefault = profile.id === defaultId;
                return (
                  <li key={profile.id}>
                    <ContextMenu
                      onOpenChangeComplete={menuClose.onOpenChangeComplete}
                    >
                      <ContextMenuTrigger
                        render={
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
                          />
                        }
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
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {profile.name}
                          </span>
                          {isDefault && (
                            <span className="shrink-0 rounded-sm bg-accent-tint px-1.5 py-0.5 text-[0.6875rem] font-medium text-accent-deep">
                              Default
                            </span>
                          )}
                        </span>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isSelected ? "text-accent-deep" : "text-faint",
                          )}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      </ContextMenuTrigger>
                      <ContextMenuContent className="min-w-48">
                        <ProfileActionItems
                          isDefault={isDefault}
                          onSetDefault={menuClose.defer(() =>
                            onSetDefault(profile.id),
                          )}
                          onClearDefault={menuClose.defer(onClearDefault)}
                          onDelete={() => onDelete(profile)}
                          Item={ContextMenuItem}
                          Separator={ContextMenuSeparator}
                        />
                      </ContextMenuContent>
                    </ContextMenu>
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
              disabled={!selectedId}
              onClick={onOpen}
            >
              Open profile
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
