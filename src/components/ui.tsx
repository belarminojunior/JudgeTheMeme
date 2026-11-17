"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  onClick,
}: {
  text: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-24 w-full items-center rounded-2xl border-2 p-4 text-left text-base font-bold leading-snug transition ${
        selected
          ? "-translate-y-1 border-pop bg-pop text-ink shadow-[0_6px_0_#b8901a]"
          : "border-white/10 bg-white text-ink hover:-translate-y-0.5"
      }`}
    >
      {text}
    </button>
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
