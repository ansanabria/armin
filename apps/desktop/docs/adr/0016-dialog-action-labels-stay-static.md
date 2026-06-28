# Dialog action labels stay static; busy state never changes content

A dialog's primary action button keeps the **same visible label** from the moment
it renders until the dialog is gone. While the action runs and while the dialog
plays its close animation, the button may become non-interactive, but its text,
size, and children must not change. "Delete deck" stays "Delete deck" — it never
becomes "Deleting…".

## Why

`Dialog` (`components/ui/dialog.tsx`) keeps a modal mounted through a short exit
animation and renders a **snapshot** of its content while closing, so the content
can't shift mid-animation. That snapshot is captured from the last open render.
When a button swaps its label to a busy verb on `mutation.isPending`, the close is
triggered from inside that pending render, so the snapshot freezes the *"Deleting…"*
text and shows it for the whole fade-out. The result is a visible flash: the label
changes for an instant and then the dialog disappears. Local mutations (SQLite)
resolve so fast that the busy verb adds no useful feedback — it only flashes.

## The rule

- Express "this action is running" with the `busy` prop on `Button`
  (`busy={mutation.isPending}`), which disables the button and sets `aria-busy`
  **without touching the label**. Do not gate it through `disabled` and a label
  ternary.
- Keep the label a constant string (or one derived only from stable props such as
  edit-vs-create mode), never from pending/closing state.
- A label may stay disabled through the close animation (e.g. an additional
  `closingAfter…` flag) — that is fine, because the snapshot only ever freezes a
  static label.

## Avoid

```tsx
// Flashes "Deleting…" during the close animation:
<Button disabled={m.isPending} onClick={...}>
  {m.isPending ? "Deleting…" : "Delete deck"}
</Button>
```

## Prefer

```tsx
// Label is frozen-safe; the button just goes quiet while the work runs:
<Button busy={m.isPending} onClick={...}>Delete deck</Button>
```

If an action is genuinely slow and needs progress feedback, surface it somewhere
that is **not** snapshotted on close (a toast, or inline content that stays put),
not by mutating the action button's label.
