"use server"

import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Schema is now managed by `npm run migrate`
export async function initializeStaffSchema() {
  return { success: true, message: "Schema managed by migration script — run `npm run migrate`" }
}

// Get all staff for a device (including inactive for management)
export async function getDeviceStaff(deviceId: number) {
  try {


    const staff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId}
      ORDER BY is_active DESC, name ASC
    `

    return { success: true, data: staff }
  } catch (error) {
    console.error("Error fetching staff:", error)
    return { success: false, message: "Failed to fetch staff", data: [] }
  }
}

// Get only active staff for a device
export async function getActiveStaff(deviceId: number) {
  try {


    const staff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId} AND is_active = true
      ORDER BY name ASC
    `

    return { success: true, data: staff }
  } catch (error) {
    console.error("Error fetching active staff:", error)
    return { success: false, message: "Failed to fetch active staff", data: [] }
  }
}

// Update staff member
export async function updateStaff(
  staffId: number,
  staffData: {
    name: string
    phone: string
    email?: string
    position: string
    salary: number
    salaryDate: string
    joinedOn: string
    age?: number
    idCardNumber?: string
    address?: string
    deviceId: number
  },
) {
  try {
    // Validate required IDs
    if (!staffData.deviceId || staffData.deviceId === null || staffData.deviceId === undefined) {
      console.error("❌ Device ID is missing or null:", staffData.deviceId)
      return { success: false, message: "Device ID is required" }
    }

    if (!staffId || staffId === null || staffId === undefined) {
      console.error("❌ Staff ID is missing or null:", staffId)
      return { success: false, message: "Staff ID is required" }
    }



    // Check if staff member exists and belongs to the device
    const existingStaff = await sql`
      SELECT id, name FROM staff 
      WHERE id = ${staffId} AND device_id = ${staffData.deviceId}
      LIMIT 1
    `

    if (existingStaff.length === 0) {
      return { success: false, message: "Staff member not found or access denied" }
    }

    // Update the staff member
    const result = await sql`
      UPDATE staff SET
        name = ${staffData.name},
        phone = ${staffData.phone},
        email = ${staffData.email || null},
        position = ${staffData.position},
        salary = ${staffData.salary},
        salary_date = ${staffData.salaryDate},
        joined_on = ${staffData.joinedOn},
        age = ${staffData.age || null},
        id_card_number = ${staffData.idCardNumber || null},
        address = ${staffData.address || null},
        updated_at = NOW()
      WHERE id = ${staffId} AND device_id = ${staffData.deviceId}
      RETURNING *
    `

    if (result.length === 0) {
      return { success: false, message: "Failed to update staff member" }
    }

    console.log("✅ Staff member updated successfully:", result[0])
    revalidatePath("/dashboard")

    return {
      success: true,
      data: result[0],
      message: `${result[0].name} updated successfully`,
    }
  } catch (error) {
    console.error("❌ Error updating staff:", error)
    return { success: false, message: `Failed to update staff member: ${error.message}` }
  }
}

