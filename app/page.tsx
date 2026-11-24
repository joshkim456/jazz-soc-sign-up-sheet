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
const PLUS = "M12 5v14M5 12h14";
const MINUS = "M5 12h14";
const UNDO = "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3";
const MORE = "M5 12h.01M12 12h.01M19 12h.01";
const SKIP = "M5 5l9 7-9 7zM19 5v14";

type Sheet = { kind: "add" } | { kind: "player"; id: string } | { kind: "menu" } | null;

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
          <button className="btn primary">Enter</button>
        </form>
      </main>
    );
  }

  if (!state) return <main className="app" />;

  const { players, limit } = state;
  const selected = sheet?.kind === "player" ? players.find((p) => p.id === sheet.id) : undefined;
  const close = () => setSheet(null);

  return (
    <main className="app">
      <header className="top">
        <h1 className="tune">
          Tune <b>{state.tune}</b>
        </h1>
        {(offline || !persistent) && (
          <span className="offline" role="status" aria-label={offline ? "Offline" : "No database"} />
        )}
        <button className="icon" aria-label="Undo" disabled={!state.prev} onClick={() => act({ type: "undo" })}>
          <Icon d={UNDO} />
        </button>
        <button className="icon" aria-label="Menu" onClick={() => setSheet({ kind: "menu" })}>
          <Icon d={MORE} />
        </button>
      </header>

      <section className="table">
        <div className="head" style={{ paddingLeft: 0 }} />
        <div className="head">On</div>
        <div className="head">Next</div>
        {SLOTS.map((slot) => {
          const p = players.find((x) => x.slot === slot.id);
          const waiting = queueFor(players, slot.inst);
          const second = slot.id === "horn2";
          return (
            <Row key={slot.id}>
              <div className={`label ${second ? "joined" : ""}`}>{slot.label}</div>
              <div className={`stage ${second ? "joined" : ""}`}>
                {p ? (
                  <button
                    className={`on ${p.tunes >= limit - 1 && waiting.length ? "last" : ""}`}
                    onClick={() => setSheet({ kind: "player", id: p.id })}
                  >
                    <span>{p.name}</span>
                    <span className="pips" aria-label={`${p.tunes} of ${limit}`}>
                      {Array.from({ length: Math.max(limit, p.tunes) }, (_, i) => (
                        <i key={i} className={i < p.tunes ? "done" : ""} />
                      ))}
                    </span>
                  </button>
                ) : (
                  <div
                    className={`empty ${slot.required ? "required" : ""}`}
                    aria-label={slot.required ? "Needed" : "Empty"}
                  />
                )}
              </div>
              {!second && (
                <div className="next" style={slot.id === "horn1" ? { gridRow: "span 2" } : undefined}>
                  {waiting.map((w) => (
                    <button key={w.id} className="wait" onClick={() => setSheet({ kind: "player", id: w.id })}>
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </Row>
          );
        })}
      </section>

      <nav className="bar">
        <div>
          <button className="fab" aria-label="Add player" onClick={() => setSheet({ kind: "add" })}>
            <Icon d={PLUS} />
          </button>
          <button className="go" onClick={() => act({ type: "next" })}>
            Next tune <Icon d={SKIP} />
          </button>
        </div>
      </nav>

      {sheet?.kind === "add" && (
        <AddSheet
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

const Row = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function SheetFrame({ close, children }: { close: () => void; children: React.ReactNode }) {
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function AddSheet({ add, close }: { add: (name: string, inst: Inst) => void; close: () => void }) {
  const [name, setName] = useState("");
  const [inst, setInst] = useState<Inst | null>(null);
  const ready = name.trim() && inst;
  return (
    <SheetFrame close={close}>
      <form
        style={{ display: "contents" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) add(name.trim(), inst);
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
        <div className="chips">
          {INSTS.map((i) => (
            <button
              type="button"
              key={i.id}
              className={`chip ${inst === i.id ? "sel" : ""}`}
              aria-pressed={inst === i.id}
              onClick={() => setInst(i.id)}
            >
              {i.label}
            </button>
          ))}
        </div>
        <button className="btn primary" disabled={!ready}>
          Add
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
      <h2>
        <small>{label}</small>
        {p.name}
      </h2>
      {p.slot ? (
        <button className="btn primary" disabled={!props.canSwap} onClick={() => act({ type: "swap", id: p.id })}>
          Swap out
        </button>
      ) : (
        <button className="btn primary" disabled={props.isFirst} onClick={() => act({ type: "bump", id: p.id })}>
          Move to front
        </button>
      )}
      <button className="btn ghost" onClick={() => act({ type: "remove", id: p.id })}>
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
      <div className="stepper">
        Tunes each
        <div>
          <button className="icon" aria-label="Fewer" disabled={limit <= 1} onClick={() => setLimit(limit - 1)}>
            <Icon d={MINUS} />
          </button>
          <b>{limit}</b>
          <button className="icon" aria-label="More" disabled={limit >= 5} onClick={() => setLimit(limit + 1)}>
            <Icon d={PLUS} />
          </button>
        </div>
      </div>
      {sure ? (
        <button className="btn confirm" onClick={props.reset}>
          Clear everyone?
        </button>
      ) : (
        <button className="btn ghost" onClick={() => setSure(true)}>
          New jam
        </button>
      )}
    </SheetFrame>
  );
}
