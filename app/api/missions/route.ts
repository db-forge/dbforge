// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ missions: [] });
}

export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
