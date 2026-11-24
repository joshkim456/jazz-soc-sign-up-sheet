export type Inst = "horn" | "piano" | "guitar" | "bass" | "drums" | "vocal";

export const SLOTS: { id: string; inst: Inst; label: string; required: boolean }[] = [
  { id: "horn1", inst: "horn", label: "Horn 1", required: true },
  { id: "horn2", inst: "horn", label: "Horn 2", required: false },
  { id: "piano", inst: "piano", label: "Piano", required: true },
  { id: "guitar", inst: "guitar", label: "Guitar", required: false },
  { id: "bass", inst: "bass", label: "Bass", required: true },
  { id: "drums", inst: "drums", label: "Drums", required: true },
  { id: "vocal", inst: "vocal", label: "Vocal", required: false },
];

export const INSTS: { id: Inst; label: string }[] = [
  { id: "horn", label: "Horn" },
  { id: "piano", label: "Piano" },
  { id: "guitar", label: "Guitar" },
  { id: "bass", label: "Bass" },
  { id: "drums", label: "Drums" },
  { id: "vocal", label: "Vocal" },
];

export type Player = {
  id: string;
  name: string;
  inst: Inst;
  slot: string | null; // null = queued; queue order is array order
  tunes: number; // tunes played in the current stint on stage
};

export type Core = { tune: number; limit: number; players: Player[] };
export type State = Core & { v: number; prev: Core | null };

export type Action =
  | { type: "add"; id: string; name: string; inst: Inst }
  | { type: "remove"; id: string }
  | { type: "next" }
  | { type: "swap"; id: string }
  | { type: "bump"; id: string }
  | { type: "limit"; n: number }
  | { type: "reset" }
  | { type: "undo" };

export const initial = (): State => ({ v: 0, tune: 1, limit: 2, players: [], prev: null });

const isInst = (x: unknown): x is Inst => INSTS.some((i) => i.id === x);

/** Returns a cleaned action, or null if the input is not a valid action. */
export function parseAction(a: any): Action | null {
  if (!a || typeof a !== "object") return null;
  const id = typeof a.id === "string" && a.id.length > 0 && a.id.length <= 40 ? a.id : null;
  switch (a.type) {
    case "add": {
      const name = typeof a.name === "string" ? a.name.trim().slice(0, 24) : "";
      return id && name && isInst(a.inst) ? { type: "add", id, name, inst: a.inst } : null;
    }
    case "remove":
    case "swap":
    case "bump":
      return id ? { type: a.type, id } : null;
    case "limit":
      return Number.isInteger(a.n) && a.n >= 1 && a.n <= 5 ? { type: "limit", n: a.n } : null;
    case "next":
    case "reset":
    case "undo":
      return { type: a.type };
    default:
      return null;
  }
}

/** Put the first queued player of the right instrument into every empty slot. */
function fill(players: Player[], skip: Set<string> = new Set()) {
  for (const slot of SLOTS) {
    if (players.some((p) => p.slot === slot.id)) continue;
    const next = players.find((p) => !p.slot && p.inst === slot.inst && !skip.has(p.id));
    if (next) {
      next.slot = slot.id;
      next.tunes = 0;
    }
  }
}

/** Send a stage player to the back of the queue and bring in the next one. */
function swapOut(players: Player[], out: Player, skip: Set<string>): boolean {
  const next = players.find((p) => !p.slot && p.inst === out.inst && !skip.has(p.id));
  if (!next) return false;
  next.slot = out.slot;
  next.tunes = 0;
  out.slot = null;
  out.tunes = 0;
  players.splice(players.indexOf(out), 1);
  players.push(out);
  skip.add(out.id);
  return true;
}

export function apply(state: State, action: Action): State {
  const core: Core = { tune: state.tune, limit: state.limit, players: state.players };

  if (action.type === "undo") {
    return state.prev ? { ...state.prev, v: state.v + 1, prev: null } : state;
  }

  let { tune, limit } = core;
  let players = core.players.map((p) => ({ ...p }));

  switch (action.type) {
    case "add":
      if (players.some((p) => p.id === action.id)) return state;
      players.push({ id: action.id, name: action.name, inst: action.inst, slot: null, tunes: 0 });
      fill(players);
      break;
    case "remove":
      if (!players.some((p) => p.id === action.id)) return state;
      players = players.filter((p) => p.id !== action.id);
      fill(players);
      break;
    case "next": {
      tune += 1;
      const skip = new Set<string>();
      for (const p of players) if (p.slot) p.tunes += 1;
      for (const slot of SLOTS) {
        const p = players.find((x) => x.slot === slot.id);
        if (p && p.tunes >= limit) swapOut(players, p, skip);
      }
      fill(players, skip);
      break;
    }
    case "swap": {
      const p = players.find((x) => x.id === action.id);
      if (!p || !p.slot || !swapOut(players, p, new Set())) return state;
      break;
    }
    case "bump": {
      const p = players.find((x) => x.id === action.id);
      if (!p || p.slot) return state;
      players.splice(players.indexOf(p), 1);
      const first = players.findIndex((x) => !x.slot && x.inst === p.inst);
      players.splice(first === -1 ? players.length : first, 0, p);
      break;
    }
    case "limit":
      limit = action.n;
      break;
    case "reset":
      tune = 1;
      players = [];
      break;
  }

  return { v: state.v + 1, tune, limit, players, prev: core };
}

export const queueFor = (players: Player[], inst: Inst) =>
  players.filter((p) => !p.slot && p.inst === inst);
