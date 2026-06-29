import "server-only"

import { neon, neonConfig } from "@neondatabase/serverless"

neonConfig.fetchConnectionCache = true
;(neonConfig as unknown as Record<string, unknown>).fetchTimeout = 30000
neonConfig.webSocketConstructor = undefined
;(neonConfig as unknown as Record<string, unknown>).pipelineFetch = false

function isLocalDatabaseUrl(url: string): boolean {
  try {
    const normalized = url.replace(/^postgres:\/\//, "postgresql://")
    const parsed = new URL(normalized)
    const host = parsed.hostname
    return host === "localhost" || host === "127.0.0.1" || host === "::1"
  } catch {
    return false
  }
}

const connectionState = {
  isConnected: false,
  lastError: null as Error | null,
  lastAttempt: 0,
  connectionAttempts: 0,
  lastSuccessfulConnection: 0,
  connectionChecked: false,
}

let dbInitLogged = false

function logDbInit(message: string) {
  if (dbInitLogged) return
  console.log(message)
}

function logDbInitOnce() {
  dbInitLogged = true
}

const getDatabaseUrl = (): string => {
  const possibleEnvVars = [
    "DATABASE_URL",
    "NEON_DATABASE_URL",
    "NEON_POSTGRES_URL",
    "NEON_POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL",
  ]

  for (const envVar of possibleEnvVars) {
    if (process.env[envVar]) {
      logDbInit(`Using database URL from ${envVar}`)
      return process.env[envVar]!
    }
  }

  throw new Error("No database URL found. Set DATABASE_URL in environment variables.")
}

const createSqlClient = () => {
  const dbUrl = getDatabaseUrl()
  const useLocalDriver = isLocalDatabaseUrl(dbUrl)

  logDbInit(
    useLocalDriver
      ? "Connecting to local PostgreSQL..."
      : "Connecting to database...",
  )

  const sqlFn = useLocalDriver
    ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const postgres = require("postgres") as (url: string, options?: Record<string, unknown>) => any
        return postgres(dbUrl, {
          max: 10,
          idle_timeout: 20,
          connect_timeout: 10,
          onnotice: () => {},
        })
      })()
    : neon(dbUrl)

  const wrappedSql = async (...args: any[]) => {
    const now = Date.now()
    connectionState.lastAttempt = now
    connectionState.connectionAttempts++

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Database query timeout (20 s)")), 20000)
      })

      const result = await Promise.race([sqlFn(...args), timeoutPromise])

      connectionState.isConnected = true
      connectionState.connectionAttempts = 0
      connectionState.lastSuccessfulConnection = now
      connectionState.lastError = null
      connectionState.connectionChecked = true
      return result
    } catch (error) {
      connectionState.isConnected = false
      const errorMessage = error instanceof Error ? error.message : String(error)
      connectionState.lastError = new Error(errorMessage)

      try {
        const query = args[0] ? args[0].join("?") : "unknown query"
        console.error("Database query error:", errorMessage)
        console.error("Query that caused error:", query)
      } catch {
        console.error("Database query error:", errorMessage)
      }

      throw error
    }
  }

  ;(async () => {
    try {
      await wrappedSql`SELECT 1`
      logDbInit("Database connection successful")
      logDbInitOnce()
    } catch (error) {
      console.error("Initial database connection test failed:", error)
    }
  })()

  return { sql: wrappedSql }
}

export function createCompanyFilteredSql(companyId: number) {
  if (!companyId || isNaN(companyId) || companyId <= 0) {
    console.error("SECURITY ERROR: Attempted to create filtered SQL with invalid company ID:", companyId)
    throw new Error("Security Error: Invalid company ID")
  }

  const filteredSql = async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?").toLowerCase()
    if (query.includes("select") && !query.includes("where company_id =")) {
      console.error("SECURITY ERROR: Attempt to execute unfiltered SELECT query")
      throw new Error("Security Error: Unfiltered query not allowed")
    }

    return await sql(strings, ...values)
  }

  return {
    sql: filteredSql,
    companyId,
  }
}

const { sql } = createSqlClient()

function formatDate(date: Date | string): string {
  if (!date) return "N/A"
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch (error) {
    console.error("Error formatting date:", error)
    return String(date)
  }
}

function isConnected(): boolean {
  return connectionState.isConnected
}

function getLastError(): Error | null {
  return connectionState.lastError
}

function resetConnectionState() {
  connectionState.connectionAttempts = 0
  connectionState.lastAttempt = 0
  connectionState.connectionChecked = false
}

async function executeWithRetry(queryFn: () => Promise<any>, maxRetries = 2): Promise<any> {
  let lastError: unknown = null
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      return await queryFn()
    } catch (error) {
      lastError = error
      attempt++

      const errorMessage = error instanceof Error ? error.message : String(error)
      if (!errorMessage.includes("timeout") && !errorMessage.includes("Failed to fetch")) {
        throw error
      }

      if (attempt > maxRetries) {
        throw lastError
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
      await new Promise((resolve) => setTimeout(resolve, delay))
      resetConnectionState()
    }
  }

  throw new Error("Failed to execute query after retries")
}

async function checkDatabaseHealth(): Promise<{ isHealthy: boolean; message: string }> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Database health check timeout")), 5000)
    })

    await Promise.race([sql`SELECT 1 as health_check`, timeoutPromise])

    return {
      isHealthy: true,
      message: "Database connection is healthy",
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      isHealthy: false,
      message: `Database connection is unhealthy: ${errorMessage}`,
    }
  }
}

export {
  sql,
  isConnected,
  getLastError,
  formatDate,
  resetConnectionState,
  executeWithRetry,
  checkDatabaseHealth,
}
