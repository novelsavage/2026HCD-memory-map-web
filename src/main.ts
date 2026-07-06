import * as THREE from "three";
import { createSceneContext, HOME_CAMERA_POS } from "./scene";
import { loadCampusModel, snapToGround } from "./campus";
import { loadSurroundings } from "./surroundings";
import { loadMemories } from "./data";
import { MemoryMarkers, isInMapBounds } from "./cards";
import { AutoTour } from "./tour";
import { UI } from "./ui";
import { CALIBRATION, MODEL_TRANSFORM, SURROUNDINGS } from "./config";

async function main(): Promise<void> {
  const container = document.getElementById("app")!;
  const ctx = createSceneContext(container);
  const markers = new MemoryMarkers();
  ctx.scene.add(markers.group);

  const tour = new AutoTour(ctx.camera, ctx.controls, (active) =>
    ui.setTourActive(active)
  );

  const ui = new UI({
    onFilterChange: (predicate) => {
      const visible = markers.applyFilter(predicate);
      ui.updateCount(visible, total, source);
    },
    onTourToggle: () => tour.toggle(),
    onResetView: () => {
      ctx.controls.target.set(0, 0, 0);
      ctx.camera.position.copy(HOME_CAMERA_POS);
    }
  });

  // --- 読み込み（モデルとデータを並行して） ---
  ui.setLoadingText("キャンパスモデルを読み込み中…");
  const [campus, loaded] = await Promise.all([
    loadCampusModel((ratio) =>
      ui.setLoadingText(`キャンパスモデルを読み込み中… ${Math.round(ratio * 100)}%`)
    ),
    loadMemories()
  ]);
  ctx.scene.add(campus.group);

  // OSM 周辺市街地（キャンパスモデルの XZ 範囲内の建物は生成しない）
  ui.setLoadingText("周辺の街並みを生成中…");
  const campusBox = new THREE.Box3().setFromObject(campus.group);
  const surroundingsBaseY = campusBox.min.y + SURROUNDINGS.baseOffsetFromCampusMin;
  const surroundings = await loadSurroundings(
    new THREE.Box2(
      new THREE.Vector2(campusBox.min.x, campusBox.min.z),
      new THREE.Vector2(campusBox.max.x, campusBox.max.z)
    ),
    campus.raycastTargets,
    surroundingsBaseY
  );
  if (surroundings) {
    ctx.scene.add(surroundings.group);
  }
  const groundFallbackY = surroundings?.baseY ?? campusBox.min.y;
  const campusGroundTargets = campus.raycastTargets;
  const surroundingsGroundTargets = surroundings?.raycastTargets ?? [];

  const { memories, source } = loaded;
  const mapMemories = memories.filter(isInMapBounds);
  const total = mapMemories.length;
  ui.setLoadingText("思い出を配置中…");

  ctx.scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  await markers.spawn(mapMemories, (x, z) =>
    snapToGround(
      x,
      z,
      campusGroundTargets,
      surroundingsGroundTargets,
      groundFallbackY,
      raycaster
    )
  );

  ui.buildFilters(mapMemories);
  ui.updateCount(total, total, source);
  ui.finishLoading();
  if (source === "demo") {
    ui.toast("Supabase 未接続のためデモデータを表示しています（.env を設定してください）");
  }

  // --- クリックで思い出選択 ---
  const pointer = new THREE.Vector2();
  let downAt = { x: 0, y: 0, t: 0 };
  ctx.renderer.domElement.addEventListener("pointerdown", (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  ctx.renderer.domElement.addEventListener("pointerup", (e) => {
    // ドラッグと区別
    if (
      Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 ||
      performance.now() - downAt.t > 400
    ) {
      return;
    }
    pointer.set(
      (e.clientX / innerWidth) * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1
    );
    const memory = markers.pick(pointer, ctx.camera);
    if (memory) {
      ui.showDetail(memory);
      const worldPos = markers.worldPositionOf(memory);
      if (worldPos) focusTarget.copy(worldPos);
      focusing = true;
    } else {
      ui.closeDetail();
    }
  });

  // カメラフォーカス（クリックしたマーカーへ滑らかに寄る）
  const focusTarget = new THREE.Vector3();
  let focusing = false;
  addEventListener("wheel", () => (focusing = false), { passive: true });
  ctx.renderer.domElement.addEventListener("pointerdown", () => (focusing = false));

  // --- コンパス（カメラ方位に追従。クリックで北向きへ） ---
  const compassDial = document.getElementById("compass-dial")!;
  document.getElementById("compass")!.addEventListener("click", () => {
    const offset = ctx.camera.position.clone().sub(ctx.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta = 0; // 北向き（-Z を向く）
    offset.setFromSpherical(spherical);
    ctx.camera.position.copy(ctx.controls.target).add(offset);
  });

  // --- デバッグ（キャリブレーション用）: ?debug=1 ---
  if (new URLSearchParams(location.search).has("debug")) {
    setupDebugGui(ctx.scene, campus.group, surroundings);
  }

  // --- メインループ ---
  const clock = new THREE.Clock();
  function animate(): void {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    markers.update(dt, ctx.camera);
    tour.update(dt);

    if (focusing) {
      ctx.controls.target.lerp(focusTarget, 1 - Math.pow(0.001, dt));
      const desired = focusTarget
        .clone()
        .add(
          ctx.camera.position.clone().sub(ctx.controls.target).setLength(45)
        );
      ctx.camera.position.lerp(desired, 1 - Math.pow(0.01, dt));
      if (ctx.controls.target.distanceTo(focusTarget) < 0.5) focusing = false;
    }

    ctx.controls.update();
    compassDial.style.transform = `rotate(${THREE.MathUtils.radToDeg(
      ctx.controls.getAzimuthalAngle()
    )}deg)`;
    ctx.render();
  }
  animate();
}

async function setupDebugGui(
  scene: THREE.Scene,
  campusGroup: THREE.Object3D,
  surroundings: Awaited<ReturnType<typeof loadSurroundings>>
): Promise<void> {
  const { GUI } = await import("lil-gui");
  const gui = new GUI({ title: "キャリブレーション" });

  scene.add(new THREE.AxesHelper(100));
  const originMarker = new THREE.Mesh(
    new THREE.SphereGeometry(2, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff4060 })
  );
  scene.add(originMarker);

  const geo = gui.addFolder("Geo (config.CALIBRATION)");
  geo.add(CALIBRATION, "unitsPerMeter", 0.01, 10);
  geo.add(CALIBRATION, "yawDeg", -180, 180);
  geo.add(CALIBRATION, "invertEastWest");
  geo.add(CALIBRATION, "invertNorthSouth");
  geo.add(CALIBRATION, "offsetX", -500, 500);
  geo.add(CALIBRATION, "offsetZ", -500, 500);

  const model = gui.addFolder("Model (config.MODEL_TRANSFORM)");
  const applyModel = () => {
    campusGroup.scale.setScalar(MODEL_TRANSFORM.scale);
    campusGroup.rotation.y = (MODEL_TRANSFORM.yawDeg * Math.PI) / 180;
    campusGroup.position.set(
      MODEL_TRANSFORM.offsetX,
      MODEL_TRANSFORM.offsetY,
      MODEL_TRANSFORM.offsetZ
    );
    campusGroup.updateWorldMatrix(true, true);
    if (surroundings) {
      const campusMinY = new THREE.Box3().setFromObject(campusGroup).min.y;
      const nextBaseY = campusMinY + SURROUNDINGS.baseOffsetFromCampusMin;
      surroundings.group.position.y = nextBaseY - surroundings.baseY;
    }
  };
  model.add(MODEL_TRANSFORM, "scale", 0.01, 10).onChange(applyModel);
  model.add(MODEL_TRANSFORM, "yawDeg", -180, 180).onChange(applyModel);
  model.add(MODEL_TRANSFORM, "offsetX", -500, 500).onChange(applyModel);
  model.add(MODEL_TRANSFORM, "offsetY", -100, 100).onChange(applyModel);
  model.add(MODEL_TRANSFORM, "offsetZ", -500, 500).onChange(applyModel);

  gui.add(
    {
      dump: () => {
        console.log("CALIBRATION =", JSON.stringify(CALIBRATION, null, 2));
        console.log("MODEL_TRANSFORM =", JSON.stringify(MODEL_TRANSFORM, null, 2));
      }
    },
    "dump"
  ).name("設定を console に出力");

  console.info(
    "[debug] 値を調整後「設定を console に出力」を押し、src/config.ts に書き戻してください。" +
      "※ Geo 系とマーカーの接地位置は再計算が必要なためリロードして反映確認してください。"
  );
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById("loading-text");
  if (el) el.textContent = `読み込みに失敗しました: ${err.message ?? err}`;
});
