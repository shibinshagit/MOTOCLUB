"use server"

import { sql } from "@/lib/db"
import { cookies } from "next/headers"
import { setStaffSessionCookie } from "@/lib/staff-session"

async function generatePasswordHash(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function login(formData: FormData) {
  try {
    const phone = formData.get("phone") as string
    const password = formData.get("password") as string

    if (!phone?.trim() || !password) {
      return {
        success: false,
        message: "Phone number and password are required",
      }
    }

    const password_hash = await generatePasswordHash(password)

    // 1. Search the Admin (devices) table
    const adminResult = await sql`
      SELECT d.id, d.name, d.email, d.logo_url as device_logo, c.name as company_name
      FROM devices d
      LEFT JOIN companies c ON d.company_id = c.id
      WHERE d.email = ${phone} AND d.password_hash = ${password_hash}
    `

    if (adminResult.length > 0) {
      const user = adminResult[0]
      const token = Math.random().toString(36).substring(2)

      await sql`
        UPDATE devices
        SET auth_token = ${token}
        WHERE id = ${user.id}
      `

      const deviceData = await sql`
        SELECT 
          d.id, 
          d.name, 
          d.currency,
          d.logo_url as device_logo,
          c.id as company_id,
          c.name as company_name
        FROM devices d
        LEFT JOIN companies c ON d.company_id = c.id
        WHERE d.id = ${user.id}
      `

      const deviceInfo = deviceData[0] || {}
      const deviceLogo = deviceInfo.device_logo?.trim() || null

      return {
        success: true,
        message: "Login successful",
        redirect: "/dashboard",
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            token,
            role: "DEVICE_USER",
          },
          device: {
            id: deviceInfo.id || user.id,
            name: deviceInfo.name || user.name,
            currency: deviceInfo.currency || "AED",
            logo_url: deviceLogo,
          },
          company: {
            id: deviceInfo.company_id,
            name: deviceInfo.company_name || user.company_name,
          },
        },
      }
    }

    // 2. Search the Staff table
    const staffResult = await sql`
      SELECT 
        s.id as staff_id,
        s.name as staff_name,
        s.phone,
        s.email as staff_email,
        s.role,
        s.position,
        s.salary,
        s.salary_date,
        s.joined_on,
        s.age,
        s.id_card_number,
        s.address,
        s.is_active as staff_active,
        s.restricted_pages,
        s.restricted_values,
        s.created_by,
        s.created_at,
        s.updated_at,
        d.id as device_id,
        d.name as device_name,
        d.currency as device_currency,
        d.logo_url as device_logo,
        c.id as company_id,
        c.name as company_name
      FROM staff s
      LEFT JOIN devices d ON s.device_id = d.id
      LEFT JOIN companies c ON d.company_id = c.id
      WHERE s.phone = ${phone} AND s.staff_password_hash = ${password_hash}
      LIMIT 1
    `

    if (staffResult.length > 0) {
      const staff = staffResult[0]

      if (!staff.staff_active) {
        return {
          success: false,
          message: "Your staff account has been deactivated. Please contact your admin.",
        }
      }

      let restricted_pages: string[] = []
      let restricted_values: string[] = []
      
      try {
        restricted_pages = typeof staff.restricted_pages === 'string' 
          ? JSON.parse(staff.restricted_pages) 
          : (staff.restricted_pages || [])
          
        restricted_values = typeof staff.restricted_values === 'string' 
          ? JSON.parse(staff.restricted_values) 
          : (staff.restricted_values || [])
      } catch (e) {
        console.warn("Failed to parse staff restrictions during login", e)
      }

      await setStaffSessionCookie({
        staffId: staff.staff_id,
        companyId: staff.company_id,
        deviceId: staff.device_id,
        branchId: staff.device_id,
        phoneNumber: staff.phone,
        role: staff.role,
        permissions: {
          restricted_pages,
          restricted_values,
        },
      })

      const token = Math.random().toString(36).substring(2)

      if (staff.device_id) {
        await sql`
          UPDATE devices
          SET auth_token = ${token}
          WHERE id = ${staff.device_id}
        `
      }

      const role = staff.role === "admin" ? "ADMIN" : "STAFF"
      const redirect = role === "STAFF" ? "/staff/dashboard" : "/dashboard"
      const deviceLogo = staff.device_logo?.trim() || null

      return {
        success: true,
        message: "Login successful",
        redirect,
        data: {
          user: {
            id: staff.staff_id,
            name: staff.staff_name,
            email: staff.phone,
            token,
            role,
          },
          device: staff.device_id ? {
            id: staff.device_id,
            name: staff.device_name || staff.staff_name,
            currency: staff.device_currency || "AED",
            logo_url: deviceLogo,
          } : null,
          company: staff.company_id ? {
            id: staff.company_id,
            name: staff.company_name || "",
          } : null,
          staff: {
            id: staff.staff_id,
            name: staff.staff_name,
            phone: staff.phone,
            email: staff.staff_email || null,
            role: staff.role || "staff",
            restricted_pages,
            restricted_values,
            position: staff.position || "",
            salary: Number(staff.salary) || 0,
            salary_date: staff.salary_date ? new Date(staff.salary_date).toISOString() : "",
            joined_on: staff.joined_on ? new Date(staff.joined_on).toISOString() : "",
            age: staff.age || null,
            id_card_number: staff.id_card_number || null,
            address: staff.address || null,
            is_active: staff.staff_active,
            device_id: staff.device_id,
            company_id: staff.company_id,
            created_by: staff.created_by,
            created_at: staff.created_at ? new Date(staff.created_at).toISOString() : "",
            updated_at: staff.updated_at ? new Date(staff.updated_at).toISOString() : "",
          }
        }
      }
    }

    // 3. If neither found
    return {
      success: false,
      message: "Invalid phone number or password.",
    }
  } catch (error) {
    console.error("Login error:", error)
    return {
      success: false,
      message: "Unable to sign in. Please check your credentials and try again.",
    }
  }
}

