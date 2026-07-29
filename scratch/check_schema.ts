import { sql } from "../lib/db"

async function main() {
  const result = await sql`
    SELECT column_name, data_type, character_maximum_length, udt_name 
    FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'role'
  `
  console.log(result)
  
  // also check if there is an enum type
  const enumResult = await sql`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'staff_role' OR t.typname = 'role'
  `
  console.log(enumResult)
  process.exit(0)
}
main().catch(console.error)
