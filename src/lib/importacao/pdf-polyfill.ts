// O pdf.js (dentro do pdf-parse v2) referencia DOMMatrix, ImageData e Path2D ao
// carregar. No Node eles vêm do pacote nativo @napi-rs/canvas, que não chega à
// função da Vercel ("DOMMatrix is not defined"). Para extrair texto nada é
// desenhado: basta existir uma versão mínima dessas classes.

type Global = Record<string, unknown>;

class DOMMatrixMinimo {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(init?: number[]) {
    if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
  }
  get is2D() { return true; }
  get isIdentity() { return this.a === 1 && !this.b && !this.c && this.d === 1 && !this.e && !this.f; }
  multiplySelf(m: DOMMatrixMinimo) {
    const { a, b, c, d, e, f } = this;
    this.a = a * m.a + c * m.b; this.b = b * m.a + d * m.b;
    this.c = a * m.c + c * m.d; this.d = b * m.c + d * m.d;
    this.e = a * m.e + c * m.f + e; this.f = b * m.e + d * m.f + f;
    return this;
  }
  preMultiplySelf(m: DOMMatrixMinimo) { const r = new DOMMatrixMinimo([m.a, m.b, m.c, m.d, m.e, m.f]).multiplySelf(this); Object.assign(this, r); return this; }
  translateSelf(x = 0, y = 0) { return this.multiplySelf(new DOMMatrixMinimo([1, 0, 0, 1, x, y])); }
  scaleSelf(sx = 1, sy = sx) { return this.multiplySelf(new DOMMatrixMinimo([sx, 0, 0, sy, 0, 0])); }
  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (!det) { Object.assign(this, { a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN }); return this; }
    const { a, b, c, d, e, f } = this;
    Object.assign(this, { a: d / det, b: -b / det, c: -c / det, d: a / det, e: (c * f - d * e) / det, f: (b * e - a * f) / det });
    return this;
  }
  multiply(m: DOMMatrixMinimo) { return new DOMMatrixMinimo([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(m); }
  translate(x = 0, y = 0) { return new DOMMatrixMinimo([this.a, this.b, this.c, this.d, this.e, this.f]).translateSelf(x, y); }
  scale(sx = 1, sy = sx) { return new DOMMatrixMinimo([this.a, this.b, this.c, this.d, this.e, this.f]).scaleSelf(sx, sy); }
  inverse() { return new DOMMatrixMinimo([this.a, this.b, this.c, this.d, this.e, this.f]).invertSelf(); }
  transformPoint(p: { x?: number; y?: number } = {}) {
    const x = p.x ?? 0, y = p.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }
}

class ImageDataMinimo {
  data: Uint8ClampedArray; width: number; height: number;
  constructor(dataOuLargura: Uint8ClampedArray | number, largura?: number, altura?: number) {
    if (typeof dataOuLargura === "number") { this.width = dataOuLargura; this.height = largura ?? 0; this.data = new Uint8ClampedArray(this.width * this.height * 4); }
    else { this.data = dataOuLargura; this.width = largura ?? 0; this.height = altura ?? 0; }
  }
}

class Path2DMinimo {
  addPath() {} closePath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} rect() {} arc() {}
}

export function garantirPolyfillsPDF() {
  const g = globalThis as Global;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = DOMMatrixMinimo;
  if (typeof g.ImageData === "undefined") g.ImageData = ImageDataMinimo;
  if (typeof g.Path2D === "undefined") g.Path2D = Path2DMinimo;
}
