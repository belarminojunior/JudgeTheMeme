// Draws a winning meme (photo + caption) onto a canvas with the game's watermark, then saves it.

const W = 1080; // output width in px
const PAD = 36;
const INK = "#14101f";
const POP = "#ffd23f";
const HOT = "#ff4f79";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Photos from other sites (stock fallback) need CORS, or the canvas can't be exported.
    if (/^https?:/.test(src) && new URL(src).origin !== location.origin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** The font family behind a next/font CSS variable (e.g. --font-anton), with a fallback. */
function fontVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The "JUDGE THE MEME" logo, drawn with its left edge at x and its text baseline at y. Returns its width. */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, display: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${display}`;
  ctx.textBaseline = "alphabetic";
  const gap = size * 0.28;
  const judge = "JUDGE";
  const the = "THE";
  const meme = "MEME";
  const wJ = ctx.measureText(judge).width;
  const wT = ctx.measureText(the).width;
  const wM = ctx.measureText(meme).width;
  const tagPad = size * 0.18;

  ctx.fillStyle = POP;
  ctx.fillText(judge, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(the, x + wJ + gap, y);

  const mx = x + wJ + gap + wT + gap;
  ctx.save();
  ctx.translate(mx + wM / 2 + tagPad, y - size * 0.38);
  ctx.rotate(-0.05);
  ctx.fillStyle = HOT;
  ctx.beginPath();
  ctx.roundRect(-wM / 2 - tagPad, -size * 0.62, wM + tagPad * 2, size * 1.16, size * 0.16);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(meme, -wM / 2, size * 0.38);
  ctx.restore();
  ctx.restore();
  return wJ + gap + wT + gap + wM + tagPad * 2;
}

export async function renderMemeImage(photo: string, caption: string): Promise<Blob> {
  const display = fontVar("--font-anton", "Impact, sans-serif");
  const sans = fontVar("--font-geist-sans", "system-ui, sans-serif");
  await Promise.all([document.fonts.load(`40px ${display}`), document.fonts.load(`800 40px ${sans}`)]).catch(() => {});
  const img = await loadImage(photo);

  const inner = W - PAD * 2;
  const imgH = Math.min(Math.round((img.naturalHeight / img.naturalWidth) * inner), Math.round(W * 1.25));

  const measure = document.createElement("canvas").getContext("2d")!;
  const capSize = 54;
  measure.font = `800 ${capSize}px ${sans}`;
  const lines = wrap(measure, caption, inner - 24);
  const lineH = Math.round(capSize * 1.25);
  const capH = lines.length * lineH + PAD * 1.4;
  const footH = 112;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = PAD + imgH + capH + footH;
  const ctx = canvas.getContext("2d")!;

  // Card
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, canvas.height);

  // Photo, fitted (letterboxed) inside its box
  ctx.fillStyle = "#f2f0f5";
  ctx.beginPath();
  ctx.roundRect(PAD, PAD, inner, imgH, 24);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const scale = Math.min(inner / img.naturalWidth, imgH / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, PAD + (inner - dw) / 2, PAD + (imgH - dh) / 2, dw, dh);
  ctx.restore();

  // Watermark on the photo (bottom-right corner)
  const markSize = 34;
  ctx.font = `${markSize}px ${display}`;
  const markW = drawLogo(measure, 0, 0, markSize, display); // measure only
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 8;
  drawLogo(ctx, PAD + inner - markW - 22, PAD + imgH - 22, markSize, display, 0.75);
  ctx.restore();

  // Caption
  ctx.fillStyle = INK;
  ctx.font = `800 ${capSize}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, PAD + imgH + PAD * 0.8 + i * lineH));
  ctx.textAlign = "left";

  // Footer band with the logo and where to play
  const fy = canvas.height - footH;
  ctx.fillStyle = INK;
  ctx.fillRect(0, fy, W, footH);
  drawLogo(ctx, PAD, fy + footH / 2 + 18, 48, display);
  ctx.font = `600 28px ${sans}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(location.host, W - PAD, fy + footH / 2);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92),
  );
}

/** Render the meme and hand it to the user: the share sheet on phones (so it can go to the gallery), a download elsewhere. */
export async function saveMemeImage(photo: string, caption: string): Promise<void> {
  const blob = await renderMemeImage(photo, caption);
  const name = `judge-the-meme-${Date.now().toString(36)}.jpg`;
  const file = new File([blob], name, { type: "image/jpeg" });
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
