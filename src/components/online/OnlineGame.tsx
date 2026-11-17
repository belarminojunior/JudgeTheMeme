"use client";

import { useState } from "react";
import type { Socket } from "socket.io-client";
import { CAPTIONS } from "@/lib/captions";
import type { Lang, Strings } from "@/lib/i18n";
import type { ClientToServer, RoomView, ServerToClient } from "@/lib/online";
import { Button, CaptionCard, Meme, Scoreboard, Screen } from "../ui";

type Sock = Socket<ServerToClient, ClientToServer>;

export default function OnlineGame({
  t,
  lang,
  room,
  socket,
  connected,
  onLeave,
}: {
  t: Strings;
  lang: Lang;
  room: RoomView;
  socket: Sock;
  connected: boolean;
  onLeave: () => void;
}) {
  const cap = (i: number) => CAPTIONS[i][lang];
  const name = (id: string | null | undefined) => room.players.find((p) => p.id === id)?.name ?? "?";
  const me = room.players.find((p) => p.id === room.me)!;
  const isJudge = room.judgeId === room.me;
  const isHost = room.hostId === room.me;
  const judge = room.players.find((p) => p.id === room.judgeId);
  const judgeAway = !!judge && !judge.connected;
  const needed = room.players.filter((p) => p.id !== room.judgeId && p.connected);
  const submittedCount = needed.filter((p) => p.submitted).length;

  const scoreboard = (
    <Scoreboard
      title={`${t.scoreboard} · ${t.pointsToWin}: ${room.target}`}
      players={room.players}
      target={room.target}
      judgeId={room.judgeId}
      pts={t.pts}
    />
  );

  const header = (
    <div className="flex items-center justify-between gap-2 text-sm font-bold text-white/60">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-mint" : "animate-pulse bg-hot"}`} />
        {t.round} {room.round} · {room.code}
      </span>
      <span className="truncate rounded-full bg-panel-2 px-3 py-1 text-pop">
        ⚖ {isJudge ? t.youAreJudge : t.judgeTurn(name(room.judgeId))}
      </span>
    </div>
  );

  const footer = (
    <div className="mt-auto flex flex-col gap-2 pt-2">
      {isHost && judgeAway && (room.phase === "reveal" || room.phase === "pick" || room.phase === "judging") && (
        <Button variant="ghost" onClick={() => socket.emit("game:skipJudge")}>
          ⏭ {t.skipJudge}
        </Button>
      )}
      <button onClick={onLeave} className="text-sm font-semibold text-white/40 hover:text-hot">
        {t.leaveRoom}
      </button>
    </div>
  );

  let body: React.ReactNode = null;

  switch (room.phase) {
    case "reveal":
      body = isJudge ? (
        <button
          onClick={() => socket.emit("game:flip")}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-4 border-dashed border-pop/50 bg-panel text-center transition hover:border-pop"
        >
          <span className="font-display text-5xl uppercase text-pop">?</span>
          <span className="font-bold">{t.flipPhoto}</span>
        </button>
      ) : (
        <Waiting text={t.waitingJudgeFlip(name(room.judgeId))} />
      );
      break;

    case "pick":
      if (isJudge) {
        body = (
          <>
            <Meme photo={room.photo!} className="animate-flip-in" />
            <Waiting text={t.judgeWaiting} small />
            <Progress t={t} done={submittedCount} total={needed.length} />
          </>
        );
      } else if (room.mySubmission !== null) {
        body = (
          <>
            <Meme photo={room.photo!} caption={cap(room.mySubmission)} />
            <Waiting text={t.captionPlayed} small />
            <Progress t={t} done={submittedCount} total={needed.length} />
          </>
        );
      } else {
        body = <PickHand key={room.round} t={t} room={room} cap={cap} socket={socket} />;
      }
      break;

    case "judging": {
      const n = room.submissions.length;
      const sub = room.submissions[room.viewing] ?? room.submissions[0];
      body = (
        <>
          <p className="text-center font-bold text-white/70">
            {isJudge ? t.judging : t.judgeIsChoosing(name(room.judgeId))}
          </p>
          <Meme key={room.viewing} photo={room.photo!} caption={cap(sub.caption)} className="animate-pop-in" />
          <div className="flex items-center justify-between gap-3">
            {isJudge && (
              <Button variant="ghost" aria-label="previous" onClick={() => socket.emit("game:view", { index: room.viewing - 1 })}>
                ←
              </Button>
            )}
            <div className="flex flex-1 justify-center gap-1.5">
              {room.submissions.map((_, i) => (
                <button
                  key={i}
                  aria-label={`${i + 1}`}
                  disabled={!isJudge}
                  onClick={() => socket.emit("game:view", { index: i })}
                  className={`h-3 w-3 rounded-full ${i === room.viewing ? "bg-pop" : "bg-white/25"}`}
                />
              ))}
            </div>
            {isJudge && (
              <Button variant="ghost" aria-label="next" onClick={() => socket.emit("game:view", { index: (room.viewing + 1) % n })}>
                →
              </Button>
            )}
          </div>
          {isJudge && (
            <Button variant="hot" onClick={() => socket.emit("game:pick", { index: room.viewing })}>
              🏆 {t.pickWinner}
            </Button>
          )}
        </>
      );
      break;
    }

    case "result": {
      const win = room.submissions.find((s) => s.playerId === room.winnerId);
      body = (
        <>
          <h2 className="animate-pop-in text-center font-display text-4xl uppercase text-pop">
            {room.winnerId === room.me ? "🎉 " : ""}
            {t.winnerIs(name(room.winnerId))}
          </h2>
          {win && <Meme photo={room.photo!} caption={cap(win.caption)} className="animate-pop-in" />}
          <ul className="flex flex-col gap-1.5 text-sm">
            {room.submissions
              .filter((s) => s.playerId !== room.winnerId)
              .map((s) => (
                <li key={s.playerId} className="rounded-xl bg-panel px-3 py-2 text-white/70">
                  <b className="text-white">{name(s.playerId)}:</b> {cap(s.caption)}
                </li>
              ))}
          </ul>
          {isJudge || isHost ? (
            <Button onClick={() => socket.emit("game:next")}>{t.nextRound}</Button>
          ) : (
            <Waiting text={t.waitingNext(name(room.judgeId))} small />
          )}
        </>
      );
      break;
    }

    case "gameover":
      body = (
        <>
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            <div className="animate-pop-in text-7xl">👑</div>
            <p className="font-bold uppercase tracking-widest text-white/50">{t.gameOver}</p>
            <h2 className="font-display text-5xl uppercase leading-tight text-pop">{t.champion(name(room.winnerId))}</h2>
          </div>
          {scoreboard}
          <h3 className="font-display text-2xl uppercase">{t.winningMemes}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {room.wins.map((w, i) => (
              <div key={i}>
                <Meme photo={w.photo} caption={cap(w.caption)} />
                <p className="mt-1 text-center text-sm font-bold text-white/60">— {name(w.playerId)}</p>
              </div>
            ))}
          </div>
          {isHost ? (
            <Button onClick={() => socket.emit("game:rematch")}>{t.newRound}</Button>
          ) : (
            <Waiting text={t.waitingHost} small />
          )}
        </>
      );
      return (
        <Screen>
          {body}
          {footer}
        </Screen>
      );
  }

  return (
    <Screen>
      {header}
      {body}
      {room.phase !== "pick" || isJudge || room.mySubmission !== null ? scoreboard : null}
      {me && footer}
    </Screen>
  );
}

