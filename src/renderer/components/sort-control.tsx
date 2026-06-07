import type { ReactNode } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SortOption<T extends string> = {
  value: T;
  label: string;
};

type SortControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SortOption<T>[];
  className?: string;
  /** Stack a label above the select to match filter fields. */
  fieldLayout?: boolean;
  label?: ReactNode;
  triggerClassName?: string;
};

export function SortControl<T extends string>({
  value,
  onChange,
  options,
  className,
  fieldLayout = false,
  label = "Sort",
  triggerClassName,
}: SortControlProps<T>) {
  const items = options.map((opt) => ({ value: opt.value, label: opt.label }));

  const select = (
    <Select
      value={value}
      items={items}
      onValueChange={(next) => onChange(next as T)}
    >
      <SelectTrigger
        className={cn(
          "w-full min-w-[11rem] border-border-strong bg-surface",
          triggerClassName,
        )}
        aria-label="Sort by"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  if (fieldLayout) {
    return (
      <label className={cn("flex flex-col gap-1.5", className)}>
        <span className="inline-flex h-3.5 items-center gap-1.5 text-xs font-medium text-muted">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {label}
        </span>
        {select}
      </label>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      {select}
    </div>
  );
}
