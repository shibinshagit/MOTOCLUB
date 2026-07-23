import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function run() {
  const result = await sql`
    SELECT id, name, category, category_id
    FROM products
    ORDER BY id ASC
    LIMIT 10
  `;
  console.log("PRODUCTS:", result);
  
  const variants = await sql`
    SELECT id, product_id, name
    FROM product_variants
    LIMIT 10
  `;
  console.log("VARIANTS:", variants);
}

run().catch(console.error);
