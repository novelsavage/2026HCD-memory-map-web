import * as THREE from "three";
import type { Memory } from "./data";
import { GENRE_COLORS, GENRE_FALLBACK_COLOR, MARKER } from "./config";

const FONT =
  "'DotGothic16', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";

export interface TextLabelResult {
  texture: THREE.CanvasTexture;
  planeWidth: number;
  planeHeight: number;
}

let fontReady: Promise<void> | null = null;

function ensureFont(): Promise<void> {
  if (!fontReady) {
    fontReady = document.fonts
      .load(`${MARKER.labelFontSize}px ${FONT}`)
      .then(() => undefined);
  }
  return fontReady;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let line = "";

  for (const ch of text) {
    if (ch === "\n") {
      if (line) lines.push(line);
      line = "";
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = line + ch;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }

  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (
    text.length > 0 &&
    lines.length === maxLines &&
    (text.includes("\n")
      ? lines.join("").length < text.replace(/\n/g, "").length
      : lines.join("").length < text.length)
  ) {
    const last = lines[maxLines - 1];
    let trimmed = last;
    while (trimmed.length > 0 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    lines[maxLines - 1] = `${trimmed}…`;
  }

  return lines.length > 0 ? lines : [""];
}

/** memory_text を Canvas テクスチャに描く（Unity PinText 相当） */
export async function createTextLabelTexture(
  memory: Memory
): Promise<TextLabelResult> {
  await ensureFont();

  const pad = MARKER.labelPadding;
  const fontSize = MARKER.labelFontSize;
  const lineHeight = fontSize * MARKER.labelLineHeight;
  const canvasWidth = MARKER.labelCanvasWidth;
  const maxTextWidth = canvasWidth - pad * 2 - MARKER.labelBorderWidth;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;

  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT}`;

  const genre = memory.genre || "上記以外";
  const genreColor = GENRE_COLORS[genre] || GENRE_FALLBACK_COLOR;
  const lines = wrapLines(
    ctx,
    memory.memory_text || "",
    maxTextWidth,
    MARKER.labelMaxLines
  );

  const contentHeight = pad * 2 + lines.length * lineHeight;
  canvas.height = Math.max(Math.ceil(contentHeight), 64);

  ctx.fillStyle = "rgba(5, 13, 8, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = genreColor;
  ctx.fillRect(0, 0, MARKER.labelBorderWidth, canvas.height);

  ctx.fillStyle = "#e8f5ec";
  ctx.font = `${fontSize}px ${FONT}`;
  ctx.textBaseline = "top";
  let y = pad;
  for (const line of lines) {
    ctx.fillText(line, pad + MARKER.labelBorderWidth, y);
    y += lineHeight;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const aspect = canvas.width / canvas.height;
  const planeHeight = MARKER.labelPlaneHeight;
  const planeWidth = planeHeight * aspect;

  return { texture, planeWidth, planeHeight };
}
