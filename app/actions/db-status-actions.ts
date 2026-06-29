"use server"

import { checkDatabaseHealth } from "@/lib/db"

export async function getDatabaseHealth() {
  return checkDatabaseHealth()
}
