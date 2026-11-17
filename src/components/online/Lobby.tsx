"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type { Strings } from "@/lib/i18n";
import type { ClientToServer, OnlineError, RoomView, ServerToClient } from "@/lib/online";
import { Stepper } from "../Setup";
import { Button, Screen } from "../ui";

type Sock = Socket<ServerToClient, ClientToServer>;
const isLocalHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

/**
 * The invite URL other phones can open. On localhost that address is useless to them,
 * so ask the server for this computer's LAN address(es) instead.
 */
function useInviteUrls(code: string) {
  const { hostname, origin, port } = window.location;
  const local = isLocalHost(hostname);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!local) return;
    let cancelled = false;
    const fallback = [`${origin}/?room=${code}`];
    fetch("/api/lan")
      .then((r) => r.json() as Promise<{ addresses: string[] }>)
      .then(({ addresses }) => {
        if (cancelled) return;
        const p = port ? `:${port}` : "";
        setLanUrls(addresses.length ? addresses.map((ip) => `http://${ip}${p}/?room=${code}`) : fallback);
      })
      .catch(() => !cancelled && setLanUrls(fallback));
    return () => {
      cancelled = true;
    };
  }, [local, origin, port, code]);
  return local ? lanUrls : [`${origin}/?room=${code}`];
}

export default function Lobby({
  t,
  room,
  socket,
  connected,
  onLeave,
}: {
  t: Strings;
  room: RoomView;
  socket: Sock;
  connected: boolean;
  onLeave: () => void;
}) {
  const urls = useInviteUrls(room.code);
  const [urlIdx, setUrlIdx] = useState(0);
  const url = urls[Math.min(urlIdx, urls.length - 1)] ?? "";
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [target, setTarget] = useState(room.target);
  const [handSize, setHandSize] = useState(room.handSize);
  const [error, setError] = useState<OnlineError | null>(null);
  const [starting, setStarting] = useState(false);

  const isHost = room.hostId === room.me;
  const online = room.players.filter((p) => p.connected).length;

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#14101f", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  function start() {
    setStarting(true);
    socket.emit("game:start", { target, handSize }, (res) => {
      setStarting(false);
      setError(res.ok ? null : res.error);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Screen>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-bold uppercase tracking-widest text-white/50">{t.roomCode}</span>
        <span className="font-display text-6xl tracking-[0.2em] text-pop">{room.code}</span>
        {!connected && <span className="text-sm text-hot">{t.connecting}</span>}
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl bg-panel p-4 text-center">
        <span className="font-bold">{t.scanToJoin}</span>
        {qr ? (
          <img src={qr} alt={url} className="h-56 w-56 rounded-xl bg-white" />
        ) : (
          <div className="h-56 w-56 animate-pulse rounded-xl bg-panel-2" />
        )}
        {urls.length > 1 && (
          <select
            value={urlIdx}
            onChange={(e) => setUrlIdx(Number(e.target.value))}
            className="max-w-full rounded-lg bg-panel-2 px-2 py-1 text-xs"
          >
            {urls.map((u, i) => (
              <option key={u} value={i}>
                {u}
              </option>
            ))}
          </select>
        )}
        <button onClick={copy} className="text-sm font-semibold text-pop underline-offset-4 hover:underline">
          {copied ? t.linkCopied : t.copyLink}
        </button>
        <p className="text-xs text-white/50">{t.sameWifi}</p>
      </div>

      <div className="rounded-2xl bg-panel p-4">
        <h3 className="mb-3 flex items-center justify-between font-bold">
          {t.players}
          <span className={`text-sm ${online >= 3 ? "text-mint" : "text-white/50"}`}>{t.waitingPlayers(online)}</span>
        </h3>
        <ul className="flex flex-col gap-2">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2 ${p.connected ? "" : "opacity-50"}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${p.connected ? "bg-mint" : "bg-white/30"}`} />
              <span className="flex-1 truncate font-bold">
                {p.name}
                {p.id === room.me && <span className="font-normal text-white/50"> ({t.you})</span>}
              </span>
              {p.id === room.hostId && (
                <span className="rounded-full bg-pop px-2 py-0.5 text-xs font-bold text-ink">{t.host}</span>
              )}
              {!p.connected && <span className="text-xs text-white/50">{t.offline}</span>}
              {isHost && p.id !== room.me && (
                <button
                  onClick={() => socket.emit("room:kick", { playerId: p.id })}
                  className="text-xs font-bold text-white/50 hover:text-hot"
                >
                  {t.kick}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stepper label={t.pointsToWin} value={target} min={3} max={15} onChange={setTarget} />
            <Stepper label={t.handSize} value={handSize} min={4} max={10} onChange={setHandSize} />
          </div>
          {error && <p className="rounded-xl bg-hot/20 p-3 text-center text-sm font-semibold">{t.errors[error]}</p>}
          <Button disabled={online < 3 || starting} onClick={start}>
            {starting ? t.loadingMemes : t.startGame}
          </Button>
        </>
      ) : (
        <p className="text-center font-semibold text-white/60">{t.waitingHost}</p>
      )}

      <Button variant="ghost" onClick={onLeave}>
        {t.leaveRoom}
      </Button>
    </Screen>
  );
}
