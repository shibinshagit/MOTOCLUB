import { sql } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const res = await sql`
      UPDATE product_batches 
      SET batch_no = 'BATCH-' || LPAD(id::text, 3, '0') 
      WHERE batch_no IS NULL OR TRIM(batch_no) = ''
    `
    return NextResponse.json({ success: true, count: res.length })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
