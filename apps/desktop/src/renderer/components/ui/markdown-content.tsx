import { useMemo, useRef, useState, type MutableRefObject } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type UrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { mediaDisplayUrl } from "@/lib/media";
import { parseImageWidth, stripImageWidth } from "@/lib/image-size";
import { ImageZoomDialog } from "@/components/ui/image-zoom-dialog";

/** Card images are stored as profile-relative Flashcard media references. */
const cardUrlTransform: UrlTransform = (url, key) => {
  if (key === "src" && /^armin-media:/i.test(url)) {
    return mediaDisplayUrl(url);
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
  onPreview: (src: string) => void,
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
  } else {
    // Apply the stored display width (encoded in the title) and let clicking the
    // image open the centered zoom preview.
    components.img = ({ src, alt, title }) => {
      const rawTitle = typeof title === "string" ? title : null;
      const width = parseImageWidth(rawTitle);
      const caption = stripImageWidth(rawTitle);
      const source = typeof src === "string" ? src : "";
      return (
        <button
          type="button"
          className="md-image-zoom"
          aria-label="Preview image"
          onClick={() => source && onPreview(source)}
        >
          <img
            src={source}
            alt={alt ?? ""}
            title={caption}
            style={width ? { width, maxWidth: "100%" } : undefined}
          />
        </button>
      );
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
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const components = useMemo(
    () => createComponents(images, imageIndexRef, setPreviewSrc),
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
      {images === "show" && (
        <ImageZoomDialog
          src={previewSrc}
          open={previewSrc !== null}
          onClose={() => setPreviewSrc(null)}
        />
      )}
    </div>
  );
}
