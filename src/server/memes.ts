// Meme templates bundled with the game: blank (text-free) images saved in public/memes/.
// No API is called at runtime. Add more with `npm run memes:fetch` (see scripts/fetch-memes.mjs).
import { STOCK_PHOTOS } from "../lib/photos";
import library from "../lib/meme-library.json";

type Entry = { name: string; file: string; width: number; height: number };
const LOCAL = (library as Entry[]).map((m) => `/memes/${m.file}`);

/** Name, URL and size of every bundled meme, for the gallery screen. */
export const MEME_CATALOG = (library as Entry[]).map((m) => ({
  name: m.name,
  url: `/memes/${m.file}`,
  width: m.width,
  height: m.height,
}));

export async function getMemePool(): Promise<string[]> {
  return LOCAL.length ? LOCAL : STOCK_PHOTOS;
}
