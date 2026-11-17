"use client";

import { useEffect, useState } from "react";
import { CAPTIONS } from "@/lib/captions";
import * as G from "@/lib/game";
import { STRINGS, type Lang, type Strings } from "@/lib/i18n";
import Setup from "./Setup";
import OnlineEntry from "./online/OnlineEntry";
import { Button, CaptionCard, Logo, Meme, Scoreboard as SharedScoreboard, Screen } from "./ui";

const STATE_KEY = "jtm-state-v1";
const LANG_KEY = "jtm-lang";
const NAMES_KEY = "jtm-names";

// Storage can throw (private mode, quota, blocked site data); the game must still work without it.
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

type View = "home" | "setup" | "game" | "online";

const ONLINE_KEY = "jtm-online";
const roomFromUrl = () => new URLSearchParams(window.location.search).get("room");

export default function Game() {
  const [lang, setLang] = useState<Lang>(() => load<Lang>(LANG_KEY, "en"));
  const [game, setGame] = useState<G.GameState | null>(() => load<G.GameState | null>(STATE_KEY, null));
  // A QR/invite link (?room=CODE) or an online session in progress opens the online screen.
  const [view, setView] = useState<View>(() => (roomFromUrl() || load(ONLINE_KEY, null) ? "online" : "home"));
  const t = STRINGS[lang];

  useEffect(() => save(LANG_KEY, lang), [lang]);
  useEffect(() => save(STATE_KEY, game), [game]);
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt" : "en";
  }, [lang]);

  const caption = (i: number) => CAPTIONS[i][lang];

  function quit() {
    if (confirm(t.quitConfirm)) {
      setGame(null);
      setView("home");
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-2 px-4 pt-4">
        {view === "home" ? <span /> : (
          <button onClick={() => view !== "game" && view !== "online" && setView("home")} aria-label="Home">
            <Logo size="sm" />
          </button>
        )}
        <div className="flex items-center gap-2">
          {view === "game" && game && game.phase !== "gameover" && (
            <button onClick={quit} className="rounded-full bg-panel-2 px-3 py-1.5 text-xs font-bold text-white/70">
              {t.quit}
            </button>
          )}
          <LangToggle lang={lang} setLang={setLang} />
        </div>
      </header>

      {view === "home" && (
        <Home
          t={t}
          hasSaved={!!game}
          onNew={() => setView("setup")}
          onOnline={() => setView("online")}
          onContinue={() => setView("game")}
        />
      )}

      {view === "online" && (
        <OnlineEntry
          t={t}
          lang={lang}
          initialCode={roomFromUrl() ?? ""}
          onExit={() => {
            window.history.replaceState(null, "", window.location.pathname);
            setView("home");
          }}
        />
      )}

      {view === "setup" && (
        <Setup
          t={t}
          initialNames={load<string[]>(NAMES_KEY, [])}
          onBack={() => setView("home")}
          onStart={(settings) => {
            save(NAMES_KEY, settings.names);
            setGame(G.newGame(settings));
            setView("game");
          }}
        />
      )}

      {view === "game" && game && (
        <Play
          t={t}
          game={game}
          setGame={setGame}
          caption={caption}
          onMenu={() => {
            setGame(null);
            setView("home");
          }}
        />
      )}
    </main>
  );
}

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex rounded-full bg-panel-2 p-1 text-xs font-extrabold">
      {(["en", "pt"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full px-3 py-1 uppercase ${lang === l ? "bg-pop text-ink" : "text-white/60"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Home({
  t,
  hasSaved,
  onNew,
  onOnline,
  onContinue,
}: {
  t: Strings;
  hasSaved: boolean;
  onNew: () => void;
  onOnline: () => void;
  onContinue: () => void;
}) {
  return (
    <Screen>
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <Logo />
        <p className="text-lg text-white/70">{t.tagline}</p>
      </div>

      <div className="relative mx-auto my-2 h-56 w-72">
        <div className="absolute left-2 top-4 w-40 -rotate-12 rounded-xl bg-white p-3 text-sm font-bold text-ink shadow-xl">
          {STRINGS.en === t ? "Me pretending to understand the group project." : "Eu a fingir que percebo o trabalho de grupo."}
        </div>
        <div className="absolute right-2 top-0 w-44 rotate-6 overflow-hidden rounded-xl bg-white p-1.5 shadow-2xl">
          <img src="https://picsum.photos/id/237/400/300" alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
        </div>
        <div className="absolute bottom-0 left-16 w-44 rotate-3 rounded-xl bg-pop p-3 text-sm font-bold text-ink shadow-xl">
          {STRINGS.en === t ? "When the Wi-Fi drops for three seconds." : "Quando o Wi-Fi cai durante três segundos."}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {hasSaved && (
          <Button variant="hot" onClick={onContinue}>
            {t.continueGame}
          </Button>
        )}
        <Button onClick={onOnline}>📱 {t.online}</Button>
        <Button variant="ghost" onClick={onNew}>
          🔁 {t.onePhone}
        </Button>
      </div>

      <details className="rounded-2xl bg-panel p-4">
        <summary className="cursor-pointer font-bold">{t.howToPlay}</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-white/80">
          {t.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </details>
    </Screen>
  );
}

function Play({
  t,
  game,
  setGame,
  caption,
  onMenu,
}: {
  t: Strings;
  game: G.GameState;
  setGame: (g: G.GameState) => void;
  caption: (i: number) => string;
  onMenu: () => void;
}) {
  const judge = game.players[game.judgeIdx];
  const current = game.players.find((p) => p.id === game.queue[0]);
  const byId = (id: string | null) => game.players.find((p) => p.id === id);

  const status = (
    <div className="flex items-center justify-between text-sm font-bold text-white/60">
      <span>
        {t.round} {game.round}
      </span>
      <span className="rounded-full bg-panel-2 px-3 py-1 text-pop">⚖ {t.judgeTurn(judge.name)}</span>
    </div>
  );

  switch (game.phase) {
    case "reveal":
      return (
        <Screen>
          {status}
          {game.flipped ? (
            <>
              <Meme photo={game.photo} className="animate-flip-in" />
              <Button onClick={() => setGame(G.startCaptioning(game))}>{t.readyToCaption}</Button>
            </>
          ) : (
            <button
              onClick={() => setGame(G.flip(game))}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-4 border-dashed border-pop/50 bg-panel text-center transition hover:border-pop"
            >
              <span className="font-display text-5xl uppercase text-pop">?</span>
              <span className="font-bold">{t.flipPhoto}</span>
              <span className="text-sm text-white/50">{t.judgeTurn(judge.name)}</span>
            </button>
          )}
          <Scoreboard t={t} game={game} />
        </Screen>
      );

    case "handoff":
      return (
        <Handoff
          t={t}
          title={t.passTo(current!.name)}
          button={t.imPlayer(current!.name)}
          progress={`${game.submissions.length} ${t.of} ${game.players.length - 1} ${t.submitted}`}
          onReady={() => setGame(G.showHand(game))}
        />
      );

    case "pick":
      return (
        <Pick
          key={current!.id}
          t={t}
          game={game}
          player={current!}
          caption={caption}
          onSwap={() => setGame(G.swapHand(game, current!.id))}
          onPlay={(c) => setGame(G.playCard(game, current!.id, c))}
        />
      );

    case "judgeHandoff":
      return (
        <Handoff
          t={t}
          title={t.passToJudge(judge.name)}
          button={t.imJudge(judge.name)}
          onReady={() => setGame(G.showCaptionsToJudge(game))}
        />
      );

    case "judging":
      return <Judging t={t} game={game} caption={caption} onPick={(id) => setGame(G.pickWinner(game, id))} />;

    case "result": {
      const winner = byId(game.winnerId)!;
      const sub = game.submissions.find((s) => s.playerId === winner.id)!;
      return (
        <Screen>
          {status}
          <h2 className="animate-pop-in text-center font-display text-4xl uppercase text-pop">
            {t.winnerIs(winner.name)}
          </h2>
          <Meme photo={game.photo} caption={caption(sub.caption)} className="animate-pop-in" />
          <ul className="flex flex-col gap-1.5 text-sm">
            {game.submissions
              .filter((s) => s.playerId !== winner.id)
              .map((s) => (
                <li key={s.playerId} className="rounded-xl bg-panel px-3 py-2 text-white/70">
                  <b className="text-white">{byId(s.playerId)!.name}:</b> {caption(s.caption)}
                </li>
              ))}
          </ul>
          <Scoreboard t={t} game={game} />
          <Button onClick={() => setGame(G.nextRound(game))}>{t.nextRound}</Button>
        </Screen>
      );
    }

    case "gameover":
      return <GameOver t={t} game={game} caption={caption} onRematch={() => setGame(G.rematch(game))} onMenu={onMenu} />;
  }
}

function Handoff({
  t,
  title,
  button,
  progress,
  onReady,
}: {
  t: Strings;
  title: string;
  button: string;
  progress?: string;
  onReady: () => void;
}) {
  return (
    <Screen>
      <div className="my-auto flex flex-col items-center gap-6 text-center">
        <div className="text-7xl">🤫</div>
        <h2 className="font-display text-4xl uppercase leading-tight text-pop">{title}</h2>
        <p className="text-white/60">{t.keepSecret}</p>
        {progress && <p className="rounded-full bg-panel-2 px-4 py-1 text-sm font-bold">{progress}</p>}
        <Button className="w-full" onClick={onReady}>
          {button}
        </Button>
      </div>
    </Screen>
  );
}

function Pick({
  t,
  game,
  player,
  caption,
  onSwap,
  onPlay,
}: {
  t: Strings;
  game: G.GameState;
  player: G.Player;
  caption: (i: number) => string;
  onSwap: () => void;
  onPlay: (c: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected !== null && player.hand.includes(selected) ? selected : null;

  return (
    <Screen>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl uppercase text-pop">{player.name}</h2>
        <span className="text-sm font-bold text-white/60">{t.chooseCaption}</span>
      </div>
      <Meme photo={game.photo} caption={shown !== null ? caption(shown) : undefined} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {player.hand.map((c) => (
          <CaptionCard key={c} text={caption(c)} selected={shown === c} onClick={() => setSelected(c)} />
        ))}
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-background/95 px-4 pb-4 pt-3 backdrop-blur">
        <Button disabled={shown === null} onClick={() => shown !== null && onPlay(shown)}>
          {t.playCard}
        </Button>
        <button
          disabled={player.swapUsed}
          onClick={onSwap}
          className="text-sm font-semibold text-white/60 underline-offset-4 hover:underline disabled:no-underline disabled:opacity-40"
        >
          {player.swapUsed ? t.swapUsed : `↻ ${t.swapHand} (${t.swapHint})`}
        </button>
      </div>
    </Screen>
  );
}

function Judging({
  t,
  game,
  caption,
  onPick,
}: {
  t: Strings;
  game: G.GameState;
  caption: (i: number) => string;
  onPick: (playerId: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const sub = game.submissions[idx];
  return (
    <Screen>
      <p className="text-center font-bold text-white/70">{t.judging}</p>
      <Meme key={idx} photo={game.photo} caption={caption(sub.caption)} className="animate-pop-in" />
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" aria-label="previous" onClick={() => setIdx((i) => (i - 1 + game.submissions.length) % game.submissions.length)}>
          ←
        </Button>
        <div className="flex gap-1.5">
          {game.submissions.map((_, i) => (
            <button
              key={i}
              aria-label={`${i + 1}`}
              onClick={() => setIdx(i)}
              className={`h-3 w-3 rounded-full ${i === idx ? "bg-pop" : "bg-white/25"}`}
            />
          ))}
        </div>
        <Button variant="ghost" aria-label="next" onClick={() => setIdx((i) => (i + 1) % game.submissions.length)}>
          →
        </Button>
      </div>
      <Button variant="hot" onClick={() => onPick(sub.playerId)}>
        🏆 {t.pickWinner}
      </Button>
    </Screen>
  );
}

function Scoreboard({ t, game }: { t: Strings; game: G.GameState }) {
  return (
    <SharedScoreboard
      title={`${t.scoreboard} · ${t.pointsToWin}: ${game.target}`}
      players={game.players}
      target={game.target}
      judgeId={game.players[game.judgeIdx].id}
      pts={t.pts}
    />
  );
}

function GameOver({
  t,
  game,
  caption,
  onRematch,
  onMenu,
}: {
  t: Strings;
  game: G.GameState;
  caption: (i: number) => string;
  onRematch: () => void;
  onMenu: () => void;
}) {
  const champ = game.players.find((p) => p.id === game.winnerId)!;
  const allWins = game.players.flatMap((p) => p.wins.map((w) => ({ ...w, name: p.name })));
  return (
    <Screen>
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <div className="animate-pop-in text-7xl">👑</div>
        <p className="font-bold uppercase tracking-widest text-white/50">{t.gameOver}</p>
        <h2 className="font-display text-5xl uppercase leading-tight text-pop">{t.champion(champ.name)}</h2>
      </div>
      <Scoreboard t={t} game={game} />
      <h3 className="font-display text-2xl uppercase">{t.winningMemes}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {allWins.map((w, i) => (
          <div key={i}>
            <Meme photo={w.photo} caption={caption(w.caption)} />
            <p className="mt-1 text-center text-sm font-bold text-white/60">— {w.name}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Button onClick={onRematch}>{t.playAgain}</Button>
        <Button variant="ghost" onClick={onMenu}>
          {t.mainMenu}
        </Button>
      </div>
    </Screen>
  );
}
