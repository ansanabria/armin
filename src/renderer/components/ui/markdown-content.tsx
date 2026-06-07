import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownContentProps = {
  /** Markdown source to render read-only. */
  content: string;
  className?: string;
};

// Card links shouldn't navigate the app's renderer away; open externally.
const components: Components = {
  a({ children, href, ...props }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
        {children}
      </a>
    );
  },
};

/**
 * Read-only Markdown renderer for the same content cards are authored in.
 * Uses react-markdown + GFM; styling lives under `.markdown-content`.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
