/** Hexes da paleta-marca. Espelham os tokens em `client/src/index.css`. */

export const BRAND = {
  signal: "#1DB5A3",
  signalHover: "#179E8E",
  signalInk: "#0C6B61",
  ink: "#132A44",
  paper: "#F7F5F0",
  night: "#0A0907",
  paper700: "#26231A",
  border: "#E4DDD2",
  muted: "#4A627C",
} as const;

/** Séries categóricas, da esquerda para a direita. */
export const DATA_COLORS = [
  "#1DB5A3",
  "#132A44",
  "#E8A33A",
  "#A1306F",
  "#6F4FA3",
  "#4A7CB8",
  "#D9D1BF",
] as const;

export const PROJECT_COLORS = DATA_COLORS;

function channel(hex: string, index: number) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

function contrast(a: string, b: string) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Paper ou ink, o que tiver mais contraste sobre o fundo. */
export function foregroundOn(background: string): string {
  return contrast(BRAND.paper, background) >= contrast(BRAND.ink, background)
    ? BRAND.paper
    : BRAND.ink;
}
