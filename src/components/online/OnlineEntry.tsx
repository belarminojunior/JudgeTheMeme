"use client";

import { useState } from "react";
import type { Lang, Strings } from "@/lib/i18n";
import { Button, Screen } from "../ui";
import Lobby from "./Lobby";
import OnlineGame from "./OnlineGame";
import { useOnline, type OnlineErr } from "./useOnline";

const NAME_KEY = "jtm-online-name";

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function OnlineEntry({
  t,
  lang,
  initialCode,
  onExit,
}: {
  t: Strings;
  lang: Lang;
  initialCode: string;
  onExit: () => void;
}) {
  const { socket, room, connected, kicked, enter, leave } = useOnline();
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState<OnlineErr | null>(null);
  const [busy, setBusy] = useState(false);

  function leaveRoom() {
    if (!confirm(t.leaveConfirm)) return;
    leave();
    onExit();
  }

  if (room) {
    return room.phase === "lobby" ? (
      <Lobby t={t} room={room} socket={socket} onLeave={leaveRoom} connected={connected} />
    ) : (
      <OnlineGame t={t} lang={lang} room={room} socket={socket} onLeave={leaveRoom} connected={connected} />
    );
  }

  async function go(kind: "create" | "join") {
    const n = name.trim();
    if (!n) return setError("badName");
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignore */
    }
    setBusy(true);
    setError(await enter(kind, n, code));
    setBusy(false);
  }

  const inputCls =
    "w-full rounded-xl border-2 border-white/10 bg-panel px-4 py-3 text-lg font-semibold outline-none focus:border-pop";

  return (
    <Screen>
      <h2 className="font-display text-4xl uppercase text-pop">{t.online}</h2>
      {kicked && <p className="rounded-xl bg-hot/20 p-3 text-sm font-semibold">{t.kicked}</p>}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-white/70">{t.yourName}</span>
        <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </label>

      <div className="rounded-2xl bg-panel p-4">
        <h3 className="mb-3 font-bold">{t.joinRoom}</h3>
        <div className="flex gap-2">
          <input
            value={code}
            maxLength={4}
            placeholder={t.roomCode}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            className={`${inputCls} bg-panel-2 text-center font-display text-2xl tracking-[0.3em] uppercase`}
          />
          <Button variant="hot" disabled={busy || code.length !== 4} onClick={() => go("join")}>
            {t.join}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm font-bold uppercase text-white/40">
        <span className="h-px flex-1 bg-white/10" />
        {t.or}
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <Button disabled={busy} onClick={() => go("create")}>
        {t.createRoom}
      </Button>

      {!connected && <p className="text-center text-sm text-white/50">{t.connecting}</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-hot/20 p-3 text-center text-sm font-semibold">
          {t.errors[error]}
        </p>
      )}

      <Button variant="ghost" className="mt-auto" onClick={onExit}>
        {t.back}
      </Button>
    </Screen>
  );
}
