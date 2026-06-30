import * as React from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Command-palette primitives in the shadcn "base" shape, built on Base UI's
 * Autocomplete (the filtering + keyboard-highlight primitive shadcn's base
 * Command wraps). The list is rendered inline (always open) for a palette,
 * rather than in a floating popup.
 */

function Command<ItemValue>({
  className,
  children,
  ...props
}: Omit<Autocomplete.Root.Props<ItemValue>, "items"> & {
  items?: readonly ItemValue[];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Autocomplete.Root mode="list" {...props} open>
      <div
        data-slot="command"
        className={cn("flex h-full w-full flex-col overflow-hidden", className)}
      >
        {children}
      </div>
    </Autocomplete.Root>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search className="size-4 shrink-0 text-muted" aria-hidden />
      <Autocomplete.Input
        data-slot="command-input"
        className={cn(
          "h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.List>) {
  return (
    <Autocomplete.List
      data-slot="command-list"
      className={cn(
        "armin-scrollbar max-h-80 overflow-y-auto overflow-x-hidden p-1",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.Empty>) {
  return (
    <Autocomplete.Empty
      data-slot="command-empty"
      className={cn(
        "py-6 text-center text-sm text-muted [&:empty]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.Group>) {
  return (
    <Autocomplete.Group
      data-slot="command-group"
      className={cn("overflow-hidden p-1", className)}
      {...props}
    />
  );
}

function CommandGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.GroupLabel>) {
  return (
    <Autocomplete.GroupLabel
      data-slot="command-group-label"
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted",
        className,
      )}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.Item>) {
  return (
    <Autocomplete.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.Separator>) {
  return (
    <Autocomplete.Separator
      data-slot="command-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto flex items-center gap-1", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
};
