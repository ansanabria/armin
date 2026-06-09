import { useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string };

type SearchableSelectProps = {
  options: ComboboxOption[];
  /** Currently selected value; "" (or no match) shows the placeholder. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  "aria-label"?: string;
  size?: "sm" | "default";
  className?: string;
};

/**
 * A Select whose dropdown includes a search field, built on Base UI's
 * Combobox. Single selection over a flat list of string-valued options.
 */
export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  "aria-label": ariaLabel,
  size = "default",
  className,
}: SearchableSelectProps) {
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange(next?.value ?? "")}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
    >
      <Combobox.Trigger
        aria-label={ariaLabel}
        data-size={size}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-1.5 border border-border-strong bg-surface py-2 pr-2 pl-2.5 text-sm whitespace-nowrap text-ink transition-[border-color,box-shadow] duration-150 outline-none select-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-tint data-[popup-open]:border-accent data-[size=default]:h-9 data-[size=sm]:h-7",
          className,
        )}
      >
        <Combobox.Value>
          {(val: ComboboxOption | null) => (
            <span
              className={cn("line-clamp-1 text-left", !val && "text-muted")}
            >
              {val ? val.label : placeholder}
            </span>
          )}
        </Combobox.Value>
        <Combobox.Icon className="flex">
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted" />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            className={cn(
              "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-hidden border border-border bg-surface text-ink shadow-overlay duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <Combobox.Input
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </div>
            <Combobox.Empty className="text-center text-sm text-muted [&:not(:empty)]:px-3 [&:not(:empty)]:py-4">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(item: ComboboxOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-pointer items-center gap-1.5 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[highlighted]:bg-surface-sunken data-[highlighted]:text-ink"
                >
                  <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                  <span className="line-clamp-1">{item.label}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

type SearchableMultiSelectProps = {
  options: ComboboxOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  "aria-label"?: string;
  size?: "sm" | "default";
  className?: string;
};

/**
 * Searchable combobox with multiple selection. The popup stays open while
 * toggling items; selected options show checkmarks in the list.
 */
export function SearchableMultiSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  "aria-label": ariaLabel,
  size = "default",
  className,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.filter((o) => value.includes(o.value)),
    [options, value],
  );

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.map((o) => o.label).join(", ");

  return (
    <Combobox.Root<ComboboxOption, true>
      multiple
      open={open}
      onOpenChange={setOpen}
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange((next ?? []).map((o) => o.value))}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
    >
      <Combobox.Trigger
        aria-label={ariaLabel}
        data-size={size}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-1.5 border border-border-strong bg-surface py-2 pr-2 pl-2.5 text-sm whitespace-nowrap text-ink transition-[border-color,box-shadow] duration-150 outline-none select-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-tint data-[popup-open]:border-accent data-[size=default]:h-9 data-[size=sm]:h-7",
          className,
        )}
      >
        <span
          className={cn(
            "line-clamp-1 text-left",
            selected.length === 0 && "text-muted",
          )}
          title={selected.length > 0 ? triggerLabel : undefined}
        >
          {triggerLabel}
        </span>
        <Combobox.Icon className="flex">
          <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted" />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            className={cn(
              "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-hidden border border-border bg-surface text-ink shadow-overlay duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <Combobox.Input
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </div>
            <Combobox.Empty className="text-center text-sm text-muted [&:not(:empty)]:px-3 [&:not(:empty)]:py-4">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(item: ComboboxOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-pointer items-center gap-1.5 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[highlighted]:bg-surface-sunken data-[highlighted]:text-ink"
                >
                  <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                  <span className="line-clamp-1">{item.label}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
