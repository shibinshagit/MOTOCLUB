"use server"

import { sql, getLastError } from "@/lib/db"
import { getStaffSession } from "@/lib/staff-session"
import { getProducts } from "@/app/actions/product-actions"

export async function getStaffInventory(searchTerm?: string) {
  try {
    const session = await getStaffSession()
    if (!session || !session.deviceId || !session.companyId) {
      return { success: false, message: "Unauthorized or device not assigned" }
    }
    const deviceId = session.deviceId

    const [deviceRow] = await sql`SELECT name FROM devices WHERE id = ${deviceId}`
    const branchName = deviceRow?.name || "Main"

    // Delegate entirely to the shared inventory service logic
    // We pass skipRbac=true because the inventory page explicitly exists for viewing stock and locations.
    const res = await getProducts(deviceId, undefined, searchTerm, undefined, true)
    
    if (res.success && res.data) {
      res.data = res.data.map((p: any) => ({
        ...p,
        branch_name: branchName
      }))
    }
    
    return res
  } catch (error) {
    console.error("Get staff inventory error:", error)
    return { success: false, message: "Failed to fetch inventory" }
  }
}
