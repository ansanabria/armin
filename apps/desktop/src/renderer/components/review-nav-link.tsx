import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, GraduationCap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { reviewKeys } from "@/lib/armin-query";
import { cn } from "@/lib/utils";

const QUEUE_POLL_MS = 15_000;

const reviewButton = cn(
  buttonVariants({ variant: "primary", size: "sm" }),
  "titlebar-no-drag ml-4 mr-4 shrink-0 focus-visible:ring-inset focus-visible:ring-offset-0",
);
const reviewButtonActive = cn(
  buttonVariants({ variant: "primary", size: "sm" }),
  "titlebar-no-drag ml-4 mr-4 shrink-0 bg-accent-deep hover:bg-accent-deep focus-visible:ring-inset focus-visible:ring-offset-0",
);

export function ReviewNavLink() {
  const queueQuery = useQuery({
    queryKey: reviewKeys.all,
    queryFn: () => window.armin.review.queueAll(),
    refetchInterval: QUEUE_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const dueCount = queueQuery.data?.length ?? 0;
  const statusLabel =
    queueQuery.isSuccess && dueCount === 0
      ? "all caught up"
      : queueQuery.isSuccess
        ? `${dueCount} review units due`
        : undefined;

  return (
    <Link
      to="/review"
      className={reviewButton}
      activeProps={{ className: reviewButtonActive }}
      aria-label={statusLabel ? `Review, ${statusLabel}` : "Review"}
    >
      <GraduationCap className="h-4 w-4" strokeWidth={1.5} />
      Review
      {queueQuery.isSuccess && (
        <span className="inline-flex items-center tabular-nums">
          (
          {dueCount > 0 ? (
            dueCount
          ) : (
            <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          )}
          )
        </span>
      )}
    </Link>
  );
}
