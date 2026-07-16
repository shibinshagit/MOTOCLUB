import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET() {
  try {
    const res = await sql`
      SELECT conname, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_namespace n ON n.oid = c.connamespace 
      WHERE conrelid = 'product_device_stock'::regclass
    `
    return NextResponse.json({ success: true, constraints: res })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message })
  }
}
