import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await sql`SELECT id, status, device_id, staff_id, created_at FROM sales ORDER BY created_at DESC LIMIT 10`;
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
