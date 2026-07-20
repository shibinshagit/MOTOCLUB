const postgres = require("postgres")
require("dotenv").config({ path: ".env.local" })

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL
if (!databaseUrl) {
  console.error("No database URL found")
  process.exit(1)
}

const sql = postgres(databaseUrl, { max: 1 })

async function migrate() {
  try {
    console.log("Adding payment_status column to sales table...")
    try {
      await sql`
        ALTER TABLE sales
        ADD COLUMN payment_status VARCHAR(50) DEFAULT 'Paid'
      `
      console.log("Column added.")
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("Column already exists!")
      } else {
        throw e
      }
    }
    
    console.log("Backfilling existing records...")
    
    // Existing completed sales should be Paid
    await sql`
      UPDATE sales
      SET payment_status = 'Paid'
      WHERE status = 'Completed' OR status = 'Paid'
    `
    
    // Existing pending sales should be Pending payment
    await sql`
      UPDATE sales
      SET payment_status = 'Pending'
      WHERE status = 'Pending'
    `
    
    // Existing cancelled sales should be Cancelled
    await sql`
      UPDATE sales
      SET payment_status = 'Cancelled'
      WHERE status = 'Cancelled'
    `
    
    // Existing credit sales should be Partial or Pending? Let's say Pending
    await sql`
      UPDATE sales
      SET payment_status = CASE 
        WHEN received_amount > 0 THEN 'Partial'
        ELSE 'Pending'
      END
      WHERE status = 'Credit'
    `

    console.log("Migration completed successfully!")
  } catch (error) {
    console.error("Migration failed:", error)
  } finally {
    await sql.end()
  }
}

migrate()
