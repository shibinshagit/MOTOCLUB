"use server"

import { sql, getLastError } from "@/lib/db"
import { getStaffSession } from "@/lib/staff-session"
import { getProducts } from "@/app/actions/product-actions"

import { revalidatePath } from "next/cache"

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

export async function updateStaffProductMedia(
  productId: number,
  imageUrls: string[],
  videoUrl?: string | null
) {
  try {
    const session = await getStaffSession()
    if (!session || !session.deviceId || !session.companyId) {
      return { success: false, message: "Unauthorized or device not assigned" }
    }

    if (!productId || typeof productId !== "number") {
      return { success: false, message: "Invalid product ID" }
    }

    const cleanImageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter((url) => typeof url === "string" && url.trim().length > 0).slice(0, 4)
      : []

    const cleanVideoUrl = typeof videoUrl === "string" && videoUrl.trim().length > 0 ? videoUrl.trim() : null
    const primaryImageUrl = cleanImageUrls[0] || null

    const result = await sql`
      UPDATE products
      SET
        image_url = ${primaryImageUrl},
        image_urls = ${JSON.stringify(cleanImageUrls)},
        video_url = ${cleanVideoUrl}
      WHERE id = ${productId}
      RETURNING *
    `

    if (result.length === 0) {
      return { success: false, message: "Product not found or update failed" }
    }

    revalidatePath("/dashboard/inventory")

    return {
      success: true,
      message: "Product media updated successfully",
      product: result[0],
    }
  } catch (error) {
    console.error("Update staff product media error:", error)
    return { success: false, message: "Failed to update product media" }
  }
}

