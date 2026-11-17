import { STOCK_PHOTOS } from "./photos";

/** Client-side: get the meme template pool from our server (falls back to stock photos). */
export async function loadMemePool(): Promise<string[]> {
  try {
    const res = await fetch("/api/memes");
    const urls = (await res.json()) as string[];
    return Array.isArray(urls) && urls.length ? urls : STOCK_PHOTOS;
  } catch {
    return STOCK_PHOTOS;
  }
}
