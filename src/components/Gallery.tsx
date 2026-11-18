"use client";

import { useEffect, useMemo, useState } from "react";
import type { Strings } from "@/lib/i18n";
import { Button, Screen } from "./ui";

interface MemeInfo {
  name: string;
  url: string;
  width: number;
  height: number;
}

/** Every meme picture bundled with the game, searchable by name. Tap one to see it full size. */
export default function Gallery({ t, onBack }: { t: Strings; onBack: () => void }) {
  const [memes, setMemes] = useState<MemeInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<MemeInfo | null>(null);

  useEffect(() => {
    fetch("/api/memes/catalog")
      .then((r) => r.json() as Promise<MemeInfo[]>)
      .then(setMemes)
      .catch(() => setFailed(true));
  }, []);

  // Close the full-size view with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !memes ? [] : q ? memes.filter((m) => m.name.toLowerCase().includes(q)) : memes;
  }, [memes, query]);

  return (
    <Screen>
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-4xl uppercase text-pop">{t.galleryTitle}</h2>
        {memes && <span className="pb-1 text-sm font-semibold text-white/50">{t.memeCount(shown.length, memes.length)}</span>}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchMemes}
        aria-label={t.searchMemes}
        className="w-full rounded-xl border-2 border-white/10 bg-panel px-4 py-3 text-base font-semibold outline-none focus:border-pop"
      />

      {failed && <p className="rounded-xl bg-hot/20 p-3 text-center text-sm font-semibold">{t.errors.offline}</p>}
      {!memes && !failed && <p className="text-center font-display text-3xl text-pop">…</p>}
      {memes && shown.length === 0 && <p className="text-center text-white/60">{t.noMemesFound}</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((m) => (
          <li key={m.url}>
            <button
              onClick={() => setOpen(m)}
              className="group flex w-full flex-col overflow-hidden rounded-xl bg-white text-left text-ink shadow-lg transition active:scale-95"
            >
              <img
                src={m.url}
                alt={m.name}
                width={m.width}
                height={m.height}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full bg-neutral-100 object-cover"
              />
              <span className="truncate px-2 py-1.5 text-xs font-bold">{m.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <Button variant="ghost" onClick={onBack}>
        {t.back}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={open.name}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
        >
          <img src={open.url} alt={open.name} className="max-h-[80vh] max-w-full rounded-xl bg-white object-contain" />
          <p className="text-center font-bold">{open.name}</p>
          <button onClick={() => setOpen(null)} className="rounded-full bg-panel-2 px-4 py-2 text-sm font-bold">
            {t.close}
          </button>
        </div>
      )}
    </Screen>
  );
}
