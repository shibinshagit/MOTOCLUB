"use server"

import { checkDatabaseHealth, isMockMode } from "@/lib/db"

export async function getDatabaseHealth() {
  return checkDatabaseHealth()
}

export async function getMockModeStatus() {
  return isMockMode()
}
