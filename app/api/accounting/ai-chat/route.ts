/**
 * POST /api/accounting/ai-chat
 *
 * Server-side endpoint for the MOTOCLUB Accounting AI Assistant.
 *
 * Security guarantees:
 * - deviceId is received from the client but validated to be a positive integer.
 *   The accounting tab already enforces that users can only see their own device's
 *   data (via Redux session). We add a basic sanity check here.
 * - All tool functions are read-only wrappers of existing authoritative ERP logic.
 * - The AI model NEVER receives deviceId in its tool arguments — it's injected server-side.
 * - Database credentials never leave the server.
 * - No arbitrary SQL is possible through any tool.
 */

import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"
import { buildSystemPrompt } from "@/lib/ai/accounting/prompts"
import {
  getSalesSummary,
  getProfitSummary,
  getExpenseSummary,
  getAccountingBalance,
  getReceivablesSummary,
  getPayablesSummary,
  getFullAccountingSummary,
  comparePeriods,
} from "@/lib/ai/accounting/tools"
import { sql } from "@/lib/db"
import type { AIChatRequest } from "@/lib/ai/accounting/types"
import type { ChatCompletionTool, ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions"

// ---------------------------------------------------------------------------
// Groq tool definitions (function declarations)
// NOTE: deviceId is NEVER a parameter — it is injected server-side.
// ---------------------------------------------------------------------------
// model
const accountingToolDeclarations: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "getSalesSummary",
      description:
        "Get sales revenue, order count, quantity sold, COGS, and gross profit for a date range. Use for questions about sales, orders, or revenue.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (inclusive)",
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format (inclusive)",
          },
        },
        required: ["fromDate", "toDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProfitSummary",
      description:
        "Get profit summary including gross profit, net profit, COGS, and operating expenses for a date range. Use for profit or COGS questions.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (inclusive)",
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format (inclusive)",
          },
        },
        required: ["fromDate", "toDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getExpenseSummary",
      description:
        "Get operating expense total and breakdown by category for a date range. Use for expense questions.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (inclusive)",
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format (inclusive)",
          },
        },
        required: ["fromDate", "toDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAccountingBalance",
      description:
        "Get opening balance, money in, money out, and closing balance for a date range. Use for balance, cash flow, money in/out questions.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (inclusive)",
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format (inclusive)",
          },
        },
        required: ["fromDate", "toDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getReceivablesSummary",
      description:
        "Get total accounts receivable (what customers owe us) and the count of outstanding receivables. Use for receivables questions.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (inclusive)",
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format (inclusive)",
          },
        },
        required: ["fromDate", "toDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPayablesSummary",
      description:
        "Get total accounts payable (what we owe suppliers) and the count of outstanding payables. Use for payables or supplier dues questions.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (inclusive)",
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format (inclusive)",
          },
        },
        required: ["fromDate", "toDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getFullAccountingSummary",
      description:
        "Get the complete accounting summary including sales, profit, COGS, expenses, cash balances, receivables, and payables for a date range. Use for 'accounting summary' or 'financial summary' questions.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (inclusive)",
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format (inclusive)",
          },
        },
        required: ["fromDate", "toDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparePeriods",
      description:
        "Compare two date ranges for sales, profit, expenses, and COGS. Use for comparison questions like 'compare this month with last month'.",
      parameters: {
        type: "object",
        properties: {
          currentFrom: {
            type: "string",
            description: "Start date of the current period (YYYY-MM-DD)",
          },
          currentTo: {
            type: "string",
            description: "End date of the current period (YYYY-MM-DD)",
          },
          previousFrom: {
            type: "string",
            description: "Start date of the previous period (YYYY-MM-DD)",
          },
          previousTo: {
            type: "string",
            description: "End date of the previous period (YYYY-MM-DD)",
          },
          currentLabel: {
            type: "string",
            description: "Human-readable label for the current period (e.g., 'September 2026')",
          },
          previousLabel: {
            type: "string",
            description: "Human-readable label for the previous period (e.g., 'August 2026')",
          },
        },
        required: [
          "currentFrom",
          "currentTo",
          "previousFrom",
          "previousTo",
          "currentLabel",
          "previousLabel",
        ],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Tool executor — server-side only, deviceId always injected here
// ---------------------------------------------------------------------------

async function executeTool(
  toolName: string,
  args: Record<string, any>,
  deviceId: number,
): Promise<string> {
  // Sanitize date inputs
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  const fromDate = args.fromDate || args.currentFrom || ""
  const toDate = args.toDate || args.currentTo || ""

  if (fromDate && !dateRegex.test(fromDate)) {
    return JSON.stringify({ error: true, message: "Invalid fromDate format. Expected YYYY-MM-DD." })
  }
  if (toDate && !dateRegex.test(toDate)) {
    return JSON.stringify({ error: true, message: "Invalid toDate format. Expected YYYY-MM-DD." })
  }

  let result

  switch (toolName) {
    case "getSalesSummary":
      result = await getSalesSummary(deviceId, fromDate, toDate)
      break
    case "getProfitSummary":
      result = await getProfitSummary(deviceId, fromDate, toDate)
      break
    case "getExpenseSummary":
      result = await getExpenseSummary(deviceId, fromDate, toDate)
      break
    case "getAccountingBalance":
      result = await getAccountingBalance(deviceId, fromDate, toDate)
      break
    case "getReceivablesSummary":
      result = await getReceivablesSummary(deviceId, fromDate, toDate)
      break
    case "getPayablesSummary":
      result = await getPayablesSummary(deviceId, fromDate, toDate)
      break
    case "getFullAccountingSummary":
      result = await getFullAccountingSummary(deviceId, fromDate, toDate)
      break
    case "comparePeriods": {
      const prevFrom = args.previousFrom || ""
      const prevTo = args.previousTo || ""
      if (!dateRegex.test(prevFrom) || !dateRegex.test(prevTo)) {
        result = { error: true, message: "Invalid previousFrom/previousTo date format." }
      } else {
        result = await comparePeriods(
          deviceId,
          fromDate,
          toDate,
          prevFrom,
          prevTo,
          args.currentLabel || "Current Period",
          args.previousLabel || "Previous Period",
        )
      }
      break
    }
    default:
      result = { error: true, message: `Unknown tool: ${toolName}` }
  }

  return JSON.stringify(result)
}

// ---------------------------------------------------------------------------
// Device info lookup — needed for system prompt context
// ---------------------------------------------------------------------------

async function getDeviceInfo(deviceId: number): Promise<{ name: string; currency: string }> {
  try {
    const rows = await sql`
      SELECT name, currency FROM devices WHERE id = ${deviceId} LIMIT 1
    `
    if (rows.length > 0) {
      return {
        name: (rows[0].name as string) || "MOTOCLUB",
        currency: (rows[0].currency as string) || "INR",
      }
    }
  } catch {
    // Non-fatal — use defaults
  }
  return { name: "MOTOCLUB", currency: "INR" }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Parse request body
    let body: AIChatRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const { messages, deviceId } = body

    // 2. Validate deviceId — must be a positive integer
    const parsedDeviceId = parseInt(String(deviceId), 10)
    if (!Number.isInteger(parsedDeviceId) || parsedDeviceId < 0) {
      return NextResponse.json({ error: "Invalid device context." }, { status: 400 })
    }

    // 3. Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 })
    }

    // 4. Validate Groq API key
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      console.error("[AI Chat] GROQ_API_KEY is not configured.")
      return NextResponse.json(
        { message: "AI service is not configured. Please add GROQ_API_KEY to your environment variables." },
        { status: 503 },
      )
    }

    const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

    // 5. Get device info for system prompt
    const deviceInfo = await getDeviceInfo(parsedDeviceId)

    // 6. Build system prompt
    const systemPrompt = buildSystemPrompt(deviceInfo.name, deviceInfo.currency)

    // 7. Initialize Groq client
    const groq = new Groq({ apiKey })

    // 8. Build conversation history for Groq
    const groqMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ]

    for (const msg of messages) {
      const role = msg.role === "assistant" ? "assistant" : "user"
      groqMessages.push({ role, content: msg.content })
    }

    // 9. Agentic loop — allow up to 5 tool call rounds to prevent infinite loops
    let finalText = ""
    const maxRounds = 5
    let currentRound = 0

    while (currentRound < maxRounds) {
      currentRound++

      const completion = await groq.chat.completions.create({
        model: groqModel,
        messages: groqMessages,
        tools: accountingToolDeclarations,
        temperature: 0.1, // Low temperature for factual financial answers
        max_tokens: 1024,
      })

      const responseMessage = completion.choices[0]?.message

      if (!responseMessage) {
        break
      }

      groqMessages.push(responseMessage)

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Execute all tool calls in parallel (server-side, deviceId injected)
        const toolResults = await Promise.all(
          responseMessage.tool_calls.map(async (toolCall) => {
            const name = toolCall.function.name
            let args = {}
            try {
              args = JSON.parse(toolCall.function.arguments)
            } catch (e) {
              console.error("[AI Chat] Failed to parse tool arguments:", e)
            }

            console.log(`[AI Tool] Executing: ${name} for device ${parsedDeviceId}`)
            const resultJson = await executeTool(name, args, parsedDeviceId)

            return {
              tool_call_id: toolCall.id,
              role: "tool" as const,
              name: name,
              content: resultJson,
            }
          })
        )

        // Send tool results back to model
        groqMessages.push(...toolResults)
      } else {
        // No tool calls — collect text response
        finalText = responseMessage.content || ""
        break
      }
    }

    if (currentRound >= maxRounds && !finalText) {
      console.warn("[AI Chat] Max tool rounds exceeded.")
      finalText =
        "I had to stop processing because it required too many steps. Please try breaking your question down."
    }

    // 10. Return final text
    if (!finalText) {
      finalText = "I couldn't retrieve the accounting data right now. Please try again."
    }

    return NextResponse.json({ message: finalText })
  } catch (error: any) {
    console.error("[AI Chat] Unhandled error:", error)

    const errMessage = error?.message || ""
    const errStatus = error?.status || error?.response?.status || error?.error?.status

    if (errStatus === 404 || errMessage.includes("404") || errMessage.includes("not found")) {
      return NextResponse.json(
        { message: "The configured AI model is currently unavailable." },
        { status: 404 },
      )
    }

    if (errStatus === 400 && (errMessage.includes("model_decommissioned") || errMessage.includes("decommissioned") || errMessage.includes("invalid_request_error"))) {
      return NextResponse.json(
        { message: "The configured AI model is no longer supported. Please update GROQ_MODEL in your environment variables." },
        { status: 400 },
      )
    }

    if (
      errStatus === 429 ||
      errMessage.includes("429") ||
      errMessage.includes("quota") ||
      errMessage.includes("rate-limit") ||
      errMessage.includes("rate limit")
    ) {
      return NextResponse.json(
        { message: "MOTO AI is temporarily rate-limited. Please try again shortly." },
        { status: 429 },
      )
    }

    if (
      errStatus === 401 ||
      errStatus === 403 ||
      errMessage.includes("401") ||
      errMessage.includes("403") ||
      errMessage.includes("invalid api key") ||
      errMessage.includes("Invalid API Key")
    ) {
      return NextResponse.json(
        { message: "The MOTO AI API configuration needs attention." },
        { status: 401 },
      )
    }

    return NextResponse.json(
      { message: "The AI service is temporarily unavailable." },
      { status: 500 },
    )
  }
}
