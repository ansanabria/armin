import { MarkdownContent } from "@/components/ui/markdown-content";
import { cn } from "@/lib/utils";

/**
 * Renders streamed Assistant markdown, mirroring shadcn AI Elements' <Response>.
 * Reuses Armin's own read-only Markdown renderer (react-markdown + GFM) so chat
 * replies get the exact typography, code, and image treatment as authored cards.
 */
export function Response({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <MarkdownContent content={children} className={cn("text-sm leading-relaxed", className)} />
  );
}
