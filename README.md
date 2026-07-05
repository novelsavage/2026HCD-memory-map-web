# 思い出マップ 2026 Web ビューア

麗澤大学ホームカミングデー 2026「思い出マップ」で来場者が書いてくれた思い出を、
ブラウザだけで見られる 3D サイト。Unity 版（hcd-mapping-v2）の演出を Three.js で再現している。

- Google Earth (Photorealistic 3D Tiles) 由来のテクスチャ付きキャンパス 3D モデル
- `?holo` でホログラム調（発光ワイヤーフレーム）表示に切り替え
- 周辺市街地（南柏駅まで約2.3km四方）を OSM データの発光ワイヤーフレームで描画
  （地図データ © OpenStreetMap contributors, ODbL）
- 思い出カードをジャンル色のピン付きで緯度経度どおりに配置
- 大学外の思い出はキャンパス上空のリングに浮遊
- ジャンル / 年代フィルター、カードクリックで詳細パネル + カメラフォーカス
- 一定時間操作が無いと自動オービットツアー（展示モード）

UI は撮影 WebApp と同じフォント（Bitcount + DotGothic16）のダーク + グリーンテーマ。

詳細設計は [設計書.md](設計書.md)、広域マップ化プランは
[docs/wide-area-map-plan.md](docs/wide-area-map-plan.md) を参照。

## セットアップ

```bash
npm install
cp .env.example .env   # Supabase の URL と anon キーを記入
npm run dev
```

`.env` が未設定でも `public/demo-memories.json` のデモデータで動く。
`?demo=1` を付けると強制的にデモデータ表示。

## データソース

- **Supabase** `public.memories`（[2026HCD-memory-map-ocr](https://github.com/novelsavage/2026HCD-memory-map-ocr) が書き込む）
  - RLS により anon キーで読めるのは `status='published'` のみ
  - `reitaku_dummy: true=大学内 / false=大学外`（大学外は上空に浮遊表示）
- **Cloudflare R2**: `card_url` のカード PNG。CORS で読めない場合は
  `memory_text` から Canvas でカードを自動生成してフォールバックする

## キャンパスモデル

`public/models/campus.glb` は Unity 版リポジトリ
[ObaShion/hcd-mapping-v2](https://github.com/ObaShion/hcd-mapping-v2)（googleMaps ブランチ）の
`Assets/ReitakuMap/Models/Re_map02.glb` を Draco + WebP 圧縮したもの（37MB → 7.7MB）。
実体は Google Earth Photorealistic 3D Tiles を Blender で切り出した
テクスチャ焼き込み（unlit）モデルで、`Re_mapblend.glb` と同一。

再生成する場合:

```bash
npx @gltf-transform/cli optimize Re_map02.glb public/models/campus.glb \
  --compress draco --texture-compress webp
```

## 座標キャリブレーション

Unity 版 MemoryGeoProjector と同じ正距円筒近似で、原点
(35.833956, 139.956178) からの東西/南北メートルを平面座標にしている。

モデルと実座標のズレは `?debug=1` で lil-gui を開いて調整し、
「設定を console に出力」で得た値を `src/config.ts` の
`CALIBRATION` / `MODEL_TRANSFORM` に書き戻す。

## URL パラメータ

| パラメータ | 効果 |
|---|---|
| `?demo=1` | Supabase を使わずデモデータ表示 |
| `?debug=1` | キャリブレーション GUI + 軸/原点マーカー表示 |
| `?holo` | ホログラム調（発光ワイヤーフレーム）表示 |
| `?nocity` | 周辺市街地を非表示 |

## デプロイ

`npm run build` → `dist/` を Cloudflare Pages / GitHub Pages 等に置くだけ
（`base: './'` なのでサブパス配信も可）。環境変数はビルド時に埋め込まれるため、
ホスティング側に `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を設定してビルドする。
