// Downloads blank (text-free) meme templates into public/memes/ and writes src/lib/meme-library.json.
// The game then serves these local files and never calls a meme API at runtime.
//
//   npm run memes:fetch
//
// Safe to re-run: files already on disk are kept, new templates are added.
// Sources: memegen.link (the library behind memecomplete.com), Imgflip's API top 100,
// and Imgflip's template catalog pages.
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "memes");
const MANIFEST = path.join(ROOT, "src", "lib", "meme-library.json");
// Templates never to download: { "Template name": "reason" }. Filled automatically
// (duplicates, images with text) and by hand (anything unfit for a party game).
const BLOCKLIST = path.join(ROOT, "scripts", "meme-blocklist.json");
const DUPLICATE_DISTANCE = 6; // max differing bits (of 64) for two images to count as the same picture
const MAX_RATIO = 1.6; // skip very tall multi-panel templates: unreadable on a phone card
const MIN_SIDE = 200; // skip tiny images
const MAX_BYTES = 1_500_000; // skip huge downloads
const MAX_WIDTH = 900; // stored images are resized to this width at most
const CONCURRENCY = 6;
// Imgflip catalog pages to read (40 templates each). Override: npm run memes:fetch -- --pages=20
const CATALOG_PAGES = Number(process.argv.find((a) => a.startsWith("--pages="))?.split("=")[1] ?? 12);

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

const decode = (s) =>
  s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * Imgflip's public template catalog (imgflip.com/memetemplates, allowed by its robots.txt),
 * 40 templates per page, most popular first. Pages are read one per second to be polite.
 */
async function listImgflipCatalog(pages) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const res = await fetch(`https://imgflip.com/memetemplates?page=${page}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; judge-the-meme template fetcher)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const re = /<h3 class="mt-title">\s*<a title="[^"]*" href="\/meme\/\d+\/[^"]*">([^<]+)<\/a>[\s\S]*?src="\/\/i\.imgflip\.com\/4\/([0-9a-z]+)\.jpg"/g;
      let found = 0;
      for (const m of html.matchAll(re)) {
        const id = m[2];
        // The thumbnail is always .jpg; the full blank is .jpg or .png.
        out.push({ name: decode(m[1]).trim(), url: [`https://i.imgflip.com/${id}.jpg`, `https://i.imgflip.com/${id}.png`], source: "imgflip" });
        found++;
      }
      if (!found) break; // past the last page
    } catch (e) {
      console.warn(`imgflip catalog page ${page} failed:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`imgflip catalog: ${out.length} templates from ${pages} pages`);
  return out;
}

async function download(urls) {
  let last = "";
  for (const url of [urls].flat()) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) return Buffer.from(await res.arrayBuffer());
    last = `HTTP ${res.status}`;
  }
  throw new Error(last || "no image");
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
  out.push(...(await listImgflipCatalog(CATALOG_PAGES)));
  // Same meme from more than one source: keep one.
  const seen = new Set();
  return out.filter((t) => {
    const k = key(t.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Shrink every image to a phone-friendly JPEG (≤ MAX_WIDTH px wide). Already-small JPEGs are left alone. */
async function optimize(library) {
  const { default: sharp } = await import("sharp");
  sharp.cache(false);
  let changed = 0;
  for (const m of library) {
    if (m.file.endsWith(".jpg") && m.width <= MAX_WIDTH) continue;
    const src = path.join(OUT_DIR, m.file);
    const file = m.file.replace(/\.(png|jpe?g)$/, ".jpg");
    // Read into memory first: on Windows sharp keeps a path it opened locked, so writing back fails.
    const { data, info } = await sharp(await readFile(src))
      .flatten({ background: "#ffffff" }) // PNG transparency → white card background
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (file !== m.file && existsSync(path.join(OUT_DIR, file))) continue; // name clash: keep the original
    await writeFile(path.join(OUT_DIR, file), data);
    if (file !== m.file) await unlink(src);
    Object.assign(m, { file, width: info.width, height: info.height });
    changed++;
  }
  if (changed) console.log(`optimized ${changed} images`);
}

/** 64-bit difference hash: near-identical pictures get near-identical hashes. */
async function dHash(sharp, file) {
  const px = await sharp(await readFile(file)).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}
const hamming = (a, b) => {
  let v = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  for (; v; v >>= 1n) n += Number(v & 1n);
  return n;
};

/**
 * Checks every image not yet checked: drops near-duplicates of an image we already have and
 * images with readable text baked in (OCR). Dropped names go to the blocklist so they are
 * never downloaded again. Checked images are marked, so later runs only check new ones.
 */
async function clean(library, blocklist) {
  const pending = library.filter((m) => !m.checked);
  if (!pending.length) return library;
  const { default: sharp } = await import("sharp");
  const { createWorker } = await import("tesseract.js");
  const ocr = await createWorker("eng");
  const priority = { memegen: 0, imgflip: 1 };
  pending.sort((a, b) => (priority[a.source] ?? 2) - (priority[b.source] ?? 2));
  const kept = library.filter((m) => m.checked);
  let dupes = 0;
  let texty = 0;
  for (const m of pending) {
    const file = path.join(OUT_DIR, m.file);
    const hash = await dHash(sharp, file);
    const twin = kept.find((k) => k.hash && hamming(k.hash, hash) <= DUPLICATE_DISTANCE);
    let reason = twin ? `duplicate of "${twin.name}"` : null;
    if (!reason) {
      const { data } = await ocr.recognize(await readFile(file));
      const words = data.words.filter((w) => w.confidence > 75 && /^[A-Za-z]{3,}[!?.,']*$/.test(w.text));
      if (words.length >= 2) reason = `has text: ${words.slice(0, 6).map((w) => w.text).join(" ")}`;
    }
    if (reason) {
      blocklist[m.name] = reason;
      await unlink(file);
      if (reason.startsWith("duplicate")) dupes++;
      else texty++;
      continue;
    }
    kept.push(Object.assign(m, { hash, checked: true }));
  }
  await ocr.terminate();
  console.log(`checked ${pending.length}: removed ${dupes} duplicates and ${texty} with text`);
  return kept;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const previous = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, "utf8")) : [];
  const blocklist = existsSync(BLOCKLIST) ? JSON.parse(await readFile(BLOCKLIST, "utf8")) : {};
  const blocked = new Set(Object.keys(blocklist).map(key));
  const onDisk = new Set(await readdir(OUT_DIR));

  const templates = (await listTemplates()).filter((t) => !blocked.has(key(t.name)));
  // Names added to the blocklist by hand are removed from the library on the next run.
  for (const m of previous) {
    if (blocked.has(key(m.name)) && onDisk.has(m.file)) {
      await unlink(path.join(OUT_DIR, m.file));
      onDisk.delete(m.file);
    }
  }
  let library = [...previous.filter((m) => onDisk.has(m.file))];
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
        const buf = await download(t.url);
        const size = imageSize(buf);
        if (!size || size.ext === "gif") throw new Error("not a still JPEG/PNG");
        if (size.h / size.w > MAX_RATIO || Math.min(size.w, size.h) < MIN_SIDE || buf.length > MAX_BYTES) {
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

  await optimize(library);
  library = await clean(library, blocklist);
  library.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(MANIFEST, JSON.stringify(library, null, 1) + "\n");
  const sortedBlocklist = Object.fromEntries(Object.entries(blocklist).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(BLOCKLIST, JSON.stringify(sortedBlocklist, null, 1) + "\n");
  console.log(`done: ${library.length} memes in public/memes (${skipped} too tall/small/large, ${failed} failed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
