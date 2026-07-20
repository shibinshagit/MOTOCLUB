import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

import { getSaleDetails } from "@/app/actions/sale-actions";

export async function GET() {
  try {
    const saleId = 31;
    const result = await getSaleDetails(saleId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
