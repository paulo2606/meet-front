import { useEffect, useState } from "react";
import { resolvePhotoUrl } from "@/lib/api";

export function dominantColor(pixels: Uint8ClampedArray, width: number, height: number): string | null {
  if (width <= 0 || height <= 0 || pixels.length < 4) {
    return null;
  }
  const counts = new Map<number, number>();
  const sums = new Map<number, [number, number, number]>();
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    if (pixels[offset + 3] < 128) {
      continue;
    }
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const [sumRed, sumGreen, sumBlue] = sums.get(key) ?? [0, 0, 0];
    sums.set(key, [sumRed + red, sumGreen + green, sumBlue + blue]);
  }
  let bestKey = -1;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  if (bestKey === -1) {
    return null;
  }
  const [sumRed, sumGreen, sumBlue] = sums.get(bestKey) ?? [0, 0, 0];
  return toHex(Math.round(sumRed / bestCount), Math.round(sumGreen / bestCount), Math.round(sumBlue / bestCount));
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => value.toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

const photoColorCache = new Map<string, string>();

export async function getPhotoColor(photoUrl: string): Promise<string | null> {
  const cached = photoColorCache.get(photoUrl);
  if (cached) {
    return cached;
  }
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("falha ao carregar a foto"));
      image.src = photoUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = loaded.naturalWidth;
    canvas.height = loaded.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    context.drawImage(loaded, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const color = dominantColor(imageData.data, canvas.width, canvas.height);
    if (color) {
      photoColorCache.set(photoUrl, color);
    }
    return color;
  } catch {
    return null;
  }
}

export function usePhotoColor(photoUrl: string | null | undefined, enabled: boolean): string | null {
  const resolved = resolvePhotoUrl(photoUrl) ?? photoUrl ?? null;
  const [state, setState] = useState<{ url: string | null; color: string | null }>({ url: null, color: null });
  useEffect(() => {
    if (!enabled || !resolved) {
      return;
    }
    let cancelled = false;
    getPhotoColor(resolved).then((value) => {
      if (!cancelled) {
        setState({ url: resolved, color: value });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolved, enabled]);
  return state.url === resolved ? state.color : null;
}
