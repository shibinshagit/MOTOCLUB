import { NextRequest, NextResponse } from "next/server"
import { checkAndSendFollowUpReminders } from "@/app/actions/notification-actions"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get("companyId") ? Number(searchParams.get("companyId")) : undefined
    const deviceId = searchParams.get("deviceId") ? Number(searchParams.get("deviceId")) : undefined

    const result = await checkAndSendFollowUpReminders(companyId, deviceId)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process follow-up reminders" },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}

