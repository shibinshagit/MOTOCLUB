require("dotenv").config({ path: ".env.local" })
const { neon } = require("@neondatabase/serverless")

const sql = neon(process.env.DATABASE_URL)

async function migrate() {
  try {
    console.log("Adding marked_by_admin_id to staff_attendance table...")
    await sql`ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS marked_by_admin_id INTEGER;`
    console.log("Migration successful.")
  } catch (error) {
    console.error("Migration failed:", error)
  }
}

migrate()
