import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const WASM_PATH = "/mediapipe-wasm";
const MODEL_PATH = "/selfie_segmenter.tflite";

export type BackgroundEffect =
  | { kind: "none" }
  | { kind: "blur" }
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string };

export type BackgroundEffectOption = {
  id: string;
  label: string;
  effect: BackgroundEffect;
  swatch?: { from: string; to: string } | { color: string };
};

export const BACKGROUND_EFFECTS: BackgroundEffectOption[] = [
  { id: "none", label: "sem efeito", effect: { kind: "none" } },
  { id: "blur", label: "desfoque", effect: { kind: "blur" } },
  {
    id: "color-1",
    label: "azul",
    effect: { kind: "color", color: "#1e293b" },
    swatch: { color: "#1e293b" },
  },
  {
    id: "color-2",
    label: "verde",
    effect: { kind: "color", color: "#14532d" },
    swatch: { color: "#14532d" },
  },
  {
    id: "gradient-1",
    label: "gradiente",
    effect: { kind: "gradient", from: "#1e1b4b", to: "#7c3aed" },
    swatch: { from: "#1e1b4b", to: "#7c3aed" },
  },
];

type SegmenterLike = Pick<ImageSegmenter, "segmentForVideo">;

export function personAlphaMask(pixels: Uint8Array): Uint8Array {
  const alpha = new Uint8Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) {
    alpha[index] = pixels[index] === 0 ? 255 : 0;
  }
  return alpha;
}

export class BackgroundEffectEngine {
  readonly processedTrack: MediaStreamTrack;
  private readonly video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly loadSegmenter: () => Promise<SegmenterLike>;
  private segmenter: SegmenterLike | null = null;
  private effect: BackgroundEffect;
  private running = true;
  private raf = 0;

  constructor(inputTrack: MediaStreamTrack, loadSegmenter: () => Promise<SegmenterLike>) {
    this.effect = { kind: "blur" };
    this.loadSegmenter = loadSegmenter;
    const inputStream = new MediaStream([inputTrack]);
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = inputStream;
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d")!;
    this.maskCanvas = document.createElement("canvas");
    const outputStream = this.canvas.captureStream(30);
    this.processedTrack = outputStream.getVideoTracks()[0];
    void this.video.play().catch(() => undefined);
    void this.loadSegmenter()
      .then((segmenter) => {
        this.segmenter = segmenter;
      })
      .catch(() => undefined);
    this.raf = requestAnimationFrame(this.tick);
  }

  setEffect(effect: BackgroundEffect) {
    this.effect = effect;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.processedTrack.stop();
    this.video.srcObject = null;
  }

  private tick = () => {
    if (!this.running) {
      return;
    }
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private render() {
    const video = this.video;
    if (!this.segmenter || video.videoWidth === 0 || video.readyState < 2) {
      this.drawPlain();
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const result = this.segmenter.segmentForVideo(video, performance.now());
    const mask = result?.categoryMask;
    if (!mask) {
      this.drawPlain();
      return;
    }
    const maskWidth = mask.width;
    const maskHeight = mask.height;
    const alpha = personAlphaMask(mask.getAsUint8Array());
    mask.close();
    const imageData = new ImageData(maskWidth, maskHeight);
    const data = imageData.data;
    for (let index = 0; index < alpha.length; index += 1) {
      const offset = index * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha[index];
    }
    this.maskCanvas.width = mask.width;
    this.maskCanvas.height = mask.height;
    this.maskCanvas.getContext("2d")!.putImageData(imageData, 0, 0);

    const context = this.context;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.drawImage(video, 0, 0, width, height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(this.maskCanvas, 0, 0, width, height);
    context.globalCompositeOperation = "destination-over";
    this.drawBackground(context, width, height);
    context.restore();
  }

  private drawPlain() {
    const video = this.video;
    const width = video.videoWidth || this.canvas.width;
    const height = video.videoHeight || this.canvas.height;
    if (width === 0 || height === 0) {
      return;
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.context.drawImage(video, 0, 0, width, height);
  }

  private drawBackground(context: CanvasRenderingContext2D, width: number, height: number) {
    const effect = this.effect;
    if (effect.kind === "blur") {
      context.save();
      context.filter = "blur(24px) saturate(1.2)";
      context.drawImage(this.video, 0, 0, width, height);
      context.restore();
    } else if (effect.kind === "color") {
      context.fillStyle = effect.color;
      context.fillRect(0, 0, width, height);
    } else if (effect.kind === "gradient") {
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, effect.from);
      gradient.addColorStop(1, effect.to);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }
  }
}

export async function createBackgroundEffectEngine(inputTrack: MediaStreamTrack): Promise<BackgroundEffectEngine> {
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  let segmenterPromise: Promise<SegmenterLike> | null = null;
  const loadSegmenter = () => {
    if (!segmenterPromise) {
      segmenterPromise = FilesetResolver.forVisionTasks(WASM_PATH).then((vision) =>
        ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: true,
        }),
      );
    }
    return segmenterPromise;
  };
  return new BackgroundEffectEngine(inputTrack, loadSegmenter);
}
