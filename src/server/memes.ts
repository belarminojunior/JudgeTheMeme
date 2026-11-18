// Meme templates bundled with the game: blank (text-free) images saved in public/memes/.
// No API is called at runtime. Add more with `npm run memes:fetch` (see scripts/fetch-memes.mjs).
import { STOCK_PHOTOS } from "../lib/photos";
import library from "../lib/meme-library.json";

const LOCAL = (library as { file: string }[]).map((m) => `/memes/${m.file}`);

export async function getMemePool(): Promise<string[]> {
  return LOCAL.length ? LOCAL : STOCK_PHOTOS;
}
