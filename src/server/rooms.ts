import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { drawCaptions, drawPhoto, newCaptionDeck, shuffle, type Win } from "../lib/game";
import {
  MAX_ONLINE_PLAYERS,
  type ClientToServer,
  type OnlinePhase,
  type RoomView,
  type ServerToClient,
} from "../lib/online";
import { getMemePool } from "./memes";

interface RPlayer {
  id: string;
  name: string;
  socketId: string | null;
  hand: number[];
  score: number;
  swapUsed: boolean;
  wins: Win[];
}

interface Room {
  code: string;
  hostId: string;
  players: RPlayer[];
  phase: OnlinePhase;
  round: number;
  judgeIdx: number;
  target: number;
  handSize: number;
  captionDeck: number[];
  captionDiscard: number[];
  photoPool: string[];
  photoDeck: string[];
  photo: string;
  submissions: { playerId: string; caption: number }[];
  viewing: number;
  winnerId: string | null;
  emptySince: number | null;
}

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient, object, { code?: string; playerId?: string }>;

const rooms = new Map<string, Room>();
const ROOM_TTL = 30 * 60 * 1000; // drop rooms 30 min after everyone left
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion

function newCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

const cleanName = (n: unknown) => (typeof n === "string" ? n.trim().slice(0, 16) : "");
const connected = (r: Room) => r.players.filter((p) => p.socketId);
const judge = (r: Room) => r.players[r.judgeIdx] as RPlayer | undefined;

/** Non-judge players who are online and still have to submit. */
function pending(r: Room) {
  const j = judge(r);
  return r.players.filter((p) => p !== j && p.socketId && !r.submissions.some((s) => s.playerId === p.id));
}

function view(r: Room, me: RPlayer): RoomView {
  const revealed = r.phase === "result" || r.phase === "gameover";
  const mine = r.submissions.find((s) => s.playerId === me.id);
  return {
    code: r.code,
    me: me.id,
    hostId: r.hostId,
    phase: r.phase,
    round: r.round,
    judgeId: judge(r)?.id ?? null,
    target: r.target,
    handSize: r.handSize,
    players: r.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: !!p.socketId,
      submitted: r.submissions.some((s) => s.playerId === p.id),
    })),
    photo: r.phase === "lobby" || r.phase === "reveal" ? null : r.photo,
    hand: me.hand,
    swapUsed: me.swapUsed,
    mySubmission: mine?.caption ?? null,
    submissions:
      r.phase === "judging" || revealed
        ? r.submissions.map((s) => (revealed ? s : { caption: s.caption }))
        : [],
    viewing: r.viewing,
    winnerId: r.winnerId,
    wins:
      r.phase === "gameover"
        ? r.players.flatMap((p) => p.wins.map((w) => ({ playerId: p.id, ...w })))
        : [],
  };
}

function broadcast(io: IO, r: Room) {
  for (const p of r.players) if (p.socketId) io.to(p.socketId).emit("room:state", view(r, p));
}

function dealIn(r: Room, p: RPlayer) {
  const missing = r.handSize - p.hand.length;
  if (missing > 0) p.hand.push(...drawCaptions(r, missing));
}

/** Move to judging once every online non-judge has submitted. */
function maybeAdvancePick(r: Room) {
  if (r.phase !== "pick" || pending(r).length > 0) return;
  if (r.submissions.length === 0) return; // nobody played (everyone left) — wait
  r.submissions = shuffle(r.submissions);
  r.viewing = 0;
  r.phase = "judging";
}

function startRound(r: Room) {
  r.photo = drawPhoto(r);
  r.submissions = [];
  r.viewing = 0;
  r.winnerId = null;
  r.phase = "reveal";
}

function nextJudge(r: Room) {
  // Rotate to the next connected player.
  for (let k = 1; k <= r.players.length; k++) {
    const idx = (r.judgeIdx + k) % r.players.length;
    if (r.players[idx].socketId) {
      r.judgeIdx = idx;
      return;
    }
  }
}

function endRound(r: Room) {
  r.captionDiscard.push(...r.submissions.map((s) => s.caption));
  for (const p of r.players) dealIn(r, p);
  r.round += 1;
  nextJudge(r);
  startRound(r);
}

