import * as THREE from "three";
import type { Memory } from "./data";
import { GENRE_COLORS, GENRE_FALLBACK_COLOR } from "./config";

/**
 * card_url が無い・読めない場合に Canvas で描く代替カード。
 * R2 の公開カード PNG（正方形・白地）に寄せたデザイン。
 */
export function createFallbackCardTexture(memory: Memory): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const genre = memory.genre || "上記以外";
  const genreColor = GENRE_COLORS[genre] || GENRE_FALLBACK_COLOR;

  // 台紙
  ctx.fillStyle = "#fdfcf7";
  ctx.fillRect(0, 0, size, size);
  // ジャンル色の上帯
  ctx.fillStyle = genreColor;
  ctx.fillRect(0, 0, size, 56);
  ctx.fillStyle = "#1a2026";
  ctx.font = "bold 30px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(genre, 20, 30);
  if (memory.era) {
    ctx.textAlign = "right";
    ctx.fillText(memory.era, size - 20, 30);
    ctx.textAlign = "left";
  }

  // 本文（文字単位で折り返し）
  ctx.fillStyle = "#22303a";
  const fontSize = 36;
  ctx.font = `${fontSize}px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif`;
  const text = memory.memory_text || "";
  const maxWidth = size - 80;
  const lineHeight = fontSize * 1.6;
  let x = 40;
  let y = 120;
  for (const ch of text) {
    if (ch === "\n" || ctx.measureText(ch).width + x > 40 + maxWidth) {
      x = 40;
      y += lineHeight;
      if (y > size - 100) {
        ctx.fillText("…", x, y - lineHeight);
        break;
      }
      if (ch === "\n") continue;
    }
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width;
  }

  // ニックネーム
  if (memory.nickname) {
    ctx.fillStyle = "#5d707e";
    ctx.font = "26px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`— ${memory.nickname}`, size - 36, size - 44);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("anonymous");

/** card_url を試し、失敗したら Canvas カードへフォールバックする */
export function loadCardTexture(
  memory: Memory,
  onReady: (texture: THREE.Texture) => void
): void {
  if (!memory.card_url) {
    onReady(createFallbackCardTexture(memory));
    return;
  }
  textureLoader.load(
    memory.card_url,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      onReady(texture);
    },
    undefined,
    () => {
      console.warn(`カード画像の読み込みに失敗（CORS?）: ${memory.card_url}`);
      onReady(createFallbackCardTexture(memory));
    }
  );
}
