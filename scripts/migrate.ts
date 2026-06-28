/**
 * Database Migration Script — single source of truth for schema setup.
 *
 * Run:  npm run migrate
 *
 * Fresh setup: creates all tables, indexes, and optional admin seed.
 * Existing DB: idempotent CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS upgrades.
 *
 * For one-off schema experiments during development, run SQL in the terminal.
 * When a change is confirmed, add it here and re-run migrate.
 */

import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })
dotenv.config()

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

const DATABASE_URL =
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_POSTGRES_URL ||
  process.env.NEON_POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL

if (!DATABASE_URL) {
  console.error("✗ No database URL found in environment variables")
  process.exit(1)
}

function isLocalDatabaseUrl(url: string): boolean {
  try {
    const normalized = url.replace(/^postgres:\/\//, "postgresql://")
    const host = new URL(normalized).hostname
    return host === "localhost" || host === "127.0.0.1" || host === "::1"
  } catch {
    return false
  }
}

function createSqlClient(url: string) {
  if (isLocalDatabaseUrl(url)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const postgres = require("postgres") as typeof import("postgres").default
    return postgres(url, { max: 1, onnotice: () => {} })
  }
  return neon(url)
}

const sql = createSqlClient(DATABASE_URL)

async function run(label: string, fn: () => Promise<any>) {
  try {
    await fn()
    console.log(`  ✓ ${label}`)
  } catch (error: any) {
    console.error(`  ✗ ${label}:`, error.message ?? error)
    throw error
  }
}

async function runSafe(label: string, fn: () => Promise<any>) {
  try {
    await fn()
    console.log(`  ✓ ${label}`)
  } catch (error: any) {
    console.log(`  ⚠ ${label}: ${error.message ?? error} (skipped)`)
  }
}

async function createTables() {
  console.log("\n── Creating tables ──\n")

  await run("companies", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        description TEXT,
        logo_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("devices", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password_hash TEXT NOT NULL,
        company_id INTEGER,
        currency VARCHAR(10) DEFAULT 'QAR',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("admins", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT 'Admin',
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        auth_token TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("platform_settings", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        brand_logo_url TEXT,
        brand_icon_url TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
    await sql`
      INSERT INTO platform_settings (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `
  })

  await run("customers", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("product_categories", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS product_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        parent_id INTEGER,
        company_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `
  })

  await run("products", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        category VARCHAR(255),
        category_id INTEGER,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        wholesale_price DECIMAL(10, 2) DEFAULT 0,
        msp DECIMAL(10, 2) DEFAULT 0,
        barcode VARCHAR(255),
        image_url TEXT,
        image_urls JSONB DEFAULT '[]',
        video_url TEXT,
        amazon_status VARCHAR(20) DEFAULT 'not_listed',
        flipkart_status VARCHAR(20) DEFAULT 'not_listed',
        meesho_status VARCHAR(20) DEFAULT 'not_listed',
        own_ecom_status VARCHAR(20) DEFAULT 'not_listed',
        shelf VARCHAR(255),
        color VARCHAR(255),
        size VARCHAR(255),
        suitable_for TEXT,
        attributes JSONB DEFAULT '[]',
        link TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("product_stock_history", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS product_stock_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        device_id INTEGER,
        quantity INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        reference_id INTEGER,
        reference_type VARCHAR(50),
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("product_device_stock", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS product_device_stock (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        device_id INTEGER NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(product_id, device_id)
      )
    `
  })

  await run("suppliers", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        address TEXT,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  })

  await run("sales", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        total_amount DECIMAL(12,2),
        total_cost DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(50),
        sale_date TIMESTAMP DEFAULT NOW(),
        device_id INTEGER,
        payment_method VARCHAR(50),
        discount DECIMAL(12,2) DEFAULT 0,
        received_amount DECIMAL(12,2) DEFAULT 0,
        staff_id INTEGER,
        sale_type VARCHAR(20) DEFAULT 'product',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("sale_items", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(12,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("purchases", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        supplier VARCHAR(255),
        total_amount DECIMAL(12,2),
        status VARCHAR(50),
        payment_method VARCHAR(50),
        purchase_status VARCHAR(50) DEFAULT 'Delivered',
        received_amount DECIMAL(12,2) DEFAULT 0,
        purchase_date TIMESTAMP DEFAULT NOW(),
        device_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("purchase_items", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id SERIAL PRIMARY KEY,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("staff", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        role VARCHAR(20) NOT NULL DEFAULT 'staff',
        position VARCHAR(100) NOT NULL,
        salary DECIMAL(10,2) NOT NULL,
        salary_date DATE NOT NULL,
        joined_on DATE NOT NULL,
        age INTEGER,
        id_card_number VARCHAR(100),
        address TEXT,
        is_active BOOLEAN DEFAULT true,
        device_id INTEGER NOT NULL,
        company_id INTEGER DEFAULT 1,
        created_by INTEGER NOT NULL,
        staff_password_hash TEXT,
        restricted_pages JSONB DEFAULT '[]'::jsonb,
        restricted_values JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("services", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        duration_minutes INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        device_id INTEGER NOT NULL,
        company_id INTEGER DEFAULT 1,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("stock_transfers", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        from_device_id INTEGER NOT NULL,
        to_device_id INTEGER NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'completed',
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
        payment_method VARCHAR(50),
        paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_notes TEXT,
        transfer_date TIMESTAMP DEFAULT NOW(),
        notes TEXT,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        cancelled_at TIMESTAMP,
        cancelled_by INTEGER,
        rejection_reason TEXT,
        approved_by INTEGER,
        approved_at TIMESTAMP,
        rejected_by INTEGER,
        rejected_at TIMESTAMP
      )
    `
  })

  await run("stock_transfer_items", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS stock_transfer_items (
        id SERIAL PRIMARY KEY,
        transfer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("financial_transactions", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id SERIAL PRIMARY KEY,
        transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
        transaction_type VARCHAR(50) NOT NULL,
        transaction_name VARCHAR(255),
        category_name VARCHAR(255),
        reference_type VARCHAR(50),
        reference_id INTEGER,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        received_amount DECIMAL(12,2) DEFAULT 0,
        cost_amount DECIMAL(12,2) DEFAULT 0,
        debit_amount DECIMAL(12,2) DEFAULT 0,
        credit_amount DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(50),
        payment_method VARCHAR(50),
        description TEXT,
        notes TEXT,
        device_id INTEGER NOT NULL,
        company_id INTEGER DEFAULT 1,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("petty_cash", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS petty_cash (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        device_id INTEGER,
        transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
        amount DECIMAL(10, 2) NOT NULL,
        operation_type VARCHAR(50) NOT NULL,
        description TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("expense_categories", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        device_id INTEGER,
        name VARCHAR(255) NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("budgets", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        device_id INTEGER,
        category_id VARCHAR(255),
        category_name VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        period VARCHAR(50) NOT NULL,
        start_date TIMESTAMP NOT NULL DEFAULT NOW(),
        end_date TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })
}

async function upgradeLegacyColumns() {
  console.log("\n── Upgrading legacy databases ──\n")

  const columns: Array<[string, () => Promise<any>]> = [
    ["devices.currency", () => sql`ALTER TABLE devices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'QAR'`],
    ["products.image_urls", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'`],
    ["products.video_url", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT`],
    ["products.amazon_status", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS amazon_status VARCHAR(20) DEFAULT 'not_listed'`],
    ["products.flipkart_status", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS flipkart_status VARCHAR(20) DEFAULT 'not_listed'`],
    ["products.meesho_status", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS meesho_status VARCHAR(20) DEFAULT 'not_listed'`],
    ["products.own_ecom_status", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS own_ecom_status VARCHAR(20) DEFAULT 'not_listed'`],
    ["product_stock_history.device_id", () => sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS device_id INTEGER`],
    ["sales.device_id", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id INTEGER`],
    ["sales.received_amount", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`],
    ["sales.staff_id", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id INTEGER`],
    ["sales.sale_type", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) DEFAULT 'product'`],
    ["sales.payment_method", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`],
    ["sales.discount", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount DECIMAL(12,2) DEFAULT 0`],
    ["sales.total_cost", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12,2) DEFAULT 0`],
    ["sales.updated_at", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`],
    ["sale_items.cost", () => sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost DECIMAL(12,2) DEFAULT 0`],
    ["sale_items.notes", () => sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS notes TEXT`],
    ["purchases.device_id", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS device_id INTEGER`],
    ["purchases.payment_method", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`],
    ["purchases.purchase_status", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_status VARCHAR(50) DEFAULT 'Delivered'`],
    ["purchases.received_amount", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`],
    ["staff.staff_password_hash", () => sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS staff_password_hash TEXT`],
    ["staff.role", () => sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'staff'`],
    ["staff.restricted_pages", () => sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS restricted_pages JSONB DEFAULT '[]'::jsonb`],
    ["staff.restricted_values", () => sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS restricted_values JSONB DEFAULT '[]'::jsonb`],
    ["financial_transactions.transaction_name", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS transaction_name VARCHAR(255)`],
    ["financial_transactions.category_name", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS category_name VARCHAR(255)`],
    ["financial_transactions.reference_type", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50)`],
    ["financial_transactions.reference_id", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS reference_id INTEGER`],
    ["financial_transactions.received_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`],
    ["financial_transactions.cost_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS cost_amount DECIMAL(12,2) DEFAULT 0`],
    ["financial_transactions.debit_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS debit_amount DECIMAL(12,2) DEFAULT 0`],
    ["financial_transactions.credit_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS credit_amount DECIMAL(12,2) DEFAULT 0`],
    ["financial_transactions.status", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50)`],
    ["financial_transactions.payment_method", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`],
    ["financial_transactions.notes", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT`],
    ["financial_transactions.device_id", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS device_id INTEGER`],
    ["budgets.device_id", () => sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS device_id INTEGER`],
    ["expense_categories.device_id", () => sql`ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS device_id INTEGER`],
    ["petty_cash.device_id", () => sql`ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS device_id INTEGER`],
  ]

  for (const [label, fn] of columns) {
    await runSafe(label, fn)
  }
}

async function createIndexes() {
  console.log("\n── Creating indexes ──\n")

  const indexes: Array<[string, () => Promise<any>]> = [
    ["idx_ft_device_date", () => sql`CREATE INDEX IF NOT EXISTS idx_ft_device_date ON financial_transactions(device_id, transaction_date)`],
    ["idx_ft_ref", () => sql`CREATE INDEX IF NOT EXISTS idx_ft_ref ON financial_transactions(reference_type, reference_id)`],
    ["idx_services_device_id", () => sql`CREATE INDEX IF NOT EXISTS idx_services_device_id ON services(device_id)`],
    ["idx_services_active", () => sql`CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active)`],
    ["idx_services_category", () => sql`CREATE INDEX IF NOT EXISTS idx_services_category ON services(category)`],
    ["idx_staff_device_id", () => sql`CREATE INDEX IF NOT EXISTS idx_staff_device_id ON staff(device_id)`],
    ["idx_staff_active", () => sql`CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(is_active)`],
    ["idx_staff_position", () => sql`CREATE INDEX IF NOT EXISTS idx_staff_position ON staff(position)`],
    ["idx_stock_transfers_from", () => sql`CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON stock_transfers(from_device_id)`],
    ["idx_stock_transfers_to", () => sql`CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON stock_transfers(to_device_id)`],
    ["idx_product_device_stock", () => sql`CREATE INDEX IF NOT EXISTS idx_product_device_stock ON product_device_stock(device_id, product_id)`],
  ]

  for (const [label, fn] of indexes) {
    await runSafe(label, fn)
  }
}

async function seedAdmin() {
  console.log("\n── Admin seed ──\n")

  const existing = await sql`SELECT COUNT(*)::int AS count FROM admins`
  if ((existing[0]?.count ?? 0) > 0) {
    console.log("  ✓ admins already populated (skipped)")
    return
  }

  const seedEmail = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase()
  const seedPassword = process.env.ADMIN_SEED_PASSWORD
  const seedName = process.env.ADMIN_SEED_NAME?.trim() || "Platform Admin"

  if (!seedEmail || !seedPassword) {
    console.log("  ⚠ ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD not set (skipped)")
    return
  }

  const passwordHash = await hashPassword(seedPassword)
  await sql`
    INSERT INTO admins (name, email, password_hash)
    VALUES (${seedName}, ${seedEmail}, ${passwordHash})
    ON CONFLICT (email) DO NOTHING
  `
  console.log(`  ✓ seeded admin ${seedEmail}`)
}

async function migrate() {
  console.log("╔══════════════════════════════════════╗")
  console.log("║     MOTOCLUB Database Migration      ║")
  console.log("╚══════════════════════════════════════╝")

  try {
    await sql`SELECT 1`
    console.log("\n✓ Database connection OK")
  } catch (err: any) {
    console.error("\n✗ Cannot connect to database:", err.message)
    process.exit(1)
  }

  try {
    await createTables()
    await upgradeLegacyColumns()
    await createIndexes()
    await seedAdmin()
  } catch {
    console.error("\n✗ Migration failed. See errors above.")
    process.exit(1)
  }

  console.log("\n══════════════════════════════════════")
  console.log("  Migration completed ✓")
  console.log("══════════════════════════════════════\n")

  process.exit(0)
}

void migrate()
