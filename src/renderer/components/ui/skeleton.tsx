import { cn } from "@/lib/utils";

export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}
