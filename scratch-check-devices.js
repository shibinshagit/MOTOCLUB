require("dotenv").config({ path: ".env" });
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
async function run() {
  const res = await sql`SELECT * FROM devices`;
  console.log("Devices:", res);
}
run();
