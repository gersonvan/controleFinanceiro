import { describe, expect, it } from "vitest";
import { garantirPolyfillsPDF } from "./pdf-polyfill";

describe("polyfills do pdf.js para o servidor", () => {
  it("define DOMMatrix, ImageData e Path2D quando faltam, com a matemática 2D básica", () => {
    const g = globalThis as Record<string, unknown>;
    const antes = { DOMMatrix: g.DOMMatrix, ImageData: g.ImageData, Path2D: g.Path2D };
    delete g.DOMMatrix; delete g.ImageData; delete g.Path2D;
    try {
      garantirPolyfillsPDF();
      const M = g.DOMMatrix as new (i?: number[]) => { translateSelf(x: number, y: number): unknown; scaleSelf(s: number): unknown; transformPoint(p: { x: number; y: number }): { x: number; y: number }; inverse(): { transformPoint(p: { x: number; y: number }): { x: number; y: number } } };
      const m = new M();
      m.translateSelf(10, 5); m.scaleSelf(2);
      expect(m.transformPoint({ x: 1, y: 1 })).toMatchObject({ x: 12, y: 7 });
      expect(m.inverse().transformPoint({ x: 12, y: 7 })).toMatchObject({ x: 1, y: 1 });
      expect(typeof g.ImageData).toBe("function");
      expect(typeof g.Path2D).toBe("function");
    } finally {
      Object.assign(g, antes);
    }
  });
});
