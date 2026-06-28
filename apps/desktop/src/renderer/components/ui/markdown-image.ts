import { mergeAttributes, ResizableNodeView } from "@tiptap/core";
import { Image, type ImageOptions } from "@tiptap/extension-image";
import {
  formatImageTitle,
  parseImageWidth,
  stripImageWidth,
} from "@/lib/image-size";

/** Magnifier (zoom-in) glyph for the hover preview button; matches lucide. */
const ZOOM_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;

export type ResizableImageOptions = ImageOptions & {
  /** Opens the centered zoom preview for the given (display) src. */
  onPreview?: (src: string) => void;
};

/**
 * The Tiptap image node for the card composer. The base `@tiptap/extension-image`
 * already ships width attributes, a `ResizableNodeView`, and markdown round-trip
 * — but its `renderMarkdown` drops the width, so a resized image reverts on
 * reload. We override the markdown handlers to carry the width in the image
 * title (`w=<px>`, see `lib/image-size`) and supply our own node view that adds
 * corner resize handles plus a hover magnifier that opens the zoom preview.
 *
 * Width drives the size and aspect ratio is always preserved, so only the width
 * needs to survive the round-trip; height stays `auto` and follows the image's
 * natural ratio.
 */
export const ResizableImage = Image.extend<ResizableImageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as ImageOptions),
      onPreview: undefined,
    };
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("image", {
      src: token.href,
      alt: token.text,
      // Width rides in a leading title token; the rest is the human caption.
      width: parseImageWidth(token.title),
      title: stripImageWidth(token.title) ?? null,
    }),

  renderMarkdown: (node) => {
    const attrs = node.attrs ?? {};
    const src = attrs.src ?? "";
    const alt = attrs.alt ?? "";
    const title = formatImageTitle(attrs.width, attrs.title);
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  },

  addNodeView() {
    if (typeof document === "undefined") return null;
    const onPreview = this.options.onPreview;

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const el = document.createElement("img");
      el.draggable = false;
      const merged = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
      for (const [key, value] of Object.entries(merged)) {
        if (value == null) continue;
        // Size is applied from node attrs by ResizableNodeView, not as a DOM attr.
        if (key === "width" || key === "height") continue;
        el.setAttribute(key, String(value));
      }
      if (merged.src != null) el.src = String(merged.src);

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos,
        onResize: (width) => {
          el.style.width = `${width}px`;
          el.style.height = "auto";
        },
        onCommit: (width) => {
          const pos = getPos();
          if (pos === undefined) return;
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes("image", { width: Math.round(width), height: null })
            .run();
        },
        onUpdate: (updated) => updated.type === node.type,
        options: {
          directions: ["bottom-left", "bottom-right", "top-left", "top-right"],
          min: { width: 48, height: 48 },
          preserveAspectRatio: true,
          className: {
            container: "tiptap-image",
            wrapper: "tiptap-image-wrapper",
            handle: "tiptap-image-handle",
            resizing: "is-resizing",
          },
        },
      });

      if (onPreview) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tiptap-image-zoom";
        button.contentEditable = "false";
        button.setAttribute("aria-label", "Preview image");
        button.innerHTML = ZOOM_ICON_SVG;
        // Don't let the button steal selection or trigger a resize drag.
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const src = node.attrs.src;
          if (src) onPreview(String(src));
        });
        nodeView.wrapper.appendChild(button);
      }

      // Hide until the image has loaded so handles don't flash at the wrong size.
      const dom = nodeView.dom;
      dom.style.visibility = "hidden";
      dom.style.pointerEvents = "none";
      el.onload = () => {
        dom.style.visibility = "";
        dom.style.pointerEvents = "";
      };
      return nodeView;
    };
  },
});