function Waiting({ text, small }: { text: string; small?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-3 text-center ${small ? "py-2" : "py-16"}`}>
      {!small && <div className="animate-bounce text-6xl">⏳</div>}
      <p className="font-bold text-white/70">{text}</p>
    </div>
  );
}

function Progress({ t, done, total }: { t: Strings; done: number; total: number }) {
  return (
    <p className="mx-auto rounded-full bg-panel-2 px-4 py-1 text-sm font-bold">
      {done} {t.of} {total} {t.submitted}
    </p>
  );
}

function PickHand({
  t,
  room,
  cap,
  socket,
}: {
  t: Strings;
  room: RoomView;
  cap: (i: number) => string;
  socket: Sock;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected !== null && room.hand.includes(selected) ? selected : null;
  return (
    <>
      <p className="text-center text-sm font-bold text-white/60">{t.chooseCaption}</p>
      <Meme photo={room.photo!} caption={shown !== null ? cap(shown) : undefined} className="animate-flip-in" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {room.hand.map((c) => (
          <CaptionCard key={c} text={cap(c)} selected={shown === c} onClick={() => setSelected(c)} />
        ))}
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-background/95 px-4 pb-4 pt-3 backdrop-blur">
        <Button disabled={shown === null} onClick={() => shown !== null && socket.emit("game:play", { caption: shown })}>
          {t.playCard}
        </Button>
        <button
          disabled={room.swapUsed}
          onClick={() => socket.emit("game:swap")}
          className="text-sm font-semibold text-white/60 underline-offset-4 hover:underline disabled:no-underline disabled:opacity-40"
        >
          {room.swapUsed ? t.swapUsed : `↻ ${t.swapHand} (${t.swapHint})`}
        </button>
      </div>
    </>
  );
}
