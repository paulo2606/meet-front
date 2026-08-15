import { afterEach, describe, expect, it, vi } from "vitest";
import { dominantColor, getPhotoColor } from "@/lib/photo-color";

function rgba(r: number, g: number, b: number, a = 255) {
  return [r, g, b, a];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dominantColor", () => {
  it("retorna null quando nao ha pixels opacos", () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(dominantColor(pixels, 2, 1)).toBeNull();
  });

  it("retorna a cor media do bucket dominante", () => {
    const pixels = new Uint8ClampedArray([...rgba(0, 0, 255), ...rgba(0, 0, 255), ...rgba(255, 0, 0), ...rgba(255, 0, 0), ...rgba(0, 0, 255), ...rgba(0, 0, 255)]);
    expect(dominantColor(pixels, 3, 2)).toBe("#0000ff");
  });

  it("agrupa tons proximos no mesmo bucket e faz a media", () => {
    const pixels = new Uint8ClampedArray([...rgba(100, 150, 200), ...rgba(101, 150, 200), ...rgba(102, 150, 200)]);
    expect(dominantColor(pixels, 3, 1)).toBe("#6596c8");
  });

  it("ignora pixels transparentes na conta", () => {
    const pixels = new Uint8ClampedArray([...rgba(10, 200, 10), ...rgba(0, 0, 0, 0), ...rgba(10, 200, 10)]);
    expect(dominantColor(pixels, 3, 1)).toBe("#0ac80a");
  });

  it("extrai a cor dominante da imagem carregada", async () => {
    vi.stubGlobal(
      "Image",
      class {
        crossOrigin: string | null = null;
        naturalWidth = 2;
        naturalHeight = 1;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([...rgba(0, 0, 255), ...rgba(255, 0, 0)]),
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData,
    } as unknown as CanvasRenderingContext2D);

    await expect(getPhotoColor("http://localhost:5028/avatars/foto-1.png")).resolves.toBe("#0000ff");
    expect(getImageData).toHaveBeenCalledWith(0, 0, 2, 1);
  });
});
