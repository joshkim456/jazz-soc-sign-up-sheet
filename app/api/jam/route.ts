import { NextResponse } from "next/server";
import { parseAction } from "@/lib/jam";
import { mutate, persistent, read } from "@/lib/store";

export const dynamic = "force-dynamic";

const allowed = (req: Request) =>
  !process.env.JAM_PIN || req.headers.get("x-jam-pin") === process.env.JAM_PIN;

const send = (state: unknown) =>
  NextResponse.json({ state, persistent }, { headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  if (!allowed(req)) return new NextResponse(null, { status: 401 });
  return send(await read());
}

export async function POST(req: Request) {
  if (!allowed(req)) return new NextResponse(null, { status: 401 });
  const action = parseAction(await req.json().catch(() => null));
  if (!action) return new NextResponse(null, { status: 400 });
  return send(await mutate(action));
}