// Activate staff (automatically deactivates all others)
export async function activateStaff(staffId: number, deviceId: number) {
  try {
    // Start a transaction to ensure atomicity
    await sql`BEGIN`

    // First, deactivate all other staff members for this device
    await sql`
      UPDATE staff 
      SET is_active = false, updated_at = NOW()
      WHERE device_id = ${deviceId} AND id != ${staffId}
    `

    // Then activate the selected staff member
    const result = await sql`
      UPDATE staff 
      SET is_active = true, updated_at = NOW()
      WHERE id = ${staffId} AND device_id = ${deviceId}
      RETURNING *
    `

    if (result.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Staff member not found" }
    }

    // Commit the transaction
    await sql`COMMIT`

    // Get all updated staff data to return
    const allStaff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId}
      ORDER BY is_active DESC, name ASC
    `

    revalidatePath("/dashboard")
    return {
      success: true,
      data: result[0],
      allStaff: allStaff,
      message: `${result[0].name} is now the active staff member`,
    }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Error activating staff:", error)
    return { success: false, message: "Failed to activate staff member" }
  }
}

// Add a new staff member
export async function addStaff(staffData: {
  name: string
  phone: string
  email?: string
  position: string
  salary: number
  salaryDate: string
  joinedOn: string
  age?: number
  idCardNumber?: string
  address?: string
  deviceId: number
  userId: number
}) {
  try {
    // Validate required IDs
    if (!staffData.deviceId || staffData.deviceId === null || staffData.deviceId === undefined) {
      console.error("❌ Device ID is missing or null:", staffData.deviceId)
      return { success: false, message: "Device ID is required" }
    }

    if (!staffData.userId || staffData.userId === null || staffData.userId === undefined) {
      console.error("❌ User ID is missing or null:", staffData.userId)
      return { success: false, message: "User ID is required" }
    }



    // Check if there's already an active staff member
    const activeStaffCheck = await sql`
      SELECT id, name FROM staff 
      WHERE device_id = ${staffData.deviceId} AND is_active = true
      LIMIT 1
    `

    // If there's already an active staff, create new staff as inactive
    const isActive = activeStaffCheck.length === 0

    const result = await sql`
      INSERT INTO staff (
        name, phone, email, position, salary, salary_date, joined_on, 
        age, id_card_number, address, device_id, created_by, is_active
      ) VALUES (
        ${staffData.name},
        ${staffData.phone},
        ${staffData.email || null},
        ${staffData.position},
        ${staffData.salary},
        ${staffData.salaryDate},
        ${staffData.joinedOn},
        ${staffData.age || null},
        ${staffData.idCardNumber || null},
        ${staffData.address || null},
        ${staffData.deviceId},
        ${staffData.userId},
        ${isActive}
      ) RETURNING *
    `

    console.log("✅ Staff member created successfully:", result[0])
    revalidatePath("/dashboard")

    const message = isActive
      ? "Staff member added and activated successfully"
      : `Staff member added as inactive. ${activeStaffCheck[0]?.name} is currently active.`

    return { success: true, data: result[0], message }
  } catch (error) {
    console.error("❌ Error adding staff:", error)
    return { success: false, message: `Failed to add staff member: ${error.message}` }
  }
}

// Search staff
export async function searchStaff(deviceId: number, searchTerm: string) {
  try {
    const searchPattern = `%${searchTerm.toLowerCase()}%`

    const staff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId} 
        AND is_active = true
        AND (
          LOWER(name) LIKE ${searchPattern}
          OR LOWER(phone) LIKE ${searchPattern}
          OR LOWER(position) LIKE ${searchPattern}
        )
      ORDER BY name ASC
      LIMIT 20
    `

    return { success: true, data: staff }
  } catch (error) {
    console.error("Error searching staff:", error)
    return { success: false, message: "Failed to search staff", data: [] }
  }
}

// Get staff by ID
export async function getStaffById(staffId: number, deviceId: number) {
  try {
    const result = await sql`
      SELECT * FROM staff 
      WHERE id = ${staffId} AND device_id = ${deviceId}
    `

    if (result.length === 0) {
      return { success: false, message: "Staff member not found" }
    }

    return { success: true, data: result[0] }
  } catch (error) {
    console.error("Error fetching staff:", error)
    return { success: false, message: "Failed to fetch staff member" }
  }
}

// Delete staff member (soft delete)
export async function deleteStaff(staffId: number, deviceId: number) {
  try {
    // Check if this is the only staff member
    const staffCount = await sql`
      SELECT COUNT(*) as count FROM staff 
      WHERE device_id = ${deviceId}
    `

    if (staffCount[0].count <= 1) {
      return {
        success: false,
        message: "Cannot delete the only staff member.",
      }
    }

    // Check if this is the active staff
    const staffToDelete = await sql`
      SELECT is_active, name FROM staff 
      WHERE id = ${staffId} AND device_id = ${deviceId}
    `

    if (staffToDelete.length === 0) {
      return { success: false, message: "Staff member not found" }
    }

    const wasActive = staffToDelete[0].is_active

    // Delete the staff member
    await sql`
      DELETE FROM staff 
      WHERE id = ${staffId} AND device_id = ${deviceId}
    `

    // If we deleted the active staff, activate the first remaining staff
    if (wasActive) {
      const remainingStaff = await sql`
        SELECT id FROM staff 
        WHERE device_id = ${deviceId}
        ORDER BY name ASC
        LIMIT 1
      `

      if (remainingStaff.length > 0) {
        await sql`
          UPDATE staff 
          SET is_active = true, updated_at = NOW()
          WHERE id = ${remainingStaff[0].id}
        `
      }
    }

    revalidatePath("/dashboard")
    return { success: true, message: "Staff member deleted successfully" }
  } catch (error) {
    console.error("Error deleting staff:", error)
    return { success: false, message: "Failed to delete staff member" }
  }
}

// Legacy function for compatibility - now redirects to activateStaff
export async function updateStaffStatus(staffId: number, deviceId: number, isActive: boolean) {
  // Only allow activation, not deactivation
  if (!isActive) {
    return {
      success: false,
      message: "Cannot manually deactivate staff. Activate another staff member instead.",
    }
  }

  return await activateStaff(staffId, deviceId)
}
