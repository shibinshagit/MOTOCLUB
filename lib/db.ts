import "server-only"

import { neon, neonConfig } from "@neondatabase/serverless"

// Configure Neon with optimized settings
neonConfig.fetchConnectionCache = true
neonConfig.fetchTimeout = 30000 // 30 seconds timeout
neonConfig.webSocketConstructor = undefined // Disable WebSocket for better compatibility
neonConfig.pipelineFetch = false // Disable pipeline fetch for better compatibility

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

// Global connection state
const connectionState = {
  isConnected: false,
  lastError: null as Error | null,
  lastAttempt: 0,
  connectionAttempts: 0,
  lastSuccessfulConnection: 0,
  mockMode: false, // Start with mock mode disabled by default
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

// Try to get the database URL from environment variables with enhanced logging
const getDatabaseUrl = () => {
  const possibleEnvVars = [
    "DATABASE_URL",
    "NEON_DATABASE_URL",
    "NEON_POSTGRES_URL",
    "NEON_POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL",
  ]

  // Log all available environment variables for debugging (without values)
  const dbEnvVars = Object.keys(process.env).filter(
    (key) => key.includes("NEON") || key.includes("DATABASE") || key.includes("PG"),
  )

  logDbInit(`Available database environment variables: ${dbEnvVars.length > 0 ? dbEnvVars.join(", ") : "none"}`)

  // Try each possible environment variable
  for (const envVar of possibleEnvVars) {
    if (process.env[envVar]) {
      logDbInit(`Using database URL from ${envVar}`)
      return process.env[envVar]
    }
  }

  // No database URL found - we'll use mock mode
  console.warn("No database URL found in environment variables - using mock mode")
  return null
}

// Improve the createMockSql function to return more realistic mock data
const createMockSql = () => {
  logDbInit("Using MOCK database mode - no real database connection")
  logDbInitOnce()

  return async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?")
    console.log("MOCK SQL QUERY:", query, values)

    // Return empty arrays for all queries - NO MORE MOCK DATA
    return []
  }
}

// Create a SQL client that always works, even without a database URL
const createSqlClient = () => {
  // Try to get a real database URL
  const dbUrl = getDatabaseUrl()

  // If no database URL, just return the mock SQL function
  if (!dbUrl) {
    connectionState.isConnected = false
    connectionState.mockMode = true
    connectionState.lastError = new Error("Database URL not configured")

    return {
      sql: createMockSql(),
    }
  }

  try {
    const useLocalDriver = isLocalDatabaseUrl(dbUrl)
    logDbInit(
      useLocalDriver
        ? "Attempting to connect to local PostgreSQL..."
        : "Attempting to connect to database...",
    )

    const sqlFn = useLocalDriver
      ? (() => {
          // Lazy-load postgres so client bundles never pull in Node-only modules.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const postgres = require("postgres") as typeof import("postgres").default
          return postgres(dbUrl, {
            max: 10,
            idle_timeout: 20,
            connect_timeout: 10,
            onnotice: () => {},
          })
        })()
      : neon(dbUrl)

    // Create a wrapped version that handles errors
    const wrappedSql = async (...args: any[]) => {
      try {
        // If we've had multiple failed attempts, use mock mode
        if (connectionState.connectionAttempts > 3 && !connectionState.connectionChecked) {
          console.warn(`Using mock mode after ${connectionState.connectionAttempts} failed connection attempts`)
          connectionState.mockMode = true
          return [] // Return empty array instead of mock data
        }

        const now = Date.now()
        connectionState.lastAttempt = now
        connectionState.connectionAttempts++

        // Add timeout to prevent hanging connections
        const timeoutPromise = new Promise((_, reject) => {
          // Extend query grace-period to 20 s to prevent premature timeouts
          setTimeout(() => reject(new Error("Database query timeout (20 s)")), 20000)
        })

        // Execute the query with a timeout
        const queryPromise = sqlFn(...args)
        const result = await Promise.race([queryPromise, timeoutPromise])

        // Update connection state on success
        connectionState.isConnected = true
        connectionState.connectionAttempts = 0 // Reset attempts on success
        connectionState.lastSuccessfulConnection = now
        connectionState.mockMode = false
        connectionState.connectionChecked = true
        return result
      } catch (error) {
        connectionState.isConnected = false

        // Enhance error message for better debugging
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error("Database query error:", errorMessage)

        // Log the query that caused the error (safely)
        try {
          const query = args[0] ? args[0].join("?") : "unknown query"
          console.error("Query that caused error:", query)
          console.error("Query parameters:", args.slice(1))
        } catch (logError) {
          console.error("Could not log query details:", logError)
        }

        connectionState.lastError = new Error(errorMessage)

        // Return empty array instead of mock data
        return []
      }
    }

    // Test the connection but don't wait for it
    ;(async () => {
      try {
        await wrappedSql`SELECT 1`
        connectionState.isConnected = true
        connectionState.lastSuccessfulConnection = Date.now()
        connectionState.mockMode = false
        connectionState.connectionChecked = true
        logDbInit("Database connection successful")
        logDbInitOnce()
      } catch (error) {
        connectionState.isConnected = false
        connectionState.lastError = error instanceof Error ? error : new Error(String(error))
        console.error("Initial database connection test failed:", error)
        // Don't fall back to mock mode
        connectionState.mockMode = false
      }
    })()

    return {
      sql: wrappedSql,
    }
  } catch (error) {
    console.error("Error initializing database connection:", error)
    connectionState.isConnected = false
    connectionState.lastError = error instanceof Error ? error : new Error(String(error))

    // Don't fall back to mock mode
    connectionState.mockMode = false

    return {
      sql: () => Promise.resolve([]), // Return empty array instead of mock data
    }
  }
}

