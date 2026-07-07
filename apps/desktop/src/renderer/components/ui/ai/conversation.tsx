import * as React from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Auto-sticking chat transcript modeled on shadcn's AI Elements <Conversation>.
 * It keeps the newest message pinned to the bottom while the reader is already
 * there (so streaming tokens stay in view), but stops fighting them the moment
 * they scroll up to re-read — a jump-to-latest control brings them back.
 */

const AT_BOTTOM_THRESHOLD = 32;

type ConversationContextValue = {
  isAtBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};

const ConversationContext =
  React.createContext<ConversationContextValue | null>(null);

function useConversation() {
  const context = React.useContext(ConversationContext);
  if (!context) {
    throw new Error(
      "Conversation subcomponents must be rendered inside <Conversation>.",
    );
  }
  return context;
}

export function Conversation({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const isAtBottomRef = React.useRef(true);

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollTo({ top: element.scrollHeight, behavior });
    },
    [],
  );

  const handleScroll = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distance <= AT_BOTTOM_THRESHOLD;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  // Follow content growth (new messages, streaming tokens) only while pinned.
  React.useEffect(() => {
    const element = scrollRef.current;
    const content = element?.firstElementChild;
    if (!element || !content) return;
    element.scrollTo({ top: element.scrollHeight });
    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        element.scrollTo({ top: element.scrollHeight });
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const value = React.useMemo(
    () => ({ isAtBottom, scrollToBottom }),
    [isAtBottom, scrollToBottom],
  );

  return (
    <ConversationContext.Provider value={value}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        className={cn(
          "armin-scrollbar armin-scrollbar-gutter-bg relative flex flex-col overflow-y-auto",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  );
}

export function ConversationContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-h-full flex-col gap-3 px-5 py-4", className)}
      {...props}
    />
  );
}

export function ConversationEmptyState({
  className,
  icon,
  title,
  description,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  title?: string;
  description?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
          {icon}
        </div>
      )}
      {(title || description) && (
        <div className="space-y-1">
          {title && <p className="text-sm font-medium text-ink">{title}</p>}
          {description && (
            <p className="max-w-[36ch] text-pretty text-[0.8125rem] leading-snug text-muted">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function ConversationScrollButton({ className }: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useConversation();
  if (isAtBottom) return null;
  return (
    <div className="pointer-events-none sticky bottom-3 flex justify-center">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Scroll to latest message"
        onClick={() => scrollToBottom()}
        className={cn(
          "pointer-events-auto rounded-full shadow-[var(--armin-shadow-overlay)]",
          className,
        )}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
