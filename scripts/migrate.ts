/**
 * Database Migration Script
 *
 * Run manually:  npm run migrate
 *
 * This is the ONLY place where CREATE TABLE / ALTER TABLE DDL lives.
 * Every migration is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
 * so it is safe to re-run at any time.
 */

import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })
dotenv.config()

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

const sql = neon(DATABASE_URL)

// ─── helpers ────────────────────────────────────────────────────────────────

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

// ─── core auth / admin tables ───────────────────────────────────────────────

async function createCoreTables() {
  console.log("\n── Core tables (auth / admin) ──\n")

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
        currency VARCHAR(10) DEFAULT 'INR',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
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
}

// ─── product tables ─────────────────────────────────────────────────────────

async function createProductTables() {
  console.log("\n── Product tables ──\n")

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
        stock INTEGER DEFAULT 0,
        barcode VARCHAR(255),
        image_url TEXT,
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

  await run("product_stock_history", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS product_stock_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
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
}

// ─── sales & purchase tables ────────────────────────────────────────────────

async function createSalesPurchaseTables() {
  console.log("\n── Sales & Purchase tables ──\n")

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

  await run("stock_history", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS stock_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        change_type VARCHAR(50),
        quantity_change INTEGER,
        sale_id INTEGER,
        purchase_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })
}

// ─── staff & service tables ─────────────────────────────────────────────────

async function createStaffServiceTables() {
  console.log("\n── Staff & Service tables ──\n")

  await run("staff", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
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

  await run("service_items", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS service_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        price DECIMAL(10,2) NOT NULL,
        notes TEXT,
        staff_id INTEGER,
        service_cost DECIMAL(10,2) DEFAULT 0,
        include_cost_in_invoice BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })
}

// ─── finance & accounting tables ────────────────────────────────────────────

