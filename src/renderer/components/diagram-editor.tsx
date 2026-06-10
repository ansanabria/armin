import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type {
  DiagramContent,
  DiagramRegion,
} from "../../main/services/card-types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Rect = { x: number; y: number; w: number; h: number };

function newRegionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `r${Date.now()}-${Math.random()}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Authoring surface for diagram cards: upload an image, drag rectangles over the
 * regions to test, and label each one. Coordinates are stored as fractions of
 * the image so they survive any display size.
 */
export function DiagramEditor({
  value,
  onChange,
}: {
  value: DiagramContent;
  onChange: (next: DiagramContent) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const setImage = (image: string) =>
    onChange({ image, regions: value.regions });
  const setRegions = (regions: DiagramRegion[]) =>
    onChange({ image: value.image, regions });

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!value.image) return;
    const point = pointFromEvent(event);
    if (!point) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    startRef.current = point;
    setDraft({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!startRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const start = startRef.current;
    setDraft({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      w: Math.abs(point.x - start.x),
      h: Math.abs(point.y - start.y),
    });
  };

  const onPointerUp = () => {
    const rect = draft;
    startRef.current = null;
    setDraft(null);
    if (!rect || rect.w < 0.02 || rect.h < 0.02) return;
    setRegions([...value.regions, { id: newRegionId(), ...rect, label: "" }]);
  };

  const updateRegion = (id: string, patch: Partial<DiagramRegion>) => {
    setRegions(
      value.regions.map((region) =>
        region.id === id ? { ...region, ...patch } : region,
      ),
    );
  };

  const removeRegion = (id: string) => {
    setRegions(value.regions.filter((region) => region.id !== id));
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />

      {value.image ? (
        <div className="overflow-hidden rounded-md border border-border-strong">
          <div
            ref={surfaceRef}
            className="relative touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <img
              src={value.image}
              alt="Diagram"
              draggable={false}
              className="pointer-events-none block max-h-[320px] w-full object-contain"
            />
            {value.regions.map((region, index) => (
              <RegionBox key={region.id} rect={region} index={index + 1} />
            ))}
            {draft && <RegionBox rect={draft} draft />}
          </div>
          <div className="flex items-center justify-between border-t border-border px-2 py-1 text-xs text-muted">
            <span>Drag on the image to mark a region.</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 font-medium transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              Replace
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface text-sm text-muted transition-colors hover:border-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ImagePlus className="h-5 w-5" aria-hidden />
          Upload a diagram image
        </button>
      )}

      {value.regions.length > 0 && (
        <ul className="space-y-2">
          {value.regions.map((region, index) => (
            <li key={region.id} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-accent text-xs font-semibold text-on-accent">
                {index + 1}
              </span>
              <Input
                value={region.label}
                onChange={(e) =>
                  updateRegion(region.id, { label: e.target.value })
                }
                placeholder="Label (the answer)"
                aria-label={`Region ${index + 1} label`}
                className="flex-1"
              />
              <Input
                value={region.hint ?? ""}
                onChange={(e) =>
                  updateRegion(region.id, {
                    hint: e.target.value || undefined,
                  })
                }
                placeholder="Hint (optional)"
                aria-label={`Region ${index + 1} hint`}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeRegion(region.id)}
                aria-label={`Remove region ${index + 1}`}
                className="shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:text-relearning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RegionBox({
  rect,
  index,
  draft,
}: {
  rect: Rect;
  index?: number;
  draft?: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute border-2",
        draft ? "border-accent/70 bg-accent/10" : "border-accent bg-accent/15",
      )}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }}
    >
      {index !== undefined && (
        <span className="absolute -left-px -top-px flex h-4 min-w-4 items-center justify-center rounded-br-sm bg-accent px-1 text-[0.625rem] font-semibold text-on-accent">
          {index}
        </span>
      )}
    </div>
  );
}
