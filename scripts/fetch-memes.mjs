// Downloads blank (text-free) meme templates into public/memes/ and writes src/lib/meme-library.json.
// The game then serves these local files and never calls a meme API at runtime.
//
//   npm run memes:fetch
//
// Safe to re-run: files already on disk are kept, new templates are added.
// Sources: memegen.link (the library behind memecomplete.com) and Imgflip's popular templates.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "memes");
const MANIFEST = path.join(ROOT, "src", "lib", "meme-library.json");
const MAX_RATIO = 1.6; // skip very tall multi-panel templates: unreadable on a phone card
const MIN_SIDE = 200; // skip tiny images
const CONCURRENCY = 6;

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const key = (name) => slug(name).replace(/-/g, "");

/** Width/height from a JPEG, PNG or GIF header, without image libraries. */
function imageSize(buf) {
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), ext: "png" };
  if (buf.toString("ascii", 0, 3) === "GIF") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), ext: "gif" };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), ext: "jpg" };
      }
      i += 2 + len;
    }
  }
  return null;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function listTemplates() {
  const out = [];
  try {
    const memegen = await getJson("https://api.memegen.link/templates/");
    for (const t of memegen) out.push({ name: t.name, url: t.blank, source: "memegen" });
    console.log(`memegen: ${memegen.length} templates`);
  } catch (e) {
    console.warn("memegen failed:", e.message);
  }
  try {
    const imgflip = await getJson("https://api.imgflip.com/get_memes");
    for (const m of imgflip.data.memes) out.push({ name: m.name, url: m.url, source: "imgflip" });
    console.log(`imgflip: ${imgflip.data.memes.length} templates`);
  } catch (e) {
    console.warn("imgflip failed:", e.message);
  }
  // Same meme from both sources: keep one.
  const seen = new Set();
  return out.filter((t) => {
    const k = key(t.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const previous = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, "utf8")) : [];
  const onDisk = new Set(await readdir(OUT_DIR));

  const templates = await listTemplates();
  const library = [...previous.filter((m) => onDisk.has(m.file))];
  const known = new Set(library.map((m) => key(m.name)));
  const todo = templates.filter((t) => !known.has(key(t.name)));
  console.log(`${library.length} already downloaded, ${todo.length} to fetch`);

  let skipped = 0;
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const t = todo[next++];
      try {
        const res = await fetch(t.url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const size = imageSize(buf);
        if (!size || size.ext === "gif") throw new Error("not a still JPEG/PNG");
        if (size.h / size.w > MAX_RATIO || Math.min(size.w, size.h) < MIN_SIDE) {
          skipped++;
          continue;
        }
        let file = `${slug(t.name) || "meme"}.${size.ext}`;
        for (let n = 2; onDisk.has(file); n++) file = `${slug(t.name)}-${n}.${size.ext}`;
        onDisk.add(file);
        await writeFile(path.join(OUT_DIR, file), buf);
        library.push({ name: t.name, file, width: size.w, height: size.h, source: t.source });
      } catch (e) {
        failed++;
        console.warn(`  ✗ ${t.name}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  library.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(MANIFEST, JSON.stringify(library, null, 1) + "\n");
  console.log(`done: ${library.length} memes in public/memes (${skipped} too tall/small, ${failed} failed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
