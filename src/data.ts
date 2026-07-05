import { EVENT_ID } from "./config";

export interface Memory {
  id: string;
  event_id: string;
  nickname: string | null;
  memory_text: string | null;
  genre: string | null;
  era: string | null;
  latitude: number | null;
  longitude: number | null;
  captured_at: string | null;
  card_url: string | null;
  reitaku_dummy: boolean; // true = 大学内 / false = 大学外
}

export interface LoadResult {
  memories: Memory[];
  source: "supabase" | "demo";
}

function isDemoForced(): boolean {
  return new URLSearchParams(location.search).has("demo");
}

async function fetchFromSupabase(url: string, anonKey: string): Promise<Memory[]> {
  const endpoint =
    `${url.replace(/\/$/, "")}/rest/v1/memories` +
    `?select=*` +
    `&status=eq.published` +
    `&event_id=eq.${encodeURIComponent(EVENT_ID)}` +
    `&order=captured_at.asc.nullslast`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
    }
  });
  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Memory[];
}

async function fetchDemo(): Promise<Memory[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}demo-memories.json`);
  if (!res.ok) throw new Error("demo-memories.json の読み込みに失敗しました");
  return (await res.json()) as Memory[];
}

export async function loadMemories(): Promise<LoadResult> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!isDemoForced() && url && anonKey) {
    try {
      const memories = await fetchFromSupabase(url, anonKey);
      if (memories.length > 0) return { memories, source: "supabase" };
      console.warn("Supabase に published レコードが無いためデモデータを表示します");
    } catch (err) {
      console.error("Supabase 取得に失敗。デモデータへフォールバックします:", err);
    }
  }
  return { memories: await fetchDemo(), source: "demo" };
}
