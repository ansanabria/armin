import { useMemo, useRef, type MutableRefObject } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type UrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Card images are stored as inline data URLs from the markdown editor. */
const cardUrlTransform: UrlTransform = (url, key) => {
  if (key === "src" && /^data:image\//i.test(url)) {
    return url;
  }
  return defaultUrlTransform(url);
};

type MarkdownContentProps = {
  /** Markdown source to render read-only. */
  content: string;
  className?: string;
  /** In compact previews, replace images with numbered placeholders. */
  images?: "show" | "placeholder";
};

function createComponents(
  images: MarkdownContentProps["images"],
  imageIndexRef: MutableRefObject<number>,
): Components {
  const components: Components = {
    a({ children, href, ...props }) {
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
          {children}
        </a>
      );
    },
  };

  if (images === "placeholder") {
    components.img = () => {
      imageIndexRef.current += 1;
      return <span>[Image {imageIndexRef.current}]</span>;
    };
  }

  return components;
}

/**
 * Read-only Markdown renderer for the same content cards are authored in.
 * Uses react-markdown + GFM; styling lives under `.markdown-content`.
 */
export function MarkdownContent({
  content,
  className,
  images = "show",
}: MarkdownContentProps) {
  const imageIndexRef = useRef(0);
  const components = useMemo(
    () => createComponents(images, imageIndexRef),
    [images],
  );

  imageIndexRef.current = 0;

  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={cardUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
