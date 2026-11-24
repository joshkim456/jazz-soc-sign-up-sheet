"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apply, INSTS, queueFor, SLOTS, type Action, type Inst, type Player, type State } from "@/lib/jam";

const PIN_KEY = "jam-pin";
const POLL_MS = 2000;

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
);
const PLUS = "M12 4v16M4 12h16";
const MINUS = "M4 12h16";
const UNDO = "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v6";
const MORE = "M4 7h16M4 12h16M4 17h16";
const ARROW = "M3 12h17M14 6l6 6-6 6";

type Sheet = { kind: "add"; inst?: Inst } | { kind: "player"; id: string } | { kind: "menu" } | null;

export default function Page() {
  const [state, setState] = useState<State | null>(null);
  const [locked, setLocked] = useState(false);
  const [badPin, setBadPin] = useState(false);
  const [offline, setOffline] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const pin = useRef("");
  const epoch = useRef(0); // bumped by every mutation so stale polls are dropped
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const call = useCallback(async (action?: Action) => {
    const res = await fetch("/api/jam", {
      method: action ? "POST" : "GET",
      headers: { "x-jam-pin": pin.current, "content-type": "application/json" },
      body: action ? JSON.stringify(action) : undefined,
      cache: "no-store",
    });
    if (res.status === 401) {
      setLocked(true);
      throw new Error("locked");
    }
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { state: State; persistent: boolean };
  }, []);

  const refresh = useCallback(async () => {
    const at = epoch.current;
    try {
      const data = await call();
      setOffline(false);
      setLocked(false);
      setPersistent(data.persistent);
      if (at === epoch.current) setState(data.state);
      return true;
    } catch (e) {
      if ((e as Error).message !== "locked") setOffline(true);
      return false;
    }
  }, [call]);

  useEffect(() => {
    pin.current = localStorage.getItem(PIN_KEY) ?? "";
    refresh();
    const t = setInterval(() => !document.hidden && refresh(), POLL_MS);
    const wake = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh]);

  // Show the change instantly, then let the server's answer replace it.
  const act = useCallback(
    (action: Action) => {
      epoch.current += 1;
      setState((s) => (s ? apply(s, action) : s));
      chain.current = chain.current.then(async () => {
        try {
          const data = await call(action);
          epoch.current += 1;
          setOffline(false);
          setState(data.state);
        } catch {
          setOffline(true);
          epoch.current += 1;
          refresh();
        }
      });
    },
    [call, refresh],
  );

  if (locked) {
    return (
      <main className="pin">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("pin") as HTMLInputElement;
            pin.current = input.value;
            if (await refresh()) localStorage.setItem(PIN_KEY, input.value);
            else {
              input.value = "";
              setBadPin(true);
            }
          }}
        >
          <input
            name="pin"
            className={`field ${badPin ? "bad" : ""}`}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            placeholder="PIN"
            aria-label="PIN"
            autoFocus
            onInput={() => setBadPin(false)}
          />
          <button className="btn solid">
            Enter <Icon d={ARROW} />
          </button>
        </form>
      </main>
    );
  }

  if (!state) return <main className="app" />;

  const { players, limit } = state;
  const selected = sheet?.kind === "player" ? players.find((p) => p.id === sheet.id) : undefined;
  const close = () => setSheet(null);

  // What one more tap of "Next tune" would do: who comes on, who goes off.
  const after = new Map(apply(state, { type: "next" }).players.map((p) => [p.id, p.slot]));
  const comingOn = (p: Player) => !p.slot && Boolean(after.get(p.id));
  const goingOff = (p: Player) => Boolean(p.slot) && !after.get(p.id);

  // Each line of the sheet: the player on stage, then that line's share of the queue.
  // The two horn lines deal the horn queue out between them, so each column reads as the next pair.
  const lines = SLOTS.map((slot) => {
    const queue = queueFor(players, slot.inst);
    const share =
      slot.inst === "horn" ? queue.filter((_, i) => i % 2 === (slot.id === "horn1" ? 0 : 1)) : queue;
    return { slot, on: players.find((p) => p.slot === slot.id), share };
  });
  const places = Math.max(3, ...lines.map((l) => l.share.length + 1));
  const at = (l: number, p: number) => ({ "--l": l, "--p": p }) as React.CSSProperties;

  return (
    <main className="app">
      <header className="mast">
        <h1 className="tune">
          <span className="caps">Tune</span>
          <b>{state.tune}</b>
        </h1>
        <div className="tools">
          {(offline || !persistent) && (
            <span className="caps" role="status">
              {offline ? "Offline" : "No sync"}
            </span>
          )}
          <button className="tool" aria-label="Undo" disabled={!state.prev} onClick={() => act({ type: "undo" })}>
            <Icon d={UNDO} />
          </button>
          <button className="tool" aria-label="Menu" onClick={() => setSheet({ kind: "menu" })}>
            <Icon d={MORE} />
          </button>
        </div>
      </header>

      <div className="scroll">
        <section className="grid" style={{ "--n": places } as React.CSSProperties}>
          <div className="c corner hd" style={at(0, -1)} />
          <div className="c hd stage caps" style={at(0, 0)}>
            On
          </div>
          {Array.from({ length: places }, (_, i) => (
            <div key={i} className="c hd caps" style={at(0, i + 1)}>
              {i === 0 ? "Next" : `+${i + 1}`}
            </div>
          ))}

          {lines.map(({ slot, on, share }, i) => {
            const last = i === lines.length - 1 ? "last" : "";
            const l = i + 1;
            return (
              <Line key={slot.id}>
                <div className={`c lab caps ${last}`} style={at(l, -1)}>
                  {slot.label}
                </div>
                {on ? (
                  <button
                    className={`c stage on ${last}`}
                    style={at(l, 0)}
                    onClick={() => setSheet({ kind: "player", id: on.id })}
                  >
                    <span>{on.name}</span>
                    {goingOff(on) ? (
                      <span className="out">Out</span>
                    ) : (
                      <span className="tally" aria-label={`${on.tunes} of ${limit}`}>
                        {Array.from({ length: Math.max(limit, on.tunes) }, (_, t) => (
                          <i key={t} className={t < on.tunes ? "done" : ""} />
                        ))}
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    className={`c stage ${slot.required ? "gap" : ""} ${last}`}
                    style={at(l, 0)}
                    aria-label={`Add ${slot.label}`}
                    onClick={() => setSheet({ kind: "add", inst: slot.inst })}
                  />
                )}
                {Array.from({ length: places }, (_, j) => {
                  const p = share[j];
                  return p ? (
                    <button
                      key={p.id}
                      className={`c q ${comingOn(p) ? "in" : ""} ${last}`}
                      style={at(l, j + 1)}
                      onClick={() => setSheet({ kind: "player", id: p.id })}
                    >
                      <span>{p.name}</span>
                    </button>
                  ) : (
                    <button
                      key={j}
                      className={`c q ${last}`}
                      style={at(l, j + 1)}
                      aria-label={`Add ${slot.label}`}
                      onClick={() => setSheet({ kind: "add", inst: slot.inst })}
                    />
                  );
                })}
              </Line>
            );
          })}
        </section>
      </div>

      <nav className="bar">
        <div>
          <button className="add" aria-label="Add player" onClick={() => setSheet({ kind: "add" })}>
            <Icon d={PLUS} />
          </button>
          <button className="btn solid" onClick={() => act({ type: "next" })}>
            Next tune <Icon d={ARROW} />
          </button>
        </div>
      </nav>

      {sheet?.kind === "add" && (
        <AddSheet
          inst={sheet.inst}
          close={close}
          add={(name, inst) => {
            act({ type: "add", id: crypto.randomUUID(), name, inst });
            close();
          }}
        />
      )}

      {selected && (
        <PlayerSheet
          player={selected}
          canSwap={queueFor(players, selected.inst).length > 0}
          isFirst={queueFor(players, selected.inst)[0]?.id === selected.id}
          act={(a) => {
            act(a);
            close();
          }}
          close={close}
        />
      )}

      {sheet?.kind === "menu" && (
        <MenuSheet
          limit={limit}
          setLimit={(n) => act({ type: "limit", n })}
          reset={() => {
            act({ type: "reset" });
            close();
          }}
          close={close}
        />
      )}
    </main>
  );
}

const Line = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function SheetFrame({ close, children }: { close: () => void; children: React.ReactNode }) {
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function AddSheet(props: { inst?: Inst; add: (name: string, inst: Inst) => void; close: () => void }) {
  const [name, setName] = useState("");
  const [inst, setInst] = useState<Inst | null>(props.inst ?? null);
  const ready = name.trim() && inst;
  return (
    <SheetFrame close={props.close}>
      <form
        style={{ display: "contents" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) props.add(name.trim(), inst);
        }}
      >
        <input
          className="field"
          placeholder="Name"
          aria-label="Name"
          value={name}
          maxLength={24}
          autoFocus
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="picks">
          {INSTS.map((i) => (
            <button
              type="button"
              key={i.id}
              className={`pick caps ${inst === i.id ? "sel" : ""}`}
              aria-pressed={inst === i.id}
              onClick={() => setInst(i.id)}
            >
              {i.label}
            </button>
          ))}
        </div>
        <button className="btn solid" disabled={!ready}>
          Add <Icon d={PLUS} />
        </button>
      </form>
    </SheetFrame>
  );
}

function PlayerSheet(props: {
  player: Player;
  canSwap: boolean;
  isFirst: boolean;
  act: (a: Action) => void;
  close: () => void;
}) {
  const { player: p, act } = props;
  const label = INSTS.find((i) => i.id === p.inst)!.label;
  return (
    <SheetFrame close={props.close}>
      <h2 className="who">
        <small className="caps">{label}</small>
        {p.name}
      </h2>
      {p.slot ? (
        <button className="btn solid" disabled={!props.canSwap} onClick={() => act({ type: "swap", id: p.id })}>
          Swap out
        </button>
      ) : (
        <button className="btn solid" disabled={props.isFirst} onClick={() => act({ type: "bump", id: p.id })}>
          Move to front
        </button>
      )}
      <button className="btn" onClick={() => act({ type: "remove", id: p.id })}>
        Remove
      </button>
    </SheetFrame>
  );
}

function MenuSheet(props: { limit: number; setLimit: (n: number) => void; reset: () => void; close: () => void }) {
  const [sure, setSure] = useState(false);
  const { limit, setLimit } = props;
  return (
    <SheetFrame close={props.close}>
      <div className="stepper caps">
        Tunes each
        <div>
          <button aria-label="Fewer" disabled={limit <= 1} onClick={() => setLimit(limit - 1)}>
            <Icon d={MINUS} />
          </button>
          <b>{limit}</b>
          <button aria-label="More" disabled={limit >= 5} onClick={() => setLimit(limit + 1)}>
            <Icon d={PLUS} />
          </button>
        </div>
      </div>
      {sure ? (
        <button className="btn sure" onClick={props.reset}>
          Clear everyone?
        </button>
      ) : (
        <button className="btn" onClick={() => setSure(true)}>
          New jam
        </button>
      )}
    </SheetFrame>
  );
}
