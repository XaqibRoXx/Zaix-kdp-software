import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ZaxisCloudApi,
  type CloudAsset
} from "../cloud/apiClient";

type BrushMode = "restore" | "erase" | "refine";
type BackgroundMode = "transparent" | "color" | "blur" | "image";

export function ImageRefineModal({
  api,
  sourceAsset,
  processedAsset,
  projectId,
  onSaved,
  onClose
}: {
  api: ZaxisCloudApi;
  sourceAsset: CloudAsset;
  processedAsset: CloudAsset;
  projectId: string;
  onSaved: (asset: CloudAsset) => void;
  onClose: () => void;
}) {
  const foregroundRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedBitmapRef = useRef<ImageBitmap | null>(null);
  const customBackgroundRef = useRef<ImageBitmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading original and transparent image...");
  const [brushMode, setBrushMode] = useState<BrushMode>("restore");
  const [brushSize, setBrushSize] = useState(70);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("transparent");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [blurAmount, setBlurAmount] = useState(18);
  const drawingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const [sourceBlob, processedBlob] = await Promise.all([
          api.fetchAssetBlob(sourceAsset.id, "original"),
          api.fetchAssetBlob(processedAsset.id, "original")
        ]);

        const [sourceBitmap, processedBitmap] = await Promise.all([
          createImageBitmap(sourceBlob),
          createImageBitmap(processedBlob)
        ]);

        if (cancelled) {
          sourceBitmap.close();
          processedBitmap.close();
          return;
        }

        const width = sourceBitmap.width;
        const height = sourceBitmap.height;
        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = width;
        originalCanvas.height = height;
        originalCanvas.getContext("2d")?.drawImage(sourceBitmap, 0, 0, width, height);
        originalCanvasRef.current = originalCanvas;
        sourceBitmap.close();

        const foreground = foregroundRef.current;
        const background = backgroundRef.current;

        if (!foreground || !background) throw new Error("Refine canvas is unavailable.");

        foreground.width = width;
        foreground.height = height;
        background.width = width;
        background.height = height;

        foreground.getContext("2d")?.drawImage(processedBitmap, 0, 0, width, height);
        processedBitmapRef.current?.close();
        processedBitmapRef.current = processedBitmap;

        setStatus("Ready. Paint directly on the subject edge.");
        setLoading(false);
        renderBackground(backgroundMode, backgroundColor, blurAmount);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load refine images.");
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      processedBitmapRef.current?.close();
      customBackgroundRef.current?.close();
    };
  }, [sourceAsset.id, processedAsset.id]);

  useEffect(() => {
    if (!loading) renderBackground(backgroundMode, backgroundColor, blurAmount);
  }, [backgroundMode, backgroundColor, blurAmount, loading]);

  function renderBackground(
    mode: BackgroundMode,
    color: string,
    blur: number
  ) {
    const canvas = backgroundRef.current;
    const original = originalCanvasRef.current;
    if (!canvas || !original) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (mode === "transparent") return;

    if (mode === "color") {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (mode === "blur") {
      ctx.save();
      ctx.filter = "blur(" + Math.max(0, blur) + "px)";
      const overscan = Math.max(0, blur * 2);
      ctx.drawImage(
        original,
        -overscan,
        -overscan,
        canvas.width + overscan * 2,
        canvas.height + overscan * 2
      );
      ctx.restore();
      return;
    }

    const custom = customBackgroundRef.current;
    if (mode === "image" && custom) {
      drawCover(ctx, custom, canvas.width, canvas.height);
    }
  }

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = foregroundRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function applyBrush(x: number, y: number) {
    const canvas = foregroundRef.current;
    const original = originalCanvasRef.current;
    if (!canvas || !original) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const radius = Math.max(2, brushSize / 2);

    if (brushMode === "erase") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
      return;
    }

    if (brushMode === "restore") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(original, 0, 0);
      ctx.restore();
      return;
    }

    const size = Math.max(4, Math.ceil(radius * 2));
    const temp = document.createElement("canvas");
    temp.width = size;
    temp.height = size;
    const tempCtx = temp.getContext("2d");
    if (!tempCtx) return;

    tempCtx.drawImage(
      original,
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
      0,
      0,
      size,
      size
    );

    tempCtx.globalCompositeOperation = "destination-in";
    const gradient = tempCtx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(0.65, "rgba(0,0,0,0.28)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    tempCtx.fillStyle = gradient;
    tempCtx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(temp, x - radius, y - radius);
    ctx.restore();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (loading) return;
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    if (point) applyBrush(point.x, point.y);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const point = pointerPosition(event);
    if (point) applyBrush(point.x, point.y);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resetSubject() {
    const canvas = foregroundRef.current;
    const bitmap = processedBitmapRef.current;
    if (!canvas || !bitmap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    setStatus("Subject reset to the worker result.");
  }

  async function chooseBackgroundImage(file: File) {
    try {
      const bitmap = await createImageBitmap(file);
      customBackgroundRef.current?.close();
      customBackgroundRef.current = bitmap;
      setBackgroundMode("image");
      renderBackground("image", backgroundColor, blurAmount);
      setStatus("Custom background image loaded.");
    } catch {
      setStatus("Could not load the background image.");
    }
  }

  async function saveResult() {
    const foreground = foregroundRef.current;
    const background = backgroundRef.current;
    if (!foreground || !background) return;

    setSaving(true);
    setStatus("Rendering refined PNG...");

    try {
      const output = document.createElement("canvas");
      output.width = foreground.width;
      output.height = foreground.height;
      const ctx = output.getContext("2d");
      if (!ctx) throw new Error("Could not create output canvas.");

      if (backgroundMode !== "transparent") {
        ctx.drawImage(background, 0, 0);
      }
      ctx.drawImage(foreground, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob(
          (value) => value ? resolve(value) : reject(new Error("PNG encoding failed.")),
          "image/png"
        );
      });

      const base = processedAsset.original_name.replace(/\.[^.]+$/, "") || "refined-image";
      const file = new File([blob], base + "-refined.png", { type: "image/png" });
      const result = await api.uploadAsset(file, projectId);
      setStatus("Refined image saved as new cloud asset.");
      onSaved(result.asset);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save refined image.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop refine-backdrop" role="dialog" aria-modal="true">
      <div className="refine-modal">
        <div className="refine-header">
          <div>
            <span className="eyebrow">IMAGE REFINE</span>
            <h3>Restore / Erase / Soft Edge + Background</h3>
            <p>{status}</p>
          </div>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>

        <div className="refine-layout">
          <aside className="refine-controls">
            <label>Brush Mode
              <select value={brushMode} onChange={(event) => setBrushMode(event.target.value as BrushMode)}>
                <option value="restore">Restore Original</option>
                <option value="erase">Erase Subject</option>
                <option value="refine">Soft Refine</option>
              </select>
            </label>

            <label>Brush Size
              <input
                type="range"
                min="8"
                max="300"
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
              />
              <small>{brushSize}px</small>
            </label>

            <button className="secondary" onClick={resetSubject}>Reset Subject</button>

            <label>Background
              <select
                value={backgroundMode}
                onChange={(event) => setBackgroundMode(event.target.value as BackgroundMode)}
              >
                <option value="transparent">Transparent</option>
                <option value="color">Solid Color</option>
                <option value="blur">Blur Original</option>
                <option value="image">Custom Image</option>
              </select>
            </label>

            {backgroundMode === "color" && (
              <label>Color
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(event) => setBackgroundColor(event.target.value)}
                />
              </label>
            )}

            {backgroundMode === "blur" && (
              <label>Blur
                <input
                  type="range"
                  min="2"
                  max="60"
                  value={blurAmount}
                  onChange={(event) => setBlurAmount(Number(event.target.value))}
                />
                <small>{blurAmount}px</small>
              </label>
            )}

            <label className="file-button">
              Custom Background
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void chooseBackgroundImage(file);
                }}
              />
            </label>

            <div className="refine-legend">
              <span><i className="restore-dot" /> Restore pixels from original</span>
              <span><i className="erase-dot" /> Make pixels transparent</span>
              <span><i className="refine-dot" /> Soft feathered restore</span>
            </div>
          </aside>

          <div className="refine-stage checkerboard">
            <canvas ref={backgroundRef} className="refine-background" />
            <canvas
              ref={foregroundRef}
              className="refine-foreground"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
        </div>

        <div className="refine-footer">
          <small>Original is never overwritten. Saving creates a new PNG asset.</small>
          <button className="primary" disabled={loading || saving} onClick={() => void saveResult()}>
            {saving ? "Saving..." : "Save Refined PNG"}
          </button>
        </div>
      </div>
    </div>
  );
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number
) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let x = 0;
  let y = 0;

  if (imageRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
    x = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
    y = (height - drawHeight) / 2;
  }

  context.drawImage(image, x, y, drawWidth, drawHeight);
}