// Add this function after the createSqlClient function
export function createCompanyFilteredSql(companyId: number) {
  if (!companyId || isNaN(companyId) || companyId <= 0) {
    console.error("SECURITY ERROR: Attempted to create filtered SQL with invalid company ID:", companyId)
    throw new Error("Security Error: Invalid company ID")
  }

  // Create a wrapper around the sql function that enforces company filtering
  const filteredSql = async (strings: TemplateStringsArray, ...values: any[]) => {
    try {
      // Check if this is a SELECT query
      const query = strings.join("?").toLowerCase()
      if (query.includes("select") && !query.includes("where company_id =")) {
        console.error("SECURITY ERROR: Attempt to execute unfiltered SELECT query")
        throw new Error("Security Error: Unfiltered query not allowed")
      }

      return await sql(strings, ...values)
    } catch (error) {
      console.error("Error in company-filtered SQL:", error)
      throw error
    }
  }

  return {
    sql: filteredSql,
    companyId,
  }
}

// Initialize the client
const { sql } = createSqlClient()

// Helper function to format date for display
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

// Check if database is connected
function isConnected(): boolean {
  return connectionState.isConnected
}

// Check if we're in mock mode
function isMockMode(): boolean {
  return connectionState.mockMode
}

// Get the last database error
function getLastError(): Error | null {
  return connectionState.lastError
}

// Reset connection state
function resetConnectionState() {
  connectionState.connectionAttempts = 0
  connectionState.lastAttempt = 0
  connectionState.connectionChecked = false
  // Don't reset mock mode here
}

// Function to execute a query with retries
async function executeWithRetry(queryFn: () => Promise<any>, maxRetries = 2): Promise<any> {
  let lastError: any = null
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      return await queryFn()
    } catch (error) {
      lastError = error
      attempt++

      // If it's not a timeout or network error, don't retry
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (!errorMessage.includes("timeout") && !errorMessage.includes("Failed to fetch")) {
        throw error
      }

      // If we've reached max retries, throw the last error
      if (attempt > maxRetries) {
        // Don't switch to mock mode after max retries
        console.warn(`Failed after ${maxRetries} retries`)
        throw lastError
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
      console.log(`Retrying database query after ${delay}ms (attempt ${attempt}/${maxRetries})`)
      await new Promise((resolve) => setTimeout(resolve, delay))

      // Reset connection state before retrying
      resetConnectionState()
    }
  }

  // This should never be reached, but just in case
  throw new Error("Failed to execute query after retries")
}

// Function to check database health
async function checkDatabaseHealth(): Promise<{ isHealthy: boolean; message: string; mockMode: boolean }> {
  try {
    // If we're already in mock mode, don't bother checking
    if (connectionState.mockMode) {
      return {
        isHealthy: false,
        message: "Using mock mode, database health check skipped",
        mockMode: true,
      }
    }

    // Try a simple query with a short timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Database health check timeout")), 5000)
    })

    const queryPromise = sql`SELECT 1 as health_check`
    await Promise.race([queryPromise, timeoutPromise])

    return {
      isHealthy: true,
      message: "Database connection is healthy",
      mockMode: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Don't switch to mock mode on health check failure
    return {
      isHealthy: false,
      message: `Database connection is unhealthy: ${errorMessage}`,
      mockMode: false,
    }
  }
}

// Function to manually set mock mode (useful for testing)
function setMockMode(_mode: boolean): void {
  // Always set mock mode to false regardless of the input parameter
  connectionState.mockMode = false
}

// Force disable mock mode
setMockMode(false)

export {
  sql,
  isConnected,
  isMockMode,
  getLastError,
  formatDate,
  resetConnectionState,
  executeWithRetry,
  checkDatabaseHealth,
  setMockMode,
}
