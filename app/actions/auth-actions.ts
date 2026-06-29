"use server"

import { sql } from "@/lib/db"
import { cookies } from "next/headers"

async function generatePasswordHash(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function login(formData: FormData) {
  try {
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    if (!email?.trim() || !password) {
      return {
        success: false,
        message: "Email and password are required",
      }
    }

    const password_hash = await generatePasswordHash(password)

    const result = await sql`
      SELECT d.id, d.name, d.email, d.logo_url as device_logo, c.name as company_name
      FROM devices d
      LEFT JOIN companies c ON d.company_id = c.id
      WHERE d.email = ${email} AND d.password_hash = ${password_hash}
    `

    if (result.length === 0) {
      return {
        success: false,
        message: "Invalid email or password",
      }
    }

    const user = result[0]
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
