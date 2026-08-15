import { describe, expect, it } from "vitest";
import { personAlphaMask } from "@/lib/background-effects";

describe("personAlphaMask", () => {
  it("marca a pessoa (valor 0) como opaca e o fundo como transparente", () => {
    expect(personAlphaMask(new Uint8Array([0, 0, 1, 255, 1, 0]))).toEqual(
      new Uint8Array([255, 255, 0, 0, 0, 255]),
    );
  });
});