export async function logout() {
  try {
    cookies().delete("authToken")

    return {
      success: true,
      message: "Logout successful",
      clearRedux: true,
    }
  } catch (error) {
    console.error("Logout error:", error)
    return {
      success: false,
      message: "An error occurred during logout",
      clearRedux: true,
    }
  }
}

export async function getCurrentUser() {
  try {
    const result = await sql`
      SELECT d.id, d.name, d.email, d.logo_url as device_logo, c.name as company_name
      FROM devices d
      LEFT JOIN companies c ON d.company_id = c.id
      LIMIT 1
    `

    if (result.length === 0) {
      return null
    }

    const user = result[0]
    return {
      ...user,
      device_logo: user.device_logo?.trim() || null,
    }
  } catch (error) {
    console.error("Get current user error:", error)
    return null
  }
}

export async function getDeviceProfile(deviceId: number) {
  try {
    if (!deviceId || Number.isNaN(deviceId)) {
      return { success: false as const, message: "Invalid device" }
    }

    const result = await sql`
      SELECT
        d.id,
        d.name,
        d.currency,
        d.logo_url,
        c.id as company_id,
        c.name as company_name
      FROM devices d
      LEFT JOIN companies c ON d.company_id = c.id
      WHERE d.id = ${deviceId}
      LIMIT 1
    `

    if (result.length === 0) {
      return { success: false as const, message: "Device not found" }
    }

    const row = result[0]
    return {
      success: true as const,
      data: {
        id: row.id as number,
        name: row.name as string,
        currency: (row.currency as string) || "AED",
        logo_url: (row.logo_url as string | null)?.trim() || null,
        company: {
          id: row.company_id as number | null,
          name: (row.company_name as string | null) || null,
        },
      },
    }
  } catch (error) {
    console.error("Get device profile error:", error)
    return {
      success: false as const,
      message: "Failed to load device profile",
    }
  }
}

export async function forgotPassword(formData: FormData) {
  try {
    const email = formData.get("email") as string

    if (!email?.trim()) {
      return {
        success: false,
        message: "Email is required",
      }
    }

    const result = await sql`
      SELECT id FROM devices WHERE email = ${email}
    `

    if (result.length === 0) {
      return {
        success: false,
        message: "No account found with that email address",
      }
    }

    return {
      success: true,
      message: "Password reset instructions sent to your email",
    }
  } catch (error) {
    console.error("Forgot password error:", error)
    return {
      success: false,
      message: "An error occurred while processing your request",
    }
  }
}

export async function signUp(formData: FormData) {
  try {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    if (!name?.trim() || !email?.trim() || !password) {
      return {
        success: false,
        message: "Name, email, and password are required",
      }
    }

    const emailCheck = await sql`
      SELECT id FROM devices WHERE email = ${email}
    `

    if (emailCheck.length > 0) {
      return {
        success: false,
        message: "Email address is already in use",
      }
    }

    return {
      success: true,
      message: "Account created successfully. Please contact your administrator to assign you to a company.",
    }
  } catch (error) {
    console.error("Sign up error:", error)
    return {
      success: false,
      message: "An error occurred while creating your account",
    }
  }
}
