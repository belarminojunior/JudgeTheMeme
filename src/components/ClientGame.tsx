"use client";

import dynamic from "next/dynamic";

// The game restores itself from localStorage on first render, so it only renders in the browser.
const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center font-display text-3xl text-pop">…</div>,
});

export default function ClientGame() {
  return <Game />;
}
