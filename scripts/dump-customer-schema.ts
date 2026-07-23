import { sql } from "../lib/db"

async function run() {
  try {
    const res = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customers';
    `
    console.log(JSON.stringify(res, null, 2))
  } catch (err) {
    console.error(err)
  }
}

run()