function removePlayer(r: Room, playerId: string) {
  const idx = r.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return;
  const wasJudge = idx === r.judgeIdx;
  const midRound = r.phase === "reveal" || r.phase === "pick" || r.phase === "judging";
  const [p] = r.players.splice(idx, 1);
  r.captionDiscard.push(...p.hand);
  if (midRound) {
    const gone = r.submissions.filter((s) => s.playerId === playerId);
    r.captionDiscard.push(...gone.map((s) => s.caption));
    r.submissions = r.submissions.filter((s) => s.playerId !== playerId);
  }
  if (r.players.length === 0) {
    rooms.delete(r.code);
    return;
  }
  if (idx < r.judgeIdx) r.judgeIdx -= 1;
  if (r.judgeIdx >= r.players.length) r.judgeIdx = 0;
  if (r.hostId === playerId) r.hostId = (r.players.find((x) => x.socketId) ?? r.players[0]).id;
  // A game can't continue with fewer than 3 players: back to the lobby.
  if (r.phase !== "lobby" && r.players.length < 3) {
    r.phase = "lobby";
    return;
  }
  if (midRound && (wasJudge || (r.phase === "judging" && r.submissions.length === 0))) {
    // The judge left mid-round: return played cards and restart the round with the next judge.
    for (const s of r.submissions) r.players.find((x) => x.id === s.playerId)?.hand.push(s.caption);
    if (wasJudge) {
      r.judgeIdx = (r.judgeIdx - 1 + r.players.length) % r.players.length;
      nextJudge(r);
    }
    startRound(r);
    return;
  }
  if (r.phase === "judging") r.viewing = Math.min(r.viewing, r.submissions.length - 1);
  maybeAdvancePick(r);
}

