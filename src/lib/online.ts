// Types shared by the Socket.IO server (src/server) and the online client (src/components/online).

export type OnlinePhase = "lobby" | "reveal" | "pick" | "judging" | "result" | "gameover";

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  submitted: boolean;
}

/** What one player is allowed to see. Hands and authorship stay on the server until reveal. */
export interface RoomView {
  code: string;
  me: string;
  hostId: string;
  phase: OnlinePhase;
  round: number;
  judgeId: string | null;
  target: number;
  handSize: number;
  players: PublicPlayer[];
  photo: string | null;
  /** During "reveal": how many face-down photos the judge can pick from. */
  photoChoices: number;
  /** During "pick": ms left to play a caption when this view was sent. */
  pickMsLeft: number | null;
  hand: number[];
  swapUsed: boolean;
  mySubmission: number | null;
  /** Captions in judging order; playerId only present after the winner is picked. */
  submissions: { caption: number; playerId?: string }[];
  /** Which submission the judge is currently showing (mirrored on everyone's screen). */
  viewing: number;
  winnerId: string | null;
  /** Filled at game over: every winning meme. */
  wins: { playerId: string; photo: string; caption: number }[];
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: OnlineError }) => void;

export type OnlineError = "noRoom" | "nameTaken" | "roomFull" | "notAllowed" | "needPlayers" | "badName";

export interface ClientToServer {
  "room:create": (p: { name: string }, ack: Ack<{ code: string; playerId: string }>) => void;
  "room:join": (p: { code: string; name: string; playerId?: string }, ack: Ack<{ code: string; playerId: string }>) => void;
  "room:leave": () => void;
  "room:kick": (p: { playerId: string }) => void;
  "game:start": (p: { target: number; handSize: number }, ack: Ack) => void;
  "game:flip": (p: { index: number }) => void;
  "game:play": (p: { caption: number }) => void;
  "game:swap": () => void;
  "game:view": (p: { index: number }) => void;
  "game:pick": (p: { index: number }) => void;
  "game:next": () => void;
  "game:skipJudge": () => void;
  "game:rematch": () => void;
}

export interface ServerToClient {
  "room:state": (view: RoomView) => void;
  "room:kicked": () => void;
}

export const MAX_ONLINE_PLAYERS = 12;
