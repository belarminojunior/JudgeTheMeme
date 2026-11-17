"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServer, OnlineError, RoomView, ServerToClient } from "@/lib/online";

type Sock = Socket<ServerToClient, ClientToServer>;
interface Session {
  code: string;
  playerId: string;
}

const SESSION_KEY = "jtm-online";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export type OnlineErr = OnlineError | "offline";

/** Owns the Socket.IO connection and the player's room session (survives refreshes). */
export function useOnline() {
  // Connected/disconnected by the effect below so React Strict Mode remounts reconnect cleanly.
  const [socket] = useState<Sock>(() => io({ autoConnect: false, transports: ["websocket", "polling"] }));
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [kicked, setKicked] = useState(false);
  const session = useRef<Session | null>(loadSession());

  useEffect(() => {
    const rejoin = () => {
      setConnected(true);
      const s = session.current;
      if (!s) return;
      socket.emit("room:join", { code: s.code, name: "", playerId: s.playerId }, (res) => {
        if (!res.ok) {
          session.current = null;
          saveSession(null);
          setRoom(null);
        }
      });
    };
    const onDisconnect = () => setConnected(false);
    const onKicked = () => {
      session.current = null;
      saveSession(null);
      setRoom(null);
      setKicked(true);
    };
    socket.on("connect", rejoin);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", setRoom);
    socket.on("room:kicked", onKicked);
    socket.connect();
    return () => {
      socket.off("connect", rejoin);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", setRoom);
      socket.off("room:kicked", onKicked);
      socket.disconnect();
    };
  }, [socket]);

  const enter = useCallback(
    (kind: "create" | "join", name: string, code = ""): Promise<OnlineErr | null> =>
      new Promise((resolve) => {
        if (!socket.connected) return resolve("offline");
        const done = (res: { ok: true; code: string; playerId: string } | { ok: false; error: OnlineError }) => {
          if (!res.ok) return resolve(res.error);
          session.current = { code: res.code, playerId: res.playerId };
          saveSession(session.current);
          setKicked(false);
          resolve(null);
        };
        if (kind === "create") socket.emit("room:create", { name }, done);
        else socket.emit("room:join", { code, name }, done);
      }),
    [socket],
  );

  const leave = useCallback(() => {
    socket.emit("room:leave");
    session.current = null;
    saveSession(null);
    setRoom(null);
  }, [socket]);

  return { socket, room, connected, kicked, enter, leave };
}