async function createFinanceTables() {
  console.log("\n── Finance & Accounting tables ──\n")

  await run("financial_transactions", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id SERIAL PRIMARY KEY,
        transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
        transaction_type VARCHAR(50) NOT NULL,
        reference_type VARCHAR(50) NOT NULL,
        reference_id INTEGER NOT NULL,
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

  await run("financial_ledger", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id SERIAL PRIMARY KEY,
        transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
        transaction_type VARCHAR(50) NOT NULL,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        amount DECIMAL(12,2) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        account_type VARCHAR(50) NOT NULL,
        debit_amount DECIMAL(12,2) DEFAULT 0,
        credit_amount DECIMAL(12,2) DEFAULT 0,
        device_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("payments", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        reference_type VARCHAR(50) NOT NULL,
        reference_id INTEGER NOT NULL,
        payment_date TIMESTAMP NOT NULL DEFAULT NOW(),
        amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'Cash',
        notes TEXT,
        device_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("cogs_entries", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS cogs_entries (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        cost_price DECIMAL(12,2) NOT NULL,
        total_cost DECIMAL(12,2) NOT NULL,
        device_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("accounts_receivable", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS accounts_receivable (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        sale_id INTEGER,
        original_amount DECIMAL(12,2) NOT NULL,
        paid_amount DECIMAL(12,2) DEFAULT 0,
        outstanding_amount DECIMAL(12,2) NOT NULL,
        due_date TIMESTAMP,
        device_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  })

  await run("accounts_payable", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS accounts_payable (
        id SERIAL PRIMARY KEY,
        supplier_name VARCHAR(255) NOT NULL,
        purchase_id INTEGER,
        original_amount DECIMAL(12,2) NOT NULL,
        paid_amount DECIMAL(12,2) DEFAULT 0,
        outstanding_amount DECIMAL(12,2) NOT NULL,
        due_date TIMESTAMP,
        device_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
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

  await run("income_categories", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS income_categories (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
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

// ─── columns (for existing / older databases) ──────────────────────────────

async function addColumns() {
  console.log("\n── Adding columns to existing tables ──\n")

  // ── products ──
  await runSafe("products.barcode", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(255)`)
  await runSafe("products.company_name", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`)
  await runSafe("products.category_id", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER`)
  await runSafe("products.wholesale_price", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10, 2) DEFAULT 0`)
  await runSafe("products.msp", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS msp DECIMAL(10, 2) DEFAULT 0`)
  await runSafe("products.image_url", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT`)
  await runSafe("products.shelf", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf VARCHAR(255)`)
  await runSafe("products.color", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(255)`)
  await runSafe("products.size", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS size VARCHAR(255)`)
  await runSafe("products.suitable_for", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS suitable_for TEXT`)
  await runSafe("products.attributes", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '[]'`)
  await runSafe("products.link", () => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS link TEXT`)

  // ── product_categories ──
  await runSafe("product_categories.parent_id", () => sql`ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS parent_id INTEGER`)
  await runSafe("product_categories.description", () => sql`ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS description TEXT`)
  await runSafe("product_categories.updated_at", () => sql`ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`)

  // ── suppliers ──
  await runSafe("suppliers.updated_at", () => sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)

  // ── sales ──
  await runSafe("sales.device_id", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id INTEGER`)
  await runSafe("sales.received_amount", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`)
  await runSafe("sales.staff_id", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id INTEGER`)
  await runSafe("sales.sale_type", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) DEFAULT 'product'`)
  await runSafe("sales.payment_method", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`)
  await runSafe("sales.discount", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount DECIMAL(12,2) DEFAULT 0`)
  await runSafe("sales.total_cost", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12,2) DEFAULT 0`)
  await runSafe("sales.updated_at", () => sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`)

  // ── sale_items ──
  await runSafe("sale_items.cost", () => sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost DECIMAL(12,2) DEFAULT 0`)
  await runSafe("sale_items.notes", () => sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS notes TEXT`)

  // ── purchases ──
  await runSafe("purchases.device_id", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS device_id INTEGER`)
  await runSafe("purchases.payment_method", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`)
  await runSafe("purchases.purchase_status", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_status VARCHAR(50) DEFAULT 'Delivered'`)
  await runSafe("purchases.received_amount", () => sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`)

  // ── stock_history ──
  await runSafe("stock_history.change_type", () => sql`ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS change_type VARCHAR(50)`)
  await runSafe("stock_history.quantity_change", () => sql`ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS quantity_change INTEGER`)

  // ── service_items ──
  await runSafe("service_items.staff_id", () => sql`ALTER TABLE service_items ADD COLUMN IF NOT EXISTS staff_id INTEGER`)
  await runSafe("service_items.service_cost", () => sql`ALTER TABLE service_items ADD COLUMN IF NOT EXISTS service_cost DECIMAL(10,2) DEFAULT 0`)
  await runSafe("service_items.include_cost_in_invoice", () => sql`ALTER TABLE service_items ADD COLUMN IF NOT EXISTS include_cost_in_invoice BOOLEAN DEFAULT false`)

  // ── financial_transactions ──
  await runSafe("financial_transactions.device_id", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS device_id INTEGER`)
  await runSafe("financial_transactions.received_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`)
  await runSafe("financial_transactions.cost_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS cost_amount DECIMAL(12,2) DEFAULT 0`)
  await runSafe("financial_transactions.debit_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS debit_amount DECIMAL(12,2) DEFAULT 0`)
  await runSafe("financial_transactions.credit_amount", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS credit_amount DECIMAL(12,2) DEFAULT 0`)
  await runSafe("financial_transactions.status", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50)`)
  await runSafe("financial_transactions.payment_method", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`)
  await runSafe("financial_transactions.notes", () => sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT`)

  // ── devices ──
  await runSafe("devices.currency", () => sql`ALTER TABLE devices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR'`)

  // ── budgets ──
  await runSafe("budgets.device_id", () => sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS device_id INTEGER`)

  // ── expense_categories ──
  await runSafe("expense_categories.device_id", () => sql`ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS device_id INTEGER`)

  // ── petty_cash ──
  await runSafe("petty_cash.device_id", () => sql`ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS device_id INTEGER`)
}

// ─── indexes ────────────────────────────────────────────────────────────────

async function createIndexes() {
  console.log("\n── Creating indexes ──\n")

  // financial_ledger
  await runSafe("idx_financial_ledger_device_date", () => sql`CREATE INDEX IF NOT EXISTS idx_financial_ledger_device_date ON financial_ledger(device_id, transaction_date)`)
  await runSafe("idx_financial_ledger_type", () => sql`CREATE INDEX IF NOT EXISTS idx_financial_ledger_type ON financial_ledger(transaction_type)`)
  await runSafe("idx_payments_reference", () => sql`CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference_type, reference_id)`)
  // financial_transactions
  await runSafe("idx_ft_device_date", () => sql`CREATE INDEX IF NOT EXISTS idx_ft_device_date ON financial_transactions(device_id, transaction_date)`)
  await runSafe("idx_ft_ref", () => sql`CREATE INDEX IF NOT EXISTS idx_ft_ref ON financial_transactions(reference_type, reference_id)`)
  // services
  await runSafe("idx_services_device_id", () => sql`CREATE INDEX IF NOT EXISTS idx_services_device_id ON services(device_id)`)
  await runSafe("idx_services_active", () => sql`CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active)`)
  await runSafe("idx_services_category", () => sql`CREATE INDEX IF NOT EXISTS idx_services_category ON services(category)`)
  await runSafe("idx_service_items_sale_id", () => sql`CREATE INDEX IF NOT EXISTS idx_service_items_sale_id ON service_items(sale_id)`)
  await runSafe("idx_service_items_service_id", () => sql`CREATE INDEX IF NOT EXISTS idx_service_items_service_id ON service_items(service_id)`)
  // staff
  await runSafe("idx_staff_device_id", () => sql`CREATE INDEX IF NOT EXISTS idx_staff_device_id ON staff(device_id)`)
  await runSafe("idx_staff_active", () => sql`CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(is_active)`)
  await runSafe("idx_staff_position", () => sql`CREATE INDEX IF NOT EXISTS idx_staff_position ON staff(position)`)
}

// ─── main ───────────────────────────────────────────────────────────────────

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
    await createCoreTables()
    await createProductTables()
    await createSalesPurchaseTables()
    await createStaffServiceTables()
    await createFinanceTables()
  } catch {
    console.error("\n✗ Table creation failed. See errors above.")
    process.exit(1)
  }

  await addColumns()
  await createIndexes()

  console.log("\n══════════════════════════════════════")
  console.log("  Migration completed ✓")
  console.log("══════════════════════════════════════\n")

  process.exit(0)
}

migrate()
