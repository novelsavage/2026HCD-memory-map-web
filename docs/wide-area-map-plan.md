# 広域マップ化プラン — 南柏・新柏など「大学の外の思い出」を地図に載せる

現状のマップは麗澤大学の敷地（約 260m × 240m）だけを描画しており、
大学外の思い出は上空の浮遊カードにしている。これを南柏駅・新柏駅・光ヶ丘周辺など
「思い出が生まれる生活圏」まで広げるための調査と段階プラン。

## 前提: 今のマップはどう作られたか

現行 `campus.glb` は **Google Maps Platform の Photorealistic 3D Tiles** を
Blender（Blosm などのアドオン）で範囲指定ダウンロード → glb 出力 →
gltf-transform で Draco + WebP 圧縮、という手順の産物（メンバー作）。
つまり**同じ手順を範囲を広げて回せば、自分たちで新しいマップは作れる**。

問題は「広さ × 品質 = データ量」と「規約」の 2 つ。

## データ量の見積もり

現行: 260m四方 ≒ 0.06km² で 94 万頂点 / 圧縮後 7.7MB。

| 範囲 | 面積比 | 同品質でベイクした場合（概算） |
|---|---|---|
| キャンパスのみ（現行） | ×1 | 7.7MB ✅ |
| +南柏駅（半径 1.5km） | ×110 | ~850MB ❌ 非現実的 |
| +新柏・光ヶ丘（4km四方） | ×250 | ~1.9GB ❌ 論外 |

→ **広域を同品質でベイクするのは不可能**。品質を落とすか、ストリーミングにするか、
写実をやめるかの三択になる。

## 選択肢の比較

### 案A: 解像度を落として広域ベイク（静的・現行構成のまま）

Blosm は取得時のズームレベル（LOD）を選べる。周辺部を粗いタイル
（建物の形は分かるがテクスチャは粗い）でベイクし、キャンパスだけ現行の高解像度を重ねる。

- 実装: `campus.glb`（高解像度・現行）+ `surroundings.glb`（低解像度・広域）の 2 枚重ね。
  campus.ts に 2 つ目のローダーを足すだけで済む
- 目標サイズ: 周辺 4km 四方を zoom 低めで 30〜80MB 程度
- ✅ 完全静的・オフライン可・実装変更が最小
- ⚠️ それでも初回ロードが数十 MB 級。境界の継ぎ目が見える
- ⚠️ 規約リスクは現行と同じ（後述）

### 案B: 3D Tiles をランタイムストリーミング（本命・恒久策）

[NASA-AMMOS/3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS)
（three.js 用 3D Tiles ランタイム）+ `GoogleCloudAuthPlugin` で
Photorealistic 3D Tiles を**ブラウザから直接ストリーミング**する。
Google Earth と同じ仕組みで、カメラに応じて必要なタイルだけ自動 LOD 読込。

- ✅ 世界中どこまでも表示できる。ベイク作業自体が不要になる
- ✅ Google の規約に沿った正規の使い方（attribution 表示も仕組みで出せる）
- ✅ Three.js のシーンにそのまま同居できる（カード演出は今のまま）
- ⚠️ Google Maps Platform の API キーが必要。従量課金
  （root tileset リクエスト単位。無料枠内で収まる規模だが、キーの公開サイト運用は
  リファラ制限必須）
- ⚠️ オフライン展示に使えない（会場 Wi-Fi 依存）
- ⚠️ 初期表示がネットワーク速度に左右される
- 実装規模: campus.ts を差し替える形で +200〜300 行程度。
  `?stream` フラグで現行ベイク版と切替共存できる

### 案C: CesiumJS へ載せ替え

Unity 側で `feature/kashiwa-cesium-scene` ブランチとして柏エリアの Cesium 実験実績あり。
Web でも CesiumJS + Google 3D Tiles / Cesium World Terrain が使える。

- ✅ 地図エンジンとして完成度が高い（地形・空・カメラ制御込み）
- ❌ Three.js の演出（ブルーム・カスタムカード・ホログラム）との統合コストが高い。
  実質的な作り直しになるため、本プロジェクトでは**非推奨**

### 案D: OSM データでスタイライズド広域（軽量・世界観重視）

OpenStreetMap のデータ（Blosm / Overpass API）から建物押し出し + 道路 + 鉄道 + 駅を
ジオメトリ生成し、`?holo` と同じ発光ワイヤーフレーム調で描く。
「キャンパスだけ写実、周辺は緑のホログラム」という画は世界観として筋が良い。

- ✅ 数 MB で 4km 四方が入る。完全静的・オフライン可・無料
- ✅ ライセンスが明快（ODbL。「© OpenStreetMap contributors」表示のみ）
- ✅ 駅名・道路などの「場所の手がかり」はむしろ写実より分かりやすい
- ⚠️ 写実性はない（航空写真の見た目にはならない）
- 実装: Blender でベイクして glb にする方法と、
  Overpass API から GeoJSON を取って Three.js で押し出す方法の 2 通り

## ⚠️ ライセンス上の重要な注意（現行モデルにも関わる）

Google Photorealistic 3D Tiles の利用規約は、タイルの**保存・再配布
（= Blender でベイクして glb を配る行為）を原則許可していない**。
現行の `campus.glb` もこのグレーゾーンにあり、公開リポジトリ・公開サイトで
配信し続けることにはリスクがある。

- 学内発表・研究デモの範囲なら実害は考えにくいが、
  **恒久公開するなら案B（正規ストリーミング）か案D（OSM）への移行が安全**
- この観点でも案Bが本命

## 推奨ロードマップ

| フェーズ | 内容 | 規模感 |
|---|---|---|
| Phase 1（済） | キャンパスベイク + 浮遊カード（現行） | — |
| Phase 2（済 2026-07-05） | **案D**: OSM スタイライズド広域を実装。範囲は OCR WebApp の MAP_BOUNDS（南柏駅は含む。新柏駅は範囲外なので広げる場合は fetch-osm.mjs の BBOX を拡大して再実行） | — |
| Phase 3 | **案B**: `?stream` フラグで 3DTilesRendererJS 版を実験実装。API キー・課金・パフォーマンスを評価 | 休日 2〜3 日 |
| Phase 4 | 評価結果で本線を決定（B に一本化 or B+D ハイブリッド）。campus.glb 配布の規約リスクもここで解消 | 判断のみ |

### Phase 2 に必要な追加実装（見積もり）

1. `geo.ts`: 変更不要（正距円筒近似は 4km 圏でも誤差 1m 未満）
2. `config.ts`: `maxDistanceFromOriginMeters` を 3000 → 広域範囲に合わせ拡大
3. `cards.ts`: 「大学外 = 浮遊」の分岐を「広域マップ内なら実座標に接地」へ変更
   （浮遊は座標なし・範囲外のフォールバックとして残す）
4. `campus.ts`: 周辺モデル（glb または GeoJSON 押し出し）のローダー追加
5. 駅名などのランドマークラベル（TextSprite）を数点置くと道案内になる

## 参考リンク

- Blosm (Blender OSM/Google 3D Tiles アドオン): https://github.com/vvoovv/blosm
- 3DTilesRendererJS: https://github.com/NASA-AMMOS/3DTilesRendererJS
- Google Photorealistic 3D Tiles: https://developers.google.com/maps/documentation/tile/3d-tiles
- Overpass API: https://overpass-api.de/
- Unity 側 Cesium 実験: hcd-mapping-v2 `feature/kashiwa-cesium-scene` ブランチ
