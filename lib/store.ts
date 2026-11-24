import { Redis } from "@upstash/redis";
import { apply, initial, type Action, type State } from "./jam";

const KEY = "jam:state";
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const persistent = Boolean(url && token);

const redis = persistent
  ? new Redis({ url: url!, token: token!, automaticDeserialization: false })
  : null;

// Fallback for local development only: lost on restart, not shared between instances.
const mem = globalThis as unknown as { __jam?: State };

// Write only if the stored version is still the one we read.
const CAS = `
local cur = redis.call('GET', KEYS[1])
local v = 0
if cur then v = cjson.decode(cur).v end
if v == tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0`;

export async function read(): Promise<State> {
  if (!redis) return (mem.__jam ??= initial());
  const raw = await redis.get<string>(KEY);
  return raw ? (JSON.parse(raw) as State) : initial();
}

export async function mutate(action: Action): Promise<State> {
  if (!redis) return (mem.__jam = apply(await read(), action));
  for (let i = 0; i < 8; i++) {
    const cur = await read();
    const next = apply(cur, action);
    if (next === cur) return cur;
    const ok = await redis.eval(CAS, [KEY], [String(cur.v), JSON.stringify(next)]);
    if (ok === 1) return next;
  }
  throw new Error("busy");
}
