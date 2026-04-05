"use server"

import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Schema is now managed by `npm run migrate`
export async function initializeServicesSchema() {
  return { success: true, message: "Schema managed by migration script — run `npm run migrate`" }
}

// Get all services for a device
export async function getDeviceServices(deviceId: number) {
  try {
    await initializeServicesSchema()

    console.log("Fetching services for device:", deviceId)

    const services = await sql`
      SELECT * FROM services 
      WHERE device_id = ${deviceId} AND is_active = true
      ORDER BY name ASC
    `

    console.log("Found services:", services.length)

    return { success: true, data: services }
  } catch (error) {
    console.error("Error fetching services:", error)
    return { success: false, message: "Failed to fetch services", data: [] }
  }
}

// Add a new service
export async function addService(serviceData: {
  name: string
  price: number
  deviceId: number
  userId: number
}) {
  try {
    await initializeServicesSchema()

    const result = await sql`
      INSERT INTO services (name, price, device_id, created_by)
      VALUES (${serviceData.name}, ${serviceData.price}, ${serviceData.deviceId}, ${serviceData.userId})
      RETURNING *
    `

    revalidatePath("/dashboard")
    return { success: true, data: result[0], message: "Service added successfully" }
  } catch (error) {
    console.error("Error adding service:", error)
    return { success: false, message: "Failed to add service" }
  }
}

// Search services
export async function searchServices(deviceId: number, searchTerm: string) {
  try {
    const searchPattern = `%${searchTerm.toLowerCase()}%`

    const services = await sql`
      SELECT * FROM services 
      WHERE device_id = ${deviceId} 
        AND is_active = true
        AND (
          LOWER(name) LIKE ${searchPattern}
          OR LOWER(description) LIKE ${searchPattern}
          OR LOWER(category) LIKE ${searchPattern}
        )
      ORDER BY name ASC
      LIMIT 20
    `

    return { success: true, data: services }
  } catch (error) {
    console.error("Error searching services:", error)
    return { success: false, message: "Failed to search services", data: [] }
  }
}

// Get service by ID
export async function getServiceById(serviceId: number, deviceId: number) {
  try {
    const result = await sql`
      SELECT * FROM services 
      WHERE id = ${serviceId} AND device_id = ${deviceId} AND is_active = true
    `

    if (result.length === 0) {
      return { success: false, message: "Service not found" }
    }

    return { success: true, data: result[0] }
  } catch (error) {
    console.error("Error fetching service:", error)
    return { success: false, message: "Failed to fetch service" }
  }
}

// Delete service
export async function deleteService(serviceId: number, deviceId: number) {
  try {
    const result = await sql`
      UPDATE services 
      SET is_active = false, updated_at = NOW()
      WHERE id = ${serviceId} AND device_id = ${deviceId}
      RETURNING *
    `

    if (result.length === 0) {
      return { success: false, message: "Service not found" }
    }

    revalidatePath("/dashboard")
    return { success: true, message: "Service deleted successfully" }
  } catch (error) {
    console.error("Error deleting service:", error)
    return { success: false, message: "Failed to delete service" }
  }
}
