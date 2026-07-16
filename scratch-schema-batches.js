require("dotenv").config({ path: ".env" });
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
async function run() {
  const res = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'product_batches'`;
  console.log(res);
}
run();