export function attachRooms(io: IO) {
  setInterval(() => {
    for (const r of rooms.values()) {
      if (r.emptySince && Date.now() - r.emptySince > ROOM_TTL) rooms.delete(r.code);
    }
  }, 60_000).unref();

  io.on("connection", (socket: Sock) => {
    const ctx = () => {
      const r = socket.data.code ? rooms.get(socket.data.code) : undefined;
      const me = r?.players.find((p) => p.id === socket.data.playerId);
      return r && me ? { r, me } : null;
    };

    function bind(r: Room, p: RPlayer) {
      // If this player was connected elsewhere (another tab), that tab loses control.
      if (p.socketId && p.socketId !== socket.id) io.to(p.socketId).emit("room:kicked");
      p.socketId = socket.id;
      socket.data.code = r.code;
      socket.data.playerId = p.id;
      r.emptySince = null;
      socket.join(r.code);
    }

    socket.on("room:create", ({ name }, ack) => {
      const n = cleanName(name);
      if (!n) return ack({ ok: false, error: "badName" });
      const p: RPlayer = { id: randomUUID(), name: n, socketId: null, hand: [], score: 0, swapUsed: false, wins: [] };
      const r: Room = {
        code: newCode(),
        hostId: p.id,
        players: [p],
        phase: "lobby",
        round: 0,
        judgeIdx: 0,
        target: 7,
        handSize: 7,
        captionDeck: [],
        captionDiscard: [],
        photoPool: [],
        photoDeck: [],
        photo: "",
        submissions: [],
        viewing: 0,
        winnerId: null,
        emptySince: null,
      };
      rooms.set(r.code, r);
      bind(r, p);
      ack({ ok: true, code: r.code, playerId: p.id });
      broadcast(io, r);
    });

    socket.on("room:join", ({ code, name, playerId }, ack) => {
      const r = rooms.get(String(code ?? "").toUpperCase().trim());
      if (!r) return ack({ ok: false, error: "noRoom" });
      // Reconnect with a known id (page refresh, phone sleep).
      const existing = playerId ? r.players.find((p) => p.id === playerId) : undefined;
      if (existing) {
        bind(r, existing);
        ack({ ok: true, code: r.code, playerId: existing.id });
        maybeAdvancePick(r);
        return broadcast(io, r);
      }
      const n = cleanName(name);
      if (!n) return ack({ ok: false, error: "badName" });
      const sameName = r.players.find((p) => p.name.toLowerCase() === n.toLowerCase());
      if (sameName) {
        // Someone whose tab closed (seat saved per tab) can take their offline seat back by name.
        if (sameName.socketId) return ack({ ok: false, error: "nameTaken" });
        bind(r, sameName);
        ack({ ok: true, code: r.code, playerId: sameName.id });
        maybeAdvancePick(r);
        return broadcast(io, r);
      }
      if (r.players.length >= MAX_ONLINE_PLAYERS) return ack({ ok: false, error: "roomFull" });
      const p: RPlayer = { id: randomUUID(), name: n, socketId: null, hand: [], score: 0, swapUsed: false, wins: [] };
      r.players.push(p);
      if (r.phase !== "lobby") dealIn(r, p); // late joiners get a hand and play from now on
      bind(r, p);
      ack({ ok: true, code: r.code, playerId: p.id });
      broadcast(io, r);
    });

    socket.on("room:leave", () => {
      const c = ctx();
      if (!c) return;
      socket.leave(c.r.code);
      socket.data = {};
      removePlayer(c.r, c.me.id);
      if (rooms.has(c.r.code)) broadcast(io, c.r);
    });

    socket.on("room:kick", ({ playerId }) => {
      const c = ctx();
      if (!c || c.r.hostId !== c.me.id || playerId === c.me.id) return;
      const target = c.r.players.find((p) => p.id === playerId);
      if (target?.socketId) io.to(target.socketId).emit("room:kicked");
      removePlayer(c.r, playerId);
      broadcast(io, c.r);
    });

    socket.on("game:start", async ({ target, handSize }, ack) => {
      const c = ctx();
      if (!c || c.r.hostId !== c.me.id || (c.r.phase !== "lobby" && c.r.phase !== "gameover")) {
        return ack({ ok: false, error: "notAllowed" });
      }
      const { r } = c;
      if (connected(r).length < 3) return ack({ ok: false, error: "needPlayers" });
      // Players who dropped while in the lobby don't get dealt in.
      r.players = r.players.filter((p) => p.socketId);
      r.target = Math.min(15, Math.max(3, Math.round(Number(target) || 7)));
      r.handSize = Math.min(10, Math.max(4, Math.round(Number(handSize) || 7)));
      r.photoPool = await getMemePool();
      r.photoDeck = shuffle(r.photoPool);
      r.captionDeck = newCaptionDeck();
      r.captionDiscard = [];
      for (const p of r.players) Object.assign(p, { hand: [], score: 0, swapUsed: false, wins: [] });
      for (const p of r.players) dealIn(r, p);
      r.round = 1;
      r.judgeIdx = Math.floor(Math.random() * r.players.length);
      startRound(r);
      ack({ ok: true });
      broadcast(io, r);
    });

    socket.on("game:flip", () => {
      const c = ctx();
      if (!c || c.r.phase !== "reveal" || judge(c.r) !== c.me) return;
      c.r.phase = "pick";
      broadcast(io, c.r);
    });

    socket.on("game:play", ({ caption }) => {
      const c = ctx();
      if (!c || c.r.phase !== "pick" || judge(c.r) === c.me) return;
      if (!c.me.hand.includes(caption) || c.r.submissions.some((s) => s.playerId === c.me.id)) return;
      c.me.hand = c.me.hand.filter((x) => x !== caption);
      c.r.submissions.push({ playerId: c.me.id, caption });
      maybeAdvancePick(c.r);
      broadcast(io, c.r);
    });

    socket.on("game:swap", () => {
      const c = ctx();
      if (!c || c.me.swapUsed || c.r.phase === "lobby" || c.r.phase === "gameover") return;
      if (c.r.submissions.some((s) => s.playerId === c.me.id)) return;
      c.r.captionDiscard.push(...c.me.hand);
      c.me.hand = drawCaptions(c.r, c.r.handSize);
      c.me.swapUsed = true;
      broadcast(io, c.r);
    });

    socket.on("game:view", ({ index }) => {
      const c = ctx();
      if (!c || c.r.phase !== "judging" || judge(c.r) !== c.me) return;
      const n = c.r.submissions.length;
      c.r.viewing = ((Math.round(Number(index)) % n) + n) % n;
      broadcast(io, c.r);
    });

    socket.on("game:pick", ({ index }) => {
      const c = ctx();
      if (!c || c.r.phase !== "judging" || judge(c.r) !== c.me) return;
      const sub = c.r.submissions[index];
      const winner = sub && c.r.players.find((p) => p.id === sub.playerId);
      if (!winner) return;
      winner.score += 1;
      winner.wins.push({ photo: c.r.photo, caption: sub.caption });
      c.r.winnerId = winner.id;
      c.r.phase = winner.score >= c.r.target ? "gameover" : "result";
      broadcast(io, c.r);
    });

    socket.on("game:next", () => {
      const c = ctx();
      if (!c || c.r.phase !== "result") return;
      if (judge(c.r) !== c.me && c.r.hostId !== c.me.id) return;
      endRound(c.r);
      broadcast(io, c.r);
    });

    socket.on("game:skipJudge", () => {
      // Host escape hatch when the judge's phone went to sleep.
      const c = ctx();
      if (!c || c.r.hostId !== c.me.id) return;
      const { r } = c;
      if (r.phase !== "reveal" && r.phase !== "pick" && r.phase !== "judging") return;
      for (const s of r.submissions) r.players.find((x) => x.id === s.playerId)?.hand.push(s.caption);
      nextJudge(r);
      startRound(r);
      broadcast(io, r);
    });

    socket.on("game:rematch", () => {
      const c = ctx();
      if (!c || c.r.hostId !== c.me.id || c.r.phase !== "gameover") return;
      c.r.phase = "lobby";
      broadcast(io, c.r);
    });

    socket.on("disconnect", () => {
      const c = ctx();
      if (!c || c.me.socketId !== socket.id) return;
      c.me.socketId = null;
      if (connected(c.r).length === 0) c.r.emptySince = Date.now();
      // Don't make everyone wait on a player whose phone went to sleep.
      maybeAdvancePick(c.r);
      broadcast(io, c.r);
    });
  });
}
