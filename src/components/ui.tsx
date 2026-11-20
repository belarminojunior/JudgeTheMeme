"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CARD_SWAP_MAX } from "@/lib/game";
import type { Strings } from "@/lib/i18n";
import { saveMemeImage } from "@/lib/memeImage";

type Variant = "pop" | "hot" | "ghost";

export function Button({
  variant = "pop",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    pop: "bg-pop text-ink shadow-[0_5px_0_#b8901a] active:shadow-[0_1px_0_#b8901a]",
    hot: "bg-hot text-white shadow-[0_5px_0_#b52a4c] active:shadow-[0_1px_0_#b52a4c]",
    ghost: "bg-panel-2 text-foreground shadow-[0_5px_0_#120d1d] active:shadow-[0_1px_0_#120d1d]",
  };
  return (
    <button
      {...props}
      className={`rounded-2xl px-5 py-3.5 text-base font-extrabold tracking-wide transition active:translate-y-1 disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-white/40 disabled:shadow-none disabled:active:translate-y-0 ${styles[variant]} ${className}`}
    />
  );
}

/** A photo card with an optional caption, styled like a printed meme card. */
export function Meme({
  photo,
  caption,
  className = "",
}: {
  photo: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={`overflow-hidden rounded-2xl bg-white p-2 text-ink shadow-2xl ${className}`}>
      <img
        src={photo}
        alt=""
        decoding="async"
        fetchPriority="high"
        referrerPolicy="no-referrer"
        className="mx-auto max-h-[55vh] min-h-40 w-full rounded-xl bg-neutral-100 object-contain"
        draggable={false}
      />
      {caption && (
        <figcaption className="px-2 pb-1 pt-3 text-center text-lg font-extrabold leading-snug sm:text-xl">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function CaptionCard({
  text,
  selected,
  discard,
  onClick,
}: {
  text: string;
  selected?: boolean;
  /** Marked to be thrown away (card swap mode). */
  discard?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected || discard}
      className={`relative flex min-h-24 w-full items-center rounded-2xl border-2 p-4 pr-9 text-left text-base font-bold leading-snug transition active:scale-[0.98] ${
        discard
          ? "border-hot bg-white text-ink/40 line-through shadow-[0_4px_0_#b52a4c]"
          : selected
            ? "-translate-y-1 border-pop bg-pop text-ink shadow-[0_6px_0_#b8901a]"
            : "border-white/10 bg-white text-ink shadow-[0_4px_0_#cfc6e3] hover:-translate-y-0.5"
      }`}
    >
      {text}
      <span
        className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-xs ${
          discard ? "bg-hot text-white" : selected ? "bg-ink text-pop" : "border-2 border-ink/15"
        }`}
      >
        {discard ? "✕" : selected ? "✓" : ""}
      </span>
    </button>
  );
}

/**
 * A captioner's hand: pick a card to play, swap up to CARD_SWAP_MAX single cards (once per round),
 * or swap the whole hand (swapsLeft: one per game, plus one per round won).
 */
export function HandPicker({
  t,
  photo,
  hand,
  caption,
  swapsLeft,
  canSwapCards,
  onPlay,
  onSwapHand,
  onSwapCards,
}: {
  t: Strings;
  photo: string;
  hand: number[];
  caption: (i: number) => string;
  swapsLeft: number;
  canSwapCards: boolean;
  onPlay: (c: number) => void;
  onSwapHand: () => void;
  onSwapCards: (cards: number[]) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [discard, setDiscard] = useState<number[]>([]);
  const shown = selected !== null && hand.includes(selected) ? selected : null;
  const marked = discard.filter((c) => hand.includes(c));

  function tap(c: number) {
    if (!swapping) return setSelected(c);
    setDiscard((d) => (d.includes(c) ? d.filter((x) => x !== c) : d.length < CARD_SWAP_MAX ? [...d, c] : d));
  }
  function stopSwapping() {
    setSwapping(false);
    setDiscard([]);
  }

  const link =
    "text-sm font-semibold text-white/60 underline-offset-4 hover:underline disabled:no-underline disabled:opacity-40";
  return (
    <>
      <Meme photo={photo} caption={shown !== null && !swapping ? caption(shown) : undefined} className="animate-flip-in" />
      {swapping && <p className="-mb-2 text-center text-sm font-bold text-hot">{t.swapCardsHint(CARD_SWAP_MAX)}</p>}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {hand.map((c) => (
          <CaptionCard
            key={c}
            text={caption(c)}
            selected={!swapping && shown === c}
            discard={swapping && marked.includes(c)}
            onClick={() => tap(c)}
          />
        ))}
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-background/95 px-4 pb-4 pt-3 backdrop-blur">
        {swapping ? (
          <>
            <Button
              variant="hot"
              disabled={marked.length === 0}
              onClick={() => {
                onSwapCards(marked);
                stopSwapping();
              }}
            >
              ↻ {t.swapCardsConfirm(marked.length || 1)}
            </Button>
            <button onClick={stopSwapping} className={link}>
              {t.cancel}
            </button>
          </>
        ) : (
          <>
            <Button disabled={shown === null} onClick={() => shown !== null && onPlay(shown)}>
              {t.playCard}
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <button disabled={!canSwapCards} onClick={() => setSwapping(true)} className={link}>
                {canSwapCards ? t.swapCards(CARD_SWAP_MAX) : t.swapCardsUsed}
              </button>
              <button disabled={swapsLeft <= 0} onClick={onSwapHand} className={link}>
                {swapsLeft > 0 ? `↻ ${t.swapHand} (${t.swapsLeft(swapsLeft)})` : t.noSwapsLeft}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** The judge flips through the captions one at a time, on the judge's own screen only. */
export function JudgeCarousel({
  t,
  photo,
  captions,
  caption,
  onPick,
  onNone,
}: {
  t: Strings;
  photo: string;
  captions: number[];
  caption: (i: number) => string;
  onPick: (caption: number) => void;
  onNone: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const n = captions.length;
  const i = Math.min(idx, n - 1);
  return (
    <>
      <Meme key={captions[i]} photo={photo} caption={caption(captions[i])} className="animate-pop-in" />
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" aria-label="previous" onClick={() => setIdx((i - 1 + n) % n)}>
          ←
        </Button>
        <div className="flex gap-1.5">
          {captions.map((c, k) => (
            <button
              key={c}
              aria-label={`${k + 1}`}
              onClick={() => setIdx(k)}
              className={`h-3 w-3 rounded-full ${k === i ? "bg-pop" : "bg-white/25"}`}
            />
          ))}
        </div>
        <Button variant="ghost" aria-label="next" onClick={() => setIdx((i + 1) % n)}>
          →
        </Button>
      </div>
      <p className="-mt-2 text-center text-sm font-bold text-white/50">
        {i + 1} / {n}
      </p>
      <Button variant="hot" onClick={() => onPick(captions[i])}>
        🏆 {t.pickWinner}
      </Button>
      <NoneGoodButton label={t.noneGood} confirmText={t.noneConfirm} onNone={onNone} />
    </>
  );
}

/** What the captioners see while the judge decides: the photo and every caption in play. */
export function CaptionsInPlay({
  t,
  photo,
  captions,
  mine,
  caption,
}: {
  t: Strings;
  photo: string;
  captions: number[];
  mine: number | null;
  caption: (i: number) => string;
}) {
  return (
    <>
      <Meme photo={photo} />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">{t.allCaptions}</h3>
        {captions.map((c) => (
          <div
            key={c}
            className={`animate-pop-in relative rounded-2xl border-2 bg-white p-4 text-base font-bold leading-snug text-ink ${
              c === mine ? "border-pop pr-16" : "border-transparent"
            }`}
          >
            {caption(c)}
            {c === mine && (
              <span className="absolute right-3 top-3 rounded-full bg-pop px-2 py-0.5 text-xs font-extrabold uppercase">
                {t.yours}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** A winning meme at game over, with a button to save it as a watermarked image. */
export function WinningMeme({ t, photo, caption, by }: { t: Strings; photo: string; caption: string; by: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      await saveMemeImage(photo, caption);
    } catch {
      alert(t.downloadFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Meme photo={photo} caption={caption} />
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="truncate text-sm font-bold text-white/60">— {by}</p>
        <button
          onClick={download}
          disabled={busy}
          className="shrink-0 rounded-full bg-panel-2 px-3 py-1.5 text-sm font-bold text-pop transition hover:bg-pop hover:text-ink disabled:opacity-50"
        >
          {busy ? "…" : t.download}
        </button>
      </div>
    </div>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-5">{children}</div>;
}

export function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <div className={`font-display uppercase leading-none ${size === "lg" ? "text-6xl sm:text-7xl" : "text-2xl"}`}>
      <span className="text-pop">Judge</span> <span className="text-foreground">the</span>{" "}
      <span className="inline-block -rotate-3 rounded-lg bg-hot px-2 text-white">Meme</span>
    </div>
  );
}

export function Scoreboard({
  title,
  players,
  target,
  judgeId,
  pts,
}: {
  title: string;
  players: { id: string; name: string; score: number; connected?: boolean }[];
  target: number;
  judgeId?: string | null;
  pts: (n: number) => string;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="rounded-2xl bg-panel p-4">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-white/50">{title}</h3>
      <ul className="flex flex-col gap-2">
        {sorted.map((p) => (
          <li key={p.id} className={`flex items-center gap-3 ${p.connected === false ? "opacity-40" : ""}`}>
            <span className="w-24 truncate font-bold">
              {p.id === judgeId ? "⚖ " : ""}
              {p.name}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full rounded-full bg-pop transition-all"
                style={{ width: `${Math.min(100, (p.score / target) * 100)}%` }}
              />
            </div>
            <span className="w-12 text-right text-sm font-bold text-pop">{pts(p.score)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small version of a bundled meme (public/memes/thumbs/); uploaded photos have none and are used as-is. */
export function thumbOf(url: string): string {
  return url.startsWith("/memes/") && !url.startsWith("/memes/thumbs/") ? url.replace("/memes/", "/memes/thumbs/") : url;
}

/** Start downloading images before they are shown, so they appear instantly. */
export function usePreload(urls: string[]) {
  const key = urls.join("|");
  useEffect(() => {
    for (const u of key.split("|")) {
      if (!u) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = u;
    }
  }, [key]);
}

/** The back of a card: what players see while the judge is choosing a photo. */
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex aspect-[3/4] items-center justify-center rounded-2xl border-2 border-pop/40 bg-[repeating-linear-gradient(45deg,#2e2448_0_10px,#261d3d_10px_20px)] shadow-lg ${className}`}
    >
      <span className="-rotate-6 rounded-lg bg-hot px-2 py-0.5 font-display text-xl uppercase text-white shadow">Meme</span>
    </div>
  );
}

/**
 * The photos the judge chooses from at the start of a round. The judge sees their faces, taps one
 * to preview it, then confirms. Without `onPick` (players who are only watching) only the card
 * backs are shown.
 */
export function PhotoChoices({
  photos,
  hint,
  confirmLabel,
  onPick,
}: {
  photos: string[];
  hint: string;
  confirmLabel?: string;
  onPick?: (index: number) => void;
}) {
  const [selected, setSelected] = useState(0);
  const faceUp = !!onPick && photos.every(Boolean);
  usePreload(faceUp ? photos : []);
  if (!faceUp) {
    return (
      <div className="flex flex-col gap-3">
        {hint && <p className="text-center text-sm font-semibold text-white/60">{hint}</p>}
        <div className="grid grid-cols-5 gap-2">
          {photos.map((_, i) => (
            <CardBack key={i} className="animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  const pick = Math.min(selected, photos.length - 1);
  return (
    <div className="flex flex-col gap-3">
      {hint && <p className="text-center text-sm font-semibold text-white/60">{hint}</p>}
      <Meme key={photos[pick]} photo={photos[pick]} className="animate-pop-in" />
      <div className="grid grid-cols-5 gap-2">
        {photos.map((p, i) => (
          <button
            key={p}
            onClick={() => setSelected(i)}
            aria-label={`${i + 1}`}
            aria-pressed={i === pick}
            className={`overflow-hidden rounded-xl border-4 bg-white transition active:scale-95 ${
              i === pick ? "-translate-y-1 border-pop shadow-[0_5px_0_#b8901a]" : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            <img src={thumbOf(p)} alt="" decoding="async" className="aspect-square w-full object-cover" draggable={false} />
          </button>
        ))}
      </div>
      <Button variant="hot" onClick={() => onPick(pick)}>
        {confirmLabel}
      </Button>
    </div>
  );
}

/** A thin bar that empties as the timer runs out. */
export function TimerBar({ seconds, total }: { seconds: number; total: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-linear ${seconds <= 10 ? "bg-hot" : "bg-pop"}`}
        style={{ width: `${Math.max(0, Math.min(100, (seconds / total) * 100))}%` }}
      />
    </div>
  );
}

/**
 * Seconds left until a deadline given as "ms remaining when we were told" (avoids clock skew
 * between phones and the server). Calls onExpire once when it reaches zero.
 */
export function useCountdown(msLeft: number | null, resetKey: unknown, onExpire?: () => void) {
  const [left, setLeft] = useState<number | null>(msLeft === null ? null : Math.ceil(msLeft / 1000));
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });
  useEffect(() => {
    if (msLeft === null) return;
    const deadline = Date.now() + msLeft;
    let fired = false;
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(s);
      if (s === 0 && !fired) {
        fired = true;
        expire.current?.();
      }
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [msLeft, resetKey]);
  return msLeft === null ? null : left;
}

/** The judge's way out when every caption is bad: nobody scores this round. */
export function NoneGoodButton({ label, confirmText, onNone }: { label: string; confirmText: string; onNone: () => void }) {
  return (
    <button
      onClick={() => confirm(confirmText) && onNone()}
      className="mx-auto rounded-full border-2 border-white/15 px-4 py-2 text-sm font-bold text-white/60 transition hover:border-hot hover:text-white"
    >
      🙅 {label}
    </button>
  );
}

/** Shown on the result screen when the judge decided no caption deserved the point. */
export function NoWinner({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="animate-pop-in flex flex-col items-center gap-1 text-center">
      <div className="text-6xl">🙅</div>
      <h2 className="font-display text-4xl uppercase text-hot">{title}</h2>
      <p className="text-sm font-semibold text-white/60">{hint}</p>
    </div>
  );
}

export function CountdownBadge({ seconds, label }: { seconds: number; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-extrabold tabular-nums ${seconds <= 10 ? "animate-pulse bg-hot text-white" : "bg-panel-2 text-pop"}`}
    >
      {label}
    </span>
  );
}
