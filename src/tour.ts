import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

const IDLE_SECONDS = 40;
const ORBIT_SPEED = 0.045; // rad/s

/**
 * 自動ツアー：カメラをゆっくり周回させる。
 * 手動ONのほか、一定時間操作が無いと自動で始まり、操作すると止まる。
 */
export class AutoTour {
  private idleTimer = 0;
  private manuallyEnabled = false;
  active = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private controls: OrbitControls,
    private onChange?: (active: boolean) => void
  ) {
    const interrupt = () => {
      this.idleTimer = 0;
      if (this.active && !this.manuallyEnabled) this.setActive(false);
      if (this.manuallyEnabled) {
        this.manuallyEnabled = false;
        this.setActive(false);
      }
    };
    for (const type of ["pointerdown", "wheel", "keydown", "touchstart"]) {
      addEventListener(type, interrupt, { passive: true });
    }
  }

  toggle(): void {
    this.manuallyEnabled = !this.manuallyEnabled;
    this.setActive(this.manuallyEnabled);
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.onChange?.(active);
  }

  update(dt: number): void {
    if (!this.active) {
      this.idleTimer += dt;
      if (this.idleTimer > IDLE_SECONDS) this.setActive(true);
      return;
    }
    // controls.target を中心に水平周回
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += ORBIT_SPEED * dt;
    // 見下ろし角も緩やかに揺らす
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi + Math.sin(performance.now() * 0.0001) * 0.0004,
      0.9,
      1.35
    );
    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }
}
