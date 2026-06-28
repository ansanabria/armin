import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mediaDisplayUrl,
  persistMediaRefsInMarkdown,
  resolveMediaRefsInMarkdown,
} from "@/lib/media";
import { ImageZoomDialog } from "@/components/ui/image-zoom-dialog";
import { ResizableImage } from "@/components/ui/markdown-image";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  // The editor is created once, so reach the latest preview handler via a ref.
  const onPreviewRef = useRef<((src: string) => void) | null>(null);
  onPreviewRef.current = setPreviewSrc;

  const syncScrollOverflow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight) {
      el.dataset.overflowing = "";
    } else {
      delete el.dataset.overflowing;
    }
  }, []);

  const insertImageFiles = useCallback(
    async (editor: Editor | null, files: Iterable<File>) => {
      if (!editor) return;
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const stored = await window.armin.media.importImage({
          bytes: new Uint8Array(await file.arrayBuffer()),
          fileName: file.name,
          mime: file.type,
        });
        editor
          .chain()
          .focus()
          .setImage({ src: mediaDisplayUrl(stored.ref), alt: file.name })
          .run();
      }
    },
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
      }),
      Markdown,
      ResizableImage.configure({
        allowBase64: false,
        onPreview: (src) => onPreviewRef.current?.(src),
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: resolveMediaRefsInMarkdown(value),
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "tiptap outline-none",
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      // Ctrl/Cmd+Enter submits the card form (handled at the dialog level), so
      // swallow it here to stop ProseMirror from inserting a stray newline. The
      // DOM event still bubbles up to the dialog's submit listener.
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (
          files?.length &&
          Array.from(files).some((f) => f.type.startsWith("image/"))
        ) {
          void insertImageFiles(editorRef.current, files);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (
          files?.length &&
          Array.from(files).some((f) => f.type.startsWith("image/"))
        ) {
          event.preventDefault();
          void insertImageFiles(editorRef.current, files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(persistMediaRefsInMarkdown(current.getMarkdown()));
      requestAnimationFrame(syncScrollOverflow);
    },
    onCreate: ({ editor: current }) => {
      if (autoFocus) {
        current.commands.focus("end");
      }
      requestAnimationFrame(syncScrollOverflow);
    },
  });

  // editorProps capture their closure at creation time, so reach for the
  // current instance through a ref inside the paste/drop handlers.
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = persistMediaRefsInMarkdown(editor.getMarkdown());
    if (value !== current) {
      editor.commands.setContent(resolveMediaRefsInMarkdown(value), {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [editor, value]);

  useLayoutEffect(() => {
    syncScrollOverflow();
  }, [editor, value, syncScrollOverflow]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => syncScrollOverflow());
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncScrollOverflow]);

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      void insertImageFiles(editor, event.target.files);
    }
    // Reset so the same file can be picked again.
    event.target.value = "";
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border-strong bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint",
        className,
      )}
    >
      <div
        ref={containerRef}
        {...(autoFocus ? { "data-autofocus": true } : {})}
        className="markdown-editor armin-scrollbar max-h-[220px] min-h-[88px] w-full px-3 py-2 text-sm leading-relaxed text-ink"
      >
        <EditorContent editor={editor} />
      </div>
      <div className="flex items-center justify-end border-t border-border px-2 py-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          Add image
        </button>
      </div>
      <ImageZoomDialog
        src={previewSrc}
        open={previewSrc !== null}
        onClose={() => setPreviewSrc(null)}
      />
    </div>
  );
}
