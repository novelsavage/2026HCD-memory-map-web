# AGENTS.md

## プロジェクト概要

麗澤大学ホームカミングデー 2026「思い出マップ」の閲覧用 3D Web サイト。
Vite + TypeScript + Three.js（フレームワーク無しの vanilla DOM UI）。

## 関連リポジトリ

- `novelsavage/2026HCD-memory-map-ocr` — OCR/レビュー/配信パイプライン。Supabase `memories` テーブルと R2 カード画像はここが生成する
- `ObaShion/hcd-mapping-v2` — Unity 版（googleMaps ブランチが最新）。本サイトはその演出の Web 移植。キャンパスモデル `Re_map02.glb` の出典

## 重要な前提

- Supabase の URL / anon キーは `.env`（コミット禁止）。未設定時はデモデータで動くのが正常挙動
- 緯度経度→平面座標は `src/geo.ts`。原点・回転・縮尺は `src/config.ts` の `CALIBRATION`。実測キャリブレーションは `?debug=1` の GUI で行い config に書き戻す運用
- `public/models/campus.glb` は生成物（Draco+WebP 圧縮済み）。編集しない。元は Google Earth 3D Tiles を Blender で切り出した unlit モデル（Unity リポジトリの Re_map02.glb = Re_mapblend.glb）
- デフォルトはテクスチャ表示。`?holo` でワイヤーフレーム表示。UI テーマはダーク+グリーン、フォントは OCR 側 WebApp と同じ Bitcount + DotGothic16（Google Fonts CDN）
- ジャンル 6 色は OCR 側 `capture-form.tsx` の定義と揃えること（勝手に変えない）
- `reitaku_dummy` は「true=大学内 / false=大学外」。名前に反してダミーデータの意味ではない

## 検証

`npm run build`（tsc + vite build）が通ること。表示確認は `npm run dev` か
`npx vite preview` をブラウザで開く。デモデータは `?demo=1`。
