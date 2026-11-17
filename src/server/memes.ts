// Fetches the current top meme templates from Imgflip's public API.
// Images are hot-linked from Imgflip at runtime; nothing is copied into this project.
import { STOCK_PHOTOS } from "../lib/photos";

const TTL = 6 * 60 * 60 * 1000;
let cache: { at: number; urls: string[] } | null = null;

interface ImgflipMeme {
  url: string;
  width: number;
  height: number;
}

export async function getMemePool(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.urls;
  try {
    const res = await fetch("https://api.imgflip.com/get_memes", { signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as { success: boolean; data?: { memes: ImgflipMeme[] } };
    if (!json.success || !json.data) throw new Error("imgflip: unsuccessful response");
    // Skip extremely tall multi-panel templates; they're unreadable on a phone card.
    const urls = json.data.memes.filter((m) => m.height / m.width <= 1.6).map((m) => m.url);
    if (urls.length < 10) throw new Error("imgflip: too few memes");
    cache = { at: Date.now(), urls };
    return urls;
  } catch (err) {
    console.warn("[memes] falling back to stock photos:", (err as Error).message);
    return cache?.urls ?? STOCK_PHOTOS;
  }
}
