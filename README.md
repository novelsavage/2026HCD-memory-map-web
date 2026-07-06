# 思い出マップ 2026 Web ビューア

麗澤大学ホームカミングデー 2026「思い出マップ」で来場者が書いてくれた思い出を、
ブラウザだけで眺められる 3D ビューア。会場展示用 Unity 版
（[hcd-mapping-v2](https://github.com/ObaShion/hcd-mapping-v2) googleMaps ブランチ）の
演出を Three.js で Web に移植・発展させたもの。

**🌐 ライブデモ: https://2026-hcd-memory-map-web.vercel.app**

<!-- TODO: docs/screenshots/ にスクリーンショットを配置（プライバシー配慮のため ?demo=1 のダミーデータで撮ること） -->

## 画面の構成

- **キャンパス**: Google Earth 由来のフォトリアル 3D モデル（テクスチャ焼き込み unlit）
- **周辺市街地**: 南柏駅・新柏駅を含む約 2.5km 四方を OSM データから
  発光ワイヤーフレームで生成（建物押し出し + 道路/鉄道ライン + 駅の光柱ラベル）
- **地面はあえて描画しない**: 平らな床と起伏のある実地形を接ぐと必ず浮きか陥没が
  見えるため、道路と建物の「光る回路」が夜に浮かぶ表現を採用（経緯は設計書 §9.5）
- **思い出**: ジャンル色のピン + `memory_text` の旗型テキストラベルを緯度経度どおりに
  配置（Unity 版 Pin.prefab 準拠）。クリックで詳細パネル + カメラフォーカス
- **UI**: ジャンル / 年代フィルター、コンパス（クリックで北向き）、
  無操作 40 秒で自動オービットツアー（展示モード）
- テーマは撮影 WebApp と同じ Bitcount + DotGothic16 のダーク + グリーン

## セットアップ

```bash
npm install
cp .env.example .env   # Supabase の URL と anon キーを記入
npm run dev
```

- `.env` 未設定でも `public/demo-memories.json` のダミーデータで動く（起動時にトースト表示）
- `npm run build` = 型チェック + 本番ビルド（これが CI 相当の検証）

## データソース

| ソース | 内容 |
|---|---|
| Supabase `public.memories` | 思い出メタデータ。[2026HCD-memory-map-ocr](https://github.com/novelsavage/2026HCD-memory-map-ocr) のパイプラインが書き込む。RLS により anon キーで読めるのは `status='published'` のみ |
| `public/osm-surroundings.json` | 周辺市街地（生成物）。`node scripts/fetch-osm.mjs` で Overpass API から再取得 |
| `public/models/campus.glb` | キャンパスモデル（生成物）。下記参照 |

- 3D 表示は `memory_text` を使用。`card_url`（R2 のカード PNG）は Web 版では未使用
- 緯度経度が `MAP_BOUNDS`（撮影 WebApp のミニマップと同一範囲）の外の思い出は非表示

## キャンパスモデル

`public/models/campus.glb`（7.7MB）は Unity 版リポジトリの
`Assets/ReitakuMap/Models/Re_map02.glb`（37MB、Google Earth Photorealistic 3D Tiles を
Blender で切り出したもの）を Draco + WebP 圧縮した生成物。再生成:

```bash
npx @gltf-transform/cli optimize Re_map02.glb public/models/campus.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

> ⚠️ Google 3D Tiles 由来モデルの再配布は規約上グレー。恒久公開の際の代替案は
> [docs/wide-area-map-plan.md](docs/wide-area-map-plan.md) と
> [docs/plateau-osm-plan.md](docs/plateau-osm-plan.md) を参照。

## 座標キャリブレーション

Unity 版 MemoryGeoProjector と同じ正距円筒近似。原点 (35.833956, 139.956178)
からの東西/南北メートルをワールド座標にする（実測済み・調整値は `src/config.ts`）。

再調整する場合は `?debug=1` で lil-gui を開き、
Geo（緯度経度変換）/ Model（モデル配置）/ Surroundings（市街地の高さ）を合わせて
「設定を console に出力」→ `src/config.ts` に書き戻す。
Geo と Model を動かした場合はリロードして反映を確認すること
（思い出の配置と市街地のくり抜きは起動時に計算されるため）。

## URL パラメータ

| パラメータ | 効果 |
|---|---|
| `?demo=1` | Supabase を使わずダミーデータ表示（スクショ撮影用にも） |
| `?debug=1` | キャリブレーション GUI + 軸/原点マーカー |
| `?holo` | キャンパスをホログラム調（発光ワイヤーフレーム）で表示 |
| `?nocity` | 周辺市街地を非表示 |
| `?plate=1` | 市街地の床プレートを表示（既定は床なし。比較用） |

## デプロイ

Vercel にデプロイ済み（main への push で自動デプロイ）。
環境変数 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` は
Vercel のプロジェクト設定に登録されており、**ビルド時に埋め込まれる**
（anon キーは RLS 前提の公開可能キー）。

他の静的ホスティングでも `npm run build` → `dist/` を置くだけで動く
（`base:'./'` なのでサブパス配信も可）。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [設計書.md](設計書.md) | 詳細アーキテクチャ（AI エージェント・後続開発者向け） |
| [AGENTS.md](AGENTS.md) | コーディングエージェント向けの前提・約束事 |
| [docs/wide-area-map-plan.md](docs/wide-area-map-plan.md) | 広域マップ化の選択肢とロードマップ |
| [docs/plateau-osm-plan.md](docs/plateau-osm-plan.md) | PLATEAU 活用調査・OSM 貢献プラン |

## クレジット

- 地図データ © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors（ODbL）
- キャンパス 3D モデル: Google Earth Photorealistic 3D Tiles 由来（ゼミチーム作成）
- 思い出データ: 麗澤大学ホームカミングデー 2026 来場者のみなさん
