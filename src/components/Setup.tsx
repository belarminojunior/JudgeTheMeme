"use client";

import { useState } from "react";
import type { Settings } from "@/lib/game";
import { loadMemePool } from "@/lib/memes";
import type { Strings } from "@/lib/i18n";
import { Button, Screen } from "./ui";

const MAX_PLAYERS = 10;

/** Downscale an uploaded image so it fits comfortably in memory/localStorage. */
function fileToDataUrl(file: File, max = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export default function Setup({
  t,
  initialNames,
  onStart,
  onBack,
}: {
  t: Strings;
  initialNames: string[];
  onStart: (s: Settings) => void;
  onBack: () => void;
}) {
  const [names, setNames] = useState<string[]>(initialNames.length ? initialNames : ["", "", ""]);
  const [target, setTarget] = useState(7);
  const [handSize, setHandSize] = useState(7);
  const [photos, setPhotos] = useState<string[]>([]);
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [starting, setStarting] = useState(false);

  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  const unique = new Set(cleaned.map((n) => n.toLowerCase())).size === cleaned.length;
  const canStart = cleaned.length >= 3 && unique;

  async function start() {
    setStarting(true);
    const pool = onlyCustom && photos.length ? photos : [...(await loadMemePool()), ...photos];
    onStart({ names: cleaned, target, handSize, photos: pool });
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const urls = await Promise.all(Array.from(files).map((f) => fileToDataUrl(f).catch(() => null)));
    setPhotos((p) => [...p, ...urls.filter((u): u is string => !!u)]);
  }

  return (
    <Screen>
      <h2 className="font-display text-4xl uppercase text-pop">{t.players}</h2>

      <div className="flex flex-col gap-2">
        {names.map((name, i) => (
          <div key={i} className="flex gap-2">
            <span className="flex w-10 items-center justify-center rounded-xl bg-panel-2 font-display text-xl text-pop">
              {i + 1}
            </span>
            <input
              value={name}
              maxLength={16}
              placeholder={`${t.playerName} ${i + 1}`}
              onChange={(e) => setNames((ns) => ns.map((n, j) => (j === i ? e.target.value : n)))}
              className="flex-1 rounded-xl border-2 border-white/10 bg-panel px-4 py-3 text-lg font-semibold outline-none focus:border-pop"
            />
            {names.length > 3 && (
              <button
                aria-label={t.remove}
                onClick={() => setNames((ns) => ns.filter((_, j) => j !== i))}
                className="w-11 rounded-xl bg-panel-2 text-xl font-bold text-white/60 hover:text-hot"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {names.length < MAX_PLAYERS && (
          <button
            onClick={() => setNames((ns) => [...ns, ""])}
            className="rounded-xl border-2 border-dashed border-white/20 py-3 font-bold text-white/70 hover:border-pop hover:text-pop"
          >
            + {t.addPlayer}
          </button>
        )}
        {cleaned.length < 3 && <p className="text-sm text-white/60">{t.minPlayers}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stepper label={t.pointsToWin} value={target} min={3} max={15} onChange={setTarget} />
        <Stepper label={t.handSize} value={handSize} min={4} max={10} onChange={setHandSize} />
      </div>

      <div className="rounded-2xl bg-panel p-4">
        <p className="mb-3 text-sm text-white/60">{t.photosFrom}</p>
        <h3 className="font-bold">{t.customPhotos}</h3>
        <p className="mb-3 text-sm text-white/60">{t.customPhotosHint}</p>
        {photos.length > 0 && (
          <div className="mb-3 grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p} alt="" className="aspect-square w-full rounded-lg object-cover" />
                <button
                  aria-label={t.remove}
                  onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/70 text-sm font-bold"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="inline-block cursor-pointer rounded-xl bg-panel-2 px-4 py-2 font-bold hover:text-pop">
          + {t.addPhotos}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {photos.length > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyCustom}
              onChange={(e) => setOnlyCustom(e.target.checked)}
              className="h-4 w-4 accent-pop"
            />
            {t.onlyCustom}
          </label>
        )}
      </div>

      <div className="mt-auto flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          {t.back}
        </Button>
        <Button
          className="flex-1"
          disabled={!canStart || starting}
          onClick={start}
        >
          {starting ? t.loadingMemes : t.startGame}
        </Button>
      </div>
    </Screen>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-panel p-3">
      <div className="mb-2 text-sm font-semibold text-white/70">{label}</div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-10 w-10 rounded-xl bg-panel-2 text-2xl font-bold"
        >
          −
        </button>
        <span className="font-display text-3xl text-pop">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-10 w-10 rounded-xl bg-panel-2 text-2xl font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}
