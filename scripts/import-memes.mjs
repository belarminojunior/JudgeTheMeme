// Adds your own meme pictures (for example Mozambican memes saved from WhatsApp or Facebook) to the
// game, after you have looked at them.
//
//   1. Put the pictures in memes-inbox/ (JPEG, PNG or WebP). The file name becomes the meme's
//      name: "chapa-cheio.jpg" → "Chapa cheio". Rename files to change names.
//   2. npm run memes:import
//      Writes memes-inbox/review.html: every picture with its name and any problem found
//      (already in the game, same picture twice, too tall, too small). Open it in a browser and
//      delete from memes-inbox/ anything you don't want.
//   3. npm run memes:import -- --apply
//      Adds the pictures that have no problem to public/memes/ (WebP + thumbnail) and to
//      src/lib/meme-library.json, then moves the originals to memes-inbox/imported/.
//
// Options: --source=mozambique (label saved in the library; default "mozambique").
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const INBOX = path.join(ROOT, "memes-inbox");
const DONE = path.join(INBOX, "imported");
const OUT_DIR = path.join(ROOT, "public", "memes");
const THUMB_DIR = path.join(OUT_DIR, "thumbs");
const MANIFEST = path.join(ROOT, "src", "lib", "meme-library.json");
// Same settings as scripts/fetch-memes.mjs.
const DUPLICATE_DISTANCE = 6;
const MAX_RATIO = 1.6;
const MIN_SIDE = 200;
const MAX_WIDTH = 720;
const WEBP_QUALITY = 74;
const THUMB_WIDTH = 240;
const THUMB_QUALITY = 60;

const APPLY = process.argv.includes("--apply");
const SOURCE = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1] ?? "mozambique";

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const nameOf = (file) => {
  const base = path.parse(file).name.replace(/[-_]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** 64-bit difference hash, as in fetch-memes.mjs. */
async function dHash(buf) {
  const px = await sharp(buf).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
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

async function main() {
  await mkdir(INBOX, { recursive: true });
  sharp.cache(false);
  const library = JSON.parse(await readFile(MANIFEST, "utf8"));
  const files = (await readdir(INBOX, { withFileTypes: true }))
    .filter((d) => d.isFile() && /\.(jpe?g|png|webp)$/i.test(d.name))
    .map((d) => d.name)
    .sort();
  if (!files.length) {
    console.log("memes-inbox/ is empty: put JPEG, PNG or WebP pictures there first.");
    return;
  }

  // Hash the images as they are on disk now (the hashes saved in the library were taken before
  // the WebP conversion and drift by a few bits).
  const current = new Map();
  for (const m of library) current.set(m.file, await dHash(await readFile(path.join(OUT_DIR, m.file))));

  const items = [];
  for (const file of files) {
    const buf = await readFile(path.join(INBOX, file));
    const item = { file, name: nameOf(file), problem: null };
    try {
      // Phone photos often carry an EXIF rotation: apply it so the picture is upright.
      const meta = await sharp(buf).rotate().metadata();
      const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
      item.hash = await dHash(buf);
      const known = library.find((m) => hamming(current.get(m.file), item.hash) <= DUPLICATE_DISTANCE);
      const twin = items.find((o) => o.hash && hamming(o.hash, item.hash) <= DUPLICATE_DISTANCE);
      const sameName = library.find((m) => slug(m.name) === slug(item.name));
      if (known) item.problem = `already in the game as "${known.name}"`;
      else if (twin) item.problem = `same picture as ${twin.file}`;
      else if (sameName) item.problem = `a meme is already called "${sameName.name}": rename the file`;
      else if (h / w > MAX_RATIO) item.problem = `too tall (${w}×${h}): crop it`;
      else if (Math.min(w, h) < MIN_SIDE) item.problem = `too small (${w}×${h})`;
      item.size = `${w}×${h}`;
    } catch (e) {
      item.problem = `can't read the image (${e.message})`;
    }
    items.push(item);
  }

  if (!APPLY) {
    const cards = items
      .map(
        (i) => `<figure class="${i.problem ? "bad" : ""}"><img src="${encodeURI(i.file)}" loading="lazy"><figcaption><b>${esc(i.name)}</b><small>${esc(i.file)} · ${esc(i.size ?? "?")}</small>${i.problem ? `<em>✗ ${esc(i.problem)}</em>` : "<span>✓ ready</span>"}</figcaption></figure>`,
      )
      .join("\n");
    const ok = items.filter((i) => !i.problem).length;
    await writeFile(
      path.join(INBOX, "review.html"),
      `<!doctype html><meta charset="utf-8"><title>Meme review</title><style>
body{font:14px system-ui;background:#1b1430;color:#eee;margin:0;padding:16px}
h1{margin:0 0 4px}p{color:#bbb;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
figure{margin:0;background:#fff;color:#111;border-radius:12px;overflow:hidden;border:4px solid #3c3;}
figure.bad{border-color:#e33;opacity:.75}
img{width:100%;aspect-ratio:4/3;object-fit:contain;background:#eee;display:block}
figcaption{padding:8px;display:flex;flex-direction:column;gap:2px}small{color:#666}em{color:#c00;font-style:normal}span{color:#080}
</style><h1>${items.length} pictures in memes-inbox/</h1>
<p>${ok} ready to add. Delete from memes-inbox/ anything you don't want, rename files to fix names, then run <code>npm run memes:import -- --apply</code>.</p>
<div class="grid">${cards}</div>`,
    );
    console.log(`${items.length} pictures, ${ok} ready. Review them: ${path.join(INBOX, "review.html")}`);
    for (const i of items.filter((i) => i.problem)) console.log(`  ✗ ${i.file}: ${i.problem}`);
    return;
  }

  await mkdir(THUMB_DIR, { recursive: true });
  await mkdir(DONE, { recursive: true });
  const onDisk = new Set(await readdir(OUT_DIR));
  let added = 0;
  for (const i of items) {
    if (i.problem) {
      console.log(`  skipped ${i.file}: ${i.problem}`);
      continue;
    }
    let file = `${slug(i.name) || "meme"}.webp`;
    for (let n = 2; onDisk.has(file); n++) file = `${slug(i.name)}-${n}.webp`;
    onDisk.add(file);
    const input = await sharp(await readFile(path.join(INBOX, i.file)))
      .rotate()
      .flatten({ background: "#ffffff" })
      .toBuffer();
    const { data, info } = await sharp(input)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(input).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: THUMB_QUALITY, effort: 5 }).toBuffer();
    await writeFile(path.join(OUT_DIR, file), data);
    await writeFile(path.join(THUMB_DIR, file), thumb);
    // You reviewed these by hand, so they skip the text (OCR) check that downloaded templates get.
    library.push({ name: i.name, file, width: info.width, height: info.height, source: SOURCE, hash: await dHash(data), checked: true });
    await rename(path.join(INBOX, i.file), path.join(DONE, i.file));
    console.log(`  + ${i.name} → public/memes/${file}`);
    added++;
  }
  library.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(MANIFEST, JSON.stringify(library, null, 1) + "\n");
  if (existsSync(path.join(INBOX, "review.html")) && added) console.log("(review.html is now out of date)");
  console.log(`added ${added} memes; the library has ${library.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
