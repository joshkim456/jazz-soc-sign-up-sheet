import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, initial, type Action, type Inst, type State } from "./jam.ts";

const add = (s: State, name: string, inst: Inst) =>
  apply(s, { type: "add", id: name, name, inst });
const run = (s: State, ...as: Action[]) => as.reduce(apply, s);
const on = (s: State, slot: string) => s.players.find((p) => p.slot === slot)?.name ?? null;
const queue = (s: State) => s.players.filter((p) => !p.slot).map((p) => p.name);

test("new players fill empty slots, then queue", () => {
  let s = initial();
  s = add(s, "A", "horn");
  s = add(s, "B", "horn");
  s = add(s, "C", "horn");
  assert.equal(on(s, "horn1"), "A");
  assert.equal(on(s, "horn2"), "B");
  assert.deepEqual(queue(s), ["C"]);
});

test("players rotate out after the tune limit only if someone is waiting", () => {
  let s = initial();
  s = add(s, "D1", "drums");
  s = add(s, "B1", "bass");
  s = add(s, "D2", "drums");
  s = run(s, { type: "next" });
  assert.equal(on(s, "drums"), "D1");
  s = run(s, { type: "next" });
  assert.equal(on(s, "drums"), "D2");
  assert.equal(on(s, "bass"), "B1"); // nobody waiting, stays on
  assert.deepEqual(queue(s), ["D1"]);
  s = run(s, { type: "next" }, { type: "next" });
  assert.equal(on(s, "drums"), "D1");
});

test("one waiting horn replaces only one of two horns", () => {
  let s = initial();
  s = add(s, "A", "horn");
  s = add(s, "B", "horn");
  s = add(s, "C", "horn");
  s = run(s, { type: "next" }, { type: "next" });
  assert.equal(on(s, "horn1"), "C");
  assert.equal(on(s, "horn2"), "B");
  assert.deepEqual(queue(s), ["A"]);
  s = run(s, { type: "next" });
  assert.equal(on(s, "horn2"), "A"); // B was over the limit, A back in
  assert.deepEqual(queue(s), ["B"]);
});

test("remove, bump, swap, undo", () => {
  let s = initial();
  s = add(s, "P1", "piano");
  s = add(s, "P2", "piano");
  s = add(s, "P3", "piano");
  s = run(s, { type: "bump", id: "P3" });
  assert.deepEqual(queue(s), ["P3", "P2"]);
  s = run(s, { type: "swap", id: "P1" });
  assert.equal(on(s, "piano"), "P3");
  assert.deepEqual(queue(s), ["P2", "P1"]);
  s = run(s, { type: "remove", id: "P3" });
  assert.equal(on(s, "piano"), "P2");
  s = run(s, { type: "undo" });
  assert.equal(on(s, "piano"), "P3");
});
