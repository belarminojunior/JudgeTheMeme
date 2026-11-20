"use client";

import type { Socket } from "socket.io-client";
import { CAPTIONS } from "@/lib/captions";
import type { Lang, Strings } from "@/lib/i18n";
import type { ClientToServer, RoomView, ServerToClient } from "@/lib/online";
import { PICK_SECONDS } from "@/lib/game";
import {
  Button,
  CaptionsInPlay,
  CountdownBadge,
  HandPicker,
  JudgeCarousel,
  Meme,
  NoWinner,
  PhotoChoices,
  Scoreboard,
  Screen,
  TimerBar,
  useCountdown,
  WinningMeme,
} from "../ui";

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
  const secondsLeft = useCountdown(room.phase === "pick" ? room.pickMsLeft : null, room.round);
  const timer = secondsLeft !== null && <CountdownBadge seconds={secondsLeft} label={t.secondsLeft(secondsLeft)} />;
  const timerBar = secondsLeft !== null && <TimerBar seconds={secondsLeft} total={PICK_SECONDS} />;

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
    case "reveal": {
      const photos = room.photoChoices.length ? room.photoChoices : [""];
      body = isJudge ? (
        <>
          <h2 className="text-center font-display text-3xl uppercase text-pop">{t.flipPhoto}</h2>
          <PhotoChoices
            key={room.round}
            photos={photos}
            hint={t.flipPhotoHint(photos.length)}
            confirmLabel={`🔄 ${t.usePhoto}`}
            onPick={(index) => socket.emit("game:flip", { index })}
          />
        </>
      ) : (
        <>
          <Waiting text={t.waitingJudgeFlip(name(room.judgeId))} small />
          <PhotoChoices photos={photos} hint="" />
        </>
      );
      break;
    }

    case "pick":
      if (isJudge) {
        body = (
          <>
            <Meme photo={room.photo!} className="animate-flip-in" />
            <Waiting text={t.judgeWaiting} small />
            <div className="flex items-center justify-center gap-2">
              <Progress t={t} done={submittedCount} total={needed.length} />
              {timer}
            </div>
            {timerBar}
          </>
        );
      } else if (room.mySubmission !== null) {
        body = (
          <>
            <Meme photo={room.photo!} caption={cap(room.mySubmission)} />
            <Waiting text={t.captionPlayed} small />
            <div className="flex items-center justify-center gap-2">
              <Progress t={t} done={submittedCount} total={needed.length} />
              {timer}
            </div>
            {timerBar}
          </>
        );
      } else {
        body = <PickHand key={room.round} t={t} room={room} cap={cap} socket={socket} timer={timer} timerBar={timerBar} />;
      }
      break;

    case "judging": {
      const captions = room.submissions.map((s) => s.caption);
      body = isJudge ? (
        <>
          <p className="text-center font-bold text-white/70">{t.judging}</p>
          <JudgeCarousel
            key={room.round}
            t={t}
            photo={room.photo!}
            captions={captions}
            caption={cap}
            onPick={(caption) => socket.emit("game:pick", { caption })}
            onNone={() => socket.emit("game:noWinner")}
          />
        </>
      ) : (
        <>
          <p className="text-center font-bold text-white/70">{t.judgeIsChoosing(name(room.judgeId))}</p>
          {!me.submitted && (
            <p className="-mt-3 rounded-xl bg-hot/20 px-3 py-2 text-center text-sm font-semibold">{t.timeUp}</p>
          )}
          <CaptionsInPlay t={t} photo={room.photo!} captions={captions} mine={room.mySubmission} caption={cap} />
        </>
      );
      break;
    }

    case "result": {
      const win = room.submissions.find((s) => s.playerId === room.winnerId);
      body = (
        <>
          {win ? (
            <>
              <h2 className="animate-pop-in text-center font-display text-4xl uppercase text-pop">
                🎉 {t.winnerIs(name(room.winnerId))}
              </h2>
              <Meme photo={room.photo!} caption={cap(win.caption)} className="animate-pop-in" />
            </>
          ) : (
            <>
              <NoWinner title={t.noWinner} hint={t.noWinnerHint} />
              <Meme photo={room.photo!} />
            </>
          )}
          <ul className="flex flex-col gap-1.5 text-sm">
            {room.submissions
              .filter((s) => !win || s.playerId !== room.winnerId)
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
              <WinningMeme key={i} t={t} photo={w.photo} caption={cap(w.caption)} by={name(w.playerId)} />
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
  timer,
  timerBar,
}: {
  t: Strings;
  room: RoomView;
  cap: (i: number) => string;
  socket: Sock;
  timer: React.ReactNode;
  timerBar: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white/60">{t.chooseCaption}</p>
        {timer}
      </div>
      {timerBar}
      <HandPicker
        t={t}
        photo={room.photo!}
        hand={room.hand}
        caption={cap}
        swapsLeft={room.swapsLeft}
        canSwapCards={room.canSwapCards}
        onPlay={(caption) => socket.emit("game:play", { caption })}
        onSwapHand={() => socket.emit("game:swap")}
        onSwapCards={(cards) => socket.emit("game:swapCards", { cards })}
      />
    </>
  );
}
