import type { Memory } from "./data";
import { GENRE_COLORS, GENRE_FALLBACK_COLOR } from "./config";

export interface UICallbacks {
  onFilterChange: (predicate: (memory: Memory) => boolean) => void;
  onTourToggle: () => void;
  onResetView: () => void;
}

export class UI {
  private activeGenres = new Set<string>();
  private activeEras = new Set<string>();
  private allGenres: string[] = [];
  private allEras: string[] = [];

  constructor(private callbacks: UICallbacks) {
    document.getElementById("tour-btn")!.addEventListener("click", callbacks.onTourToggle);
    document.getElementById("reset-btn")!.addEventListener("click", callbacks.onResetView);
    document.getElementById("detail-close")!.addEventListener("click", () => this.closeDetail());
  }

  buildFilters(memories: Memory[]): void {
    const genreSet = new Set<string>();
    const eraSet = new Set<string>();
    for (const m of memories) {
      genreSet.add(m.genre || "上記以外");
      if (m.era) eraSet.add(m.era);
    }
    // ジャンルは定義順、年代は文字列昇順（1960年代 → 2025年代）
    this.allGenres = Object.keys(GENRE_COLORS).filter((g) => genreSet.has(g));
    for (const g of genreSet) if (!this.allGenres.includes(g)) this.allGenres.push(g);
    this.allEras = [...eraSet].sort();
    this.activeGenres = new Set(this.allGenres);
    this.activeEras = new Set(this.allEras);

    const genreContainer = document.getElementById("genre-chips")!;
    genreContainer.innerHTML = "";
    for (const genre of this.allGenres) {
      const chip = document.createElement("button");
      chip.className = "chip";
      const color = GENRE_COLORS[genre] || GENRE_FALLBACK_COLOR;
      chip.innerHTML = `<span class="dot" style="background:${color}"></span>${genre}`;
      chip.addEventListener("click", () => {
        this.toggleSet(this.activeGenres, genre, this.allGenres);
        chip.classList.toggle("off", !this.activeGenres.has(genre));
        this.refreshChips(genreContainer, this.activeGenres);
        this.emitFilter();
      });
      genreContainer.appendChild(chip);
    }

    const eraContainer = document.getElementById("era-chips")!;
    eraContainer.innerHTML = "";
    for (const era of this.allEras) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = era;
      chip.addEventListener("click", () => {
        this.toggleSet(this.activeEras, era, this.allEras);
        chip.classList.toggle("off", !this.activeEras.has(era));
        this.refreshChips(eraContainer, this.activeEras);
        this.emitFilter();
      });
      eraContainer.appendChild(chip);
    }
  }

  /** 全選択状態で1つクリック→それだけに絞る。以降はトグル。全部消えたら全選択に戻す。 */
  private toggleSet(set: Set<string>, value: string, all: string[]): void {
    if (set.size === all.length) {
      set.clear();
      set.add(value);
    } else if (set.has(value)) {
      set.delete(value);
      if (set.size === 0) for (const v of all) set.add(v);
    } else {
      set.add(value);
    }
  }

  private refreshChips(container: HTMLElement, active: Set<string>): void {
    const chips = container.querySelectorAll<HTMLElement>(".chip");
    chips.forEach((chip) => {
      const label = chip.textContent || "";
      chip.classList.toggle("off", !active.has(label.trim()));
    });
  }

  private emitFilter(): void {
    const genres = this.activeGenres;
    const eras = this.activeEras;
    const allEras = this.allEras;
    this.callbacks.onFilterChange((memory) => {
      const genreOk = genres.has(memory.genre || "上記以外");
      const eraOk = !memory.era ? eras.size === allEras.length : eras.has(memory.era);
      return genreOk && eraOk;
    });
  }

  updateCount(visible: number, total: number, source: string): void {
    const el = document.getElementById("count")!;
    const badge = source === "demo" ? "（デモデータ）" : "";
    el.innerHTML = `<b>${visible}</b> / ${total} 件の思い出${badge}`;
  }

  showDetail(memory: Memory): void {
    const genre = memory.genre || "上記以外";
    const genreTag = document.getElementById("detail-genre")!;
    genreTag.textContent = genre;
    genreTag.style.background = GENRE_COLORS[genre] || GENRE_FALLBACK_COLOR;
    document.getElementById("detail-era")!.textContent = memory.era || "";
    document.getElementById("detail-text")!.textContent = memory.memory_text || "";
    document.getElementById("detail-nick")!.textContent = memory.nickname
      ? `— ${memory.nickname}`
      : "";
    document.getElementById("detail")!.classList.add("open");
  }

  closeDetail(): void {
    document.getElementById("detail")!.classList.remove("open");
  }

  setTourActive(active: boolean): void {
    const btn = document.getElementById("tour-btn")!;
    btn.textContent = active ? "⏸ ツアー停止" : "🎥 自動ツアー";
  }

  setLoadingText(text: string): void {
    const el = document.getElementById("loading-text");
    if (el) el.textContent = text;
  }

  finishLoading(): void {
    document.getElementById("loading")!.classList.add("done");
  }

  toast(message: string, ms = 4000): void {
    const el = document.getElementById("toast")!;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), ms);
  }
}
