import { CAPTIONS } from "./captions";

export type Phase =
  | "reveal" // judge flips the photo for everyone
  | "handoff" // pass the device to the next captioning player
  | "pick" // that player picks a caption
  | "judgeHandoff" // pass the device to the judge
  | "judging" // judge picks the winner
  | "result" // round winner shown
  | "gameover";

export interface Win {
  photo: string;
  caption: number;
}

export interface Player {
  id: string;
  name: string;
  hand: number[];
  score: number;
  swapUsed: boolean;
  wins: Win[];
}

export interface Submission {
  playerId: string;
  caption: number;
}

export interface GameState {
  phase: Phase;
  round: number;
  players: Player[];
  judgeIdx: number;
  target: number;
  handSize: number;
  captionDeck: number[];
  captionDiscard: number[];
  photoPool: string[];
  photoDeck: string[];
  photo: string;
  /** Face-down photos the judge chooses from at the start of the round. */
  photoChoices: string[];
  flipped: boolean;
  queue: string[]; // player ids still to submit this round
  submissions: Submission[]; // shuffled before judging
  winnerId: string | null;
}

export interface Settings {
  names: string[];
  target: number;
  handSize: number;
  /** Full photo pool for this game (meme templates and/or uploads). */
  photos: string[];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface CaptionDecks {
  captionDeck: number[];
  captionDiscard: number[];
}
export interface PhotoDecks {
  photoPool: string[];
  photoDeck: string[];
  photo: string;
}

export const newCaptionDeck = () => shuffle(CAPTIONS.map((_, i) => i));

export function drawCaptions(s: CaptionDecks, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    if (s.captionDeck.length === 0) {
      s.captionDeck = shuffle(s.captionDiscard);
      s.captionDiscard = [];
      if (s.captionDeck.length === 0) break;
    }
    out.push(s.captionDeck.pop()!);
  }
  return out;
}

export function drawPhoto(s: PhotoDecks): string {
  if (s.photoDeck.length === 0) {
    // Reshuffle, avoiding an immediate repeat of the current photo when possible.
    const pool = s.photoPool.length > 1 ? s.photoPool.filter((p) => p !== s.photo) : s.photoPool;
    s.photoDeck = shuffle(pool);
  }
  return s.photoDeck.pop()!;
}

/** How many face-down photos the judge chooses from each round. */
export const PHOTO_CHOICES = 5;
/** Seconds each player has to play a caption before they sit the round out. */
export const PICK_SECONDS = 45;

/** Draw the face-down photos for a round (different from each other when the pool allows). */
export function drawPhotoChoices(s: PhotoDecks): string[] {
  const want = Math.min(PHOTO_CHOICES, new Set(s.photoPool).size);
  const out: string[] = [];
  for (let tries = 0; out.length < want && tries < want * 4; tries++) {
    const p = drawPhoto(s);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** Use the chosen photo; the others go to the bottom of the deck for later rounds. */
export function choosePhoto(s: PhotoDecks, choices: string[], index: number): string {
  const i = Number.isInteger(index) && index >= 0 && index < choices.length ? index : 0;
  s.photoDeck.unshift(...choices.filter((_, k) => k !== i));
  return choices[i];
}

function nonJudgeQueue(s: GameState): string[] {
  const n = s.players.length;
  const ids: string[] = [];
  for (let k = 1; k < n; k++) ids.push(s.players[(s.judgeIdx + k) % n].id);
  return ids;
}

function clone(s: GameState): GameState {
  return structuredClone(s);
}

export function newGame(settings: Settings): GameState {
  const photoPool = settings.photos;
  const s: GameState = {
    phase: "reveal",
    round: 1,
    players: settings.names.map((name, i) => ({
      id: `p${i}-${name}`,
      name,
      hand: [],
      score: 0,
      swapUsed: false,
      wins: [],
    })),
    judgeIdx: Math.floor(Math.random() * settings.names.length),
    target: settings.target,
    handSize: settings.handSize,
    captionDeck: newCaptionDeck(),
    captionDiscard: [],
    photoPool,
    photoDeck: shuffle(photoPool),
    photo: "",
    photoChoices: [],
    flipped: false,
    queue: [],
    submissions: [],
    winnerId: null,
  };
  for (const p of s.players) p.hand = drawCaptions(s, s.handSize);
  s.photoChoices = drawPhotoChoices(s);
  s.queue = nonJudgeQueue(s);
  return s;
}

/** The judge flips one of the face-down photos; it becomes this round's meme. */
export function flip(state: GameState, index = 0): GameState {
  const s = clone(state);
  // Games saved before photo choices existed already have their photo.
  if (s.photoChoices?.length) s.photo = choosePhoto(s, s.photoChoices, index);
  s.photoChoices = [];
  s.flipped = true;
  return s;
}

/** Captioners still in the queue are done (played or out of time): go to the judge, or skip the round. */
function finishQueueIfDone(s: GameState): GameState {
  if (s.queue.length > 0) {
    s.phase = "handoff";
    return s;
  }
  if (s.submissions.length === 0) return nextRound(s); // nobody played in time
  s.submissions = shuffle(s.submissions);
  s.phase = "judgeHandoff";
  return s;
}

/** A player ran out of time: they sit this round out and keep their hand. */
export function skipPlayer(state: GameState, playerId: string): GameState {
  const s = clone(state);
  s.queue = s.queue.filter((id) => id !== playerId);
  return finishQueueIfDone(s);
}

export function startCaptioning(state: GameState): GameState {
  return { ...state, phase: "handoff" };
}

export function showHand(state: GameState): GameState {
  return { ...state, phase: "pick" };
}

export function swapHand(state: GameState, playerId: string): GameState {
  const s = clone(state);
  const p = s.players.find((x) => x.id === playerId)!;
  if (p.swapUsed) return state;
  s.captionDiscard.push(...p.hand);
  p.hand = drawCaptions(s, s.handSize);
  p.swapUsed = true;
  return s;
}

export function playCard(state: GameState, playerId: string, caption: number): GameState {
  const s = clone(state);
  const p = s.players.find((x) => x.id === playerId)!;
  p.hand = p.hand.filter((c) => c !== caption);
  s.submissions.push({ playerId, caption });
  s.queue = s.queue.filter((id) => id !== playerId);
  return finishQueueIfDone(s);
}

export function showCaptionsToJudge(state: GameState): GameState {
  return { ...state, phase: "judging" };
}

export function pickWinner(state: GameState, playerId: string): GameState {
  const s = clone(state);
  const winner = s.players.find((x) => x.id === playerId)!;
  const sub = s.submissions.find((x) => x.playerId === playerId)!;
  winner.score += 1;
  winner.wins.push({ photo: s.photo, caption: sub.caption });
  s.winnerId = playerId;
  s.phase = winner.score >= s.target ? "gameover" : "result";
  return s;
}

export function nextRound(state: GameState): GameState {
  const s = clone(state);
  s.captionDiscard.push(...s.submissions.map((x) => x.caption));
  for (const p of s.players) {
    const missing = s.handSize - p.hand.length;
    if (missing > 0) p.hand.push(...drawCaptions(s, missing));
  }
  s.round += 1;
  s.judgeIdx = (s.judgeIdx + 1) % s.players.length;
  s.photoChoices = drawPhotoChoices(s);
  s.flipped = false;
  s.submissions = [];
  s.winnerId = null;
  s.queue = nonJudgeQueue(s);
  s.phase = "reveal";
  return s;
}

export function rematch(state: GameState): GameState {
  return newGame({
    names: state.players.map((p) => p.name),
    target: state.target,
    handSize: state.handSize,
    photos: state.photoPool,
  });
}
