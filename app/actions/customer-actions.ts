"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getCustomerById(customerId: number) {
  if (!customerId) {
    return { success: false as const, message: "Customer ID is required" }
  }

  try {
    const rows = await sql`
      SELECT *
      FROM customers
      WHERE id = ${customerId}
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: false as const, message: "Customer not found" }
    }

    return { success: true as const, data: rows[0] }
  } catch (error) {
    console.error("getCustomerById error:", error)
    return { success: false as const, message: "Failed to load customer" }
  }
}

export async function getCustomerAddresses(customerId: number, companyId?: number) {
  if (!customerId) return { success: false, data: [] }
  if (companyId) {
    const verify = await sql`
      SELECT id FROM customers
      WHERE id = ${customerId}
      AND (created_by = ${companyId} OR created_by IN (SELECT id FROM devices WHERE company_id = ${companyId}))
    `;
    if (verify.length === 0) return { success: false, data: [] };
  }
  try {
    const addresses = await sql`
      SELECT * FROM customer_addresses
      WHERE customer_id = ${customerId}
      ORDER BY is_default DESC, created_at DESC
    `
    return { success: true, data: addresses }
  } catch (error) {
    console.error("getCustomerAddresses error:", error)
    return { success: false, data: [] }
  }
}

export async function getCustomers(userId?: number, limit?: number, searchTerm?: string) {
  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    let customers

    if (searchTerm && searchTerm.trim() !== "") {
      // Search query - search across name, email, phone, and address
      const searchPattern = `%${searchTerm.toLowerCase()}%`

      if (userId) {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (c.created_by = ${userId} OR c.created_by IN (SELECT id FROM devices WHERE company_id = ${userId}))
            AND (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (c.created_by = ${userId} OR c.created_by IN (SELECT id FROM devices WHERE company_id = ${userId}))
            AND (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      } else {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      }
    } else {
      // Regular query without search
      if (userId) {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (c.created_by = ${userId} OR c.created_by IN (SELECT id FROM devices WHERE company_id = ${userId}))
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (c.created_by = ${userId} OR c.created_by IN (SELECT id FROM devices WHERE company_id = ${userId}))
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      } else {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      }
    }

    return { success: true, data: customers }
  } catch (error) {
    console.error("Get customers error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function addCustomer(formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const address = formData.get("address") as string
  const userId = Number.parseInt(formData.get("user_id") as string)

  const city = (formData.get("city") as string) || null
  const district = (formData.get("district") as string) || null
  const state = (formData.get("state") as string) || null
  const street = (formData.get("street") as string) || null
  const area = (formData.get("area") as string) || null
  const landmark = (formData.get("landmark") as string) || null
  const address_type = (formData.get("address_type") as string) || null
  const pincode = (formData.get("pincode") as string) || null

  if (!name) {
    return { success: false, message: "Name is required" }
  }

  let finalAddress = address
  if (!finalAddress && (city || street || landmark || pincode)) {
    finalAddress = [
      street,
      landmark,
      city,
      pincode ? `Pincode: ${pincode}` : null,
      address_type ? `(${address_type})` : null,
    ]
      .filter(Boolean)
      .join(", ")
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = await sql`
    INSERT INTO customers (name, email, phone, address, created_by, city, district, state, street, landmark, address_type, pincode)
    VALUES (${name}, ${email}, ${phone}, ${finalAddress}, ${userId}, ${city}, ${district}, ${state}, ${street}, ${landmark}, ${address_type}, ${pincode})
    RETURNING *
  `

    if (result.length > 0) {
      const customerId = result[0].id
      if (city || street || landmark || pincode || district || state) {
        await sql`
          INSERT INTO customer_addresses (
            customer_id, phone, city, district, state, pincode, street, area, landmark, address_type, is_default
          ) VALUES (
            ${customerId}, ${phone || null}, ${city}, ${district}, ${state}, ${pincode}, ${street}, ${area || null}, ${landmark}, ${address_type || 'Home'}, true
          )
        `
      }

      revalidatePath("/dashboard")
      return { success: true, message: "Customer added successfully", data: result[0] }
    }

    return { success: false, message: "Failed to add customer" }
  } catch (error) {
    console.error("Add customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

// Fixed updateCustomer function to correct SQL syntax
export async function updateCustomer(formData: FormData) {
  const id = Number.parseInt(formData.get("id") as string)
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const address = formData.get("address") as string
  const userId = formData.get("user_id") ? Number.parseInt(formData.get("user_id") as string) : undefined

  const city = (formData.get("city") as string) || null
  const street = (formData.get("street") as string) || null
  const area = (formData.get("area") as string) || null
  const landmark = (formData.get("landmark") as string) || null
  const address_type = (formData.get("address_type") as string) || null
  const pincode = (formData.get("pincode") as string) || null

  if (!id || !name) {
    return { success: false, message: "ID and name are required" }
  }

  let finalAddress = address
  if (!finalAddress && (city || street || landmark || pincode)) {
    finalAddress = [
      street,
      landmark,
      city,
      pincode ? `Pincode: ${pincode}` : null,
      address_type ? `(${address_type})` : null,
    ]
      .filter(Boolean)
      .join(", ")
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    let result

    // Fix the SQL syntax by using separate queries based on whether userId is provided
    if (userId) {
      result = await sql`
        UPDATE customers
        SET name = ${name}, email = ${email}, phone = ${phone}, address = ${finalAddress},
            city = ${city}, street = ${street}, landmark = ${landmark}, address_type = ${address_type}, pincode = ${pincode}
        WHERE id = ${id} AND created_by = ${userId}
        RETURNING *
      `
    } else {
      result = await sql`
        UPDATE customers
        SET name = ${name}, email = ${email}, phone = ${phone}, address = ${finalAddress},
            city = ${city}, street = ${street}, landmark = ${landmark}, address_type = ${address_type}, pincode = ${pincode}
        WHERE id = ${id}
        RETURNING *
      `
    }

    if (result.length > 0) {
      revalidatePath("/dashboard")
      return { success: true, message: "Customer updated successfully", data: result[0] }
    }

    return { success: false, message: "Failed to update customer" }
  } catch (error) {
    console.error("Update customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function getCustomerSales(customerId: number, companyId?: number) {
  if (!customerId) {
    return { success: false, message: "Customer ID is required", data: [] }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const sales = await sql`
      SELECT s.id, 
             s.sale_date, 
             s.total_amount,
             s.received_amount, 
             s.payment_method, 
             s.status, 
             s.customer_id,
             COUNT(si.id) as item_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.customer_id = ${customerId}
      ${companyId ? sql`AND s.device_id IN (SELECT id FROM devices WHERE company_id = ${companyId})` : sql``}
      GROUP BY s.id, s.sale_date, s.total_amount, s.received_amount, s.payment_method, s.status, s.customer_id
      ORDER BY s.sale_date DESC
    `

    return { success: true, data: sales }
  } catch (error) {
    console.error("Get customer sales error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export type CustomerSettlementSummary = {
  customer_id: number
  customer_name: string
  total_billed: number
  already_received: number
  still_to_collect: number
  open_sale_count: number
}

export async function getCustomerSettlementSummaries(deviceId: number, companyId: number) {
  if (!deviceId || !companyId) {
    return { success: false, message: "Device ID and company ID are required", data: [] as CustomerSettlementSummary[] }
  }

  resetConnectionState()

  try {
    const rows = (await sql`
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        SUM(COALESCE(s.total_amount, 0))::numeric AS total_billed,
        SUM(COALESCE(s.received_amount, 0))::numeric AS already_received,
        SUM(GREATEST(COALESCE(s.total_amount, 0) - COALESCE(s.received_amount, 0), 0))::numeric AS still_to_collect,
        COUNT(*) FILTER (
          WHERE COALESCE(s.total_amount, 0) - COALESCE(s.received_amount, 0) > 0.01
        )::int AS open_sale_count
      FROM customers c
      JOIN sales s ON s.customer_id = c.id
      WHERE (c.created_by = ${companyId} OR c.created_by IN (SELECT id FROM devices WHERE company_id = ${companyId}))
        AND s.device_id IN (SELECT id FROM devices WHERE company_id = ${companyId})
        AND LOWER(COALESCE(s.status, '')) != 'cancelled'
      GROUP BY c.id, c.name
      HAVING SUM(GREATEST(COALESCE(s.total_amount, 0) - COALESCE(s.received_amount, 0), 0)) > 0.01
      ORDER BY still_to_collect DESC, c.name ASC
    `) as any[]

    const data: CustomerSettlementSummary[] = rows.map((row) => ({
      customer_id: Number(row.customer_id),
      customer_name: String(row.customer_name || `Customer #${row.customer_id}`),
      total_billed: Number(row.total_billed || 0),
      already_received: Number(row.already_received || 0),
      still_to_collect: Number(row.still_to_collect || 0),
      open_sale_count: Number(row.open_sale_count || 0),
    }))

    return { success: true, data }
  } catch (error) {
    console.error("getCustomerSettlementSummaries error:", error)
    return {
      success: false,
      message: getLastError()?.message || "Failed to load customer balances",
      data: [] as CustomerSettlementSummary[],
    }
  }
}

export async function deleteCustomer(id: number, companyId?: number) {
  if (!id) {
    return { success: false, message: "Customer ID is required" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Check if customer has any sales
    const sales = await sql`SELECT id FROM sales WHERE customer_id = ${id}`

    if (sales.length > 0) {
      return { success: false, message: "Cannot delete customer with existing sales" }
    }

    const result = await sql`DELETE FROM customers WHERE id = ${id} RETURNING id`

    if (result.length > 0) {
      revalidatePath("/dashboard")
      return { success: true, message: "Customer deleted successfully" }
    }

    return { success: false, message: "Failed to delete customer" }
  } catch (error) {
    console.error("Delete customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function addSecondaryCustomerAddress(customerId: number, data: any) {
  if (!customerId) return { success: false, message: "Customer ID is required" }
  resetConnectionState()

  try {
    const isDefault = data.is_default === true

    if (isDefault) {
      await sql`UPDATE customer_addresses SET is_default = false WHERE customer_id = ${customerId}`
    } else {
      const existing = await sql`SELECT id FROM customer_addresses WHERE customer_id = ${customerId} LIMIT 1`
      if (existing.length === 0) {
        data.is_default = true // Force default if it's the first address
      }
    }

    const result = await sql`
      INSERT INTO customer_addresses (
        customer_id, phone, city, district, state, pincode, street, area, landmark, address_type, is_default
      ) VALUES (
        ${customerId},
        ${data.phone || null},
        ${data.city || null},
        ${data.district || null},
        ${data.state || null},
        ${data.pincode || null},
        ${data.street || null},
        ${data.area || null},
        ${data.landmark || null},
        ${data.address_type || 'Other'},
        ${data.is_default === true}
      )
      RETURNING *
    `

    return { success: true, data: result[0], message: "Address added successfully" }
  } catch (error) {
    console.error("addSecondaryCustomerAddress error:", error)
    return { success: false, message: "Failed to add address" }
  }
}

export async function setDefaultCustomerAddress(customerId: number, addressId: number) {
  if (!customerId || !addressId) return { success: false, message: "Invalid parameters" }
  resetConnectionState()

  try {
    await sql`UPDATE customer_addresses SET is_default = false WHERE customer_id = ${customerId}`
    await sql`UPDATE customer_addresses SET is_default = true WHERE id = ${addressId} AND customer_id = ${customerId}`
    return { success: true, message: "Default address updated" }
  } catch (error) {
    console.error("setDefaultCustomerAddress error:", error)
    return { success: false, message: "Failed to update default address" }
  }
}

export async function syncCustomerShippingAddress(customerId: number, data: any) {
  if (!customerId) {
    return { success: false, message: "Customer ID is required" }
  }

  resetConnectionState()

  try {
    // Check customer exists
    const custCheck = await sql`SELECT id FROM customers WHERE id = ${customerId} LIMIT 1`
    if (custCheck.length === 0) {
      return { success: false, message: "Customer not found" }
    }

    const street = (data.shipping_street || data.shippingStreet || data.street || data.shipping_address || data.shippingAddress || data.address || "").trim() || null
    const area = (data.shipping_area || data.shippingArea || data.area || "").trim() || null
    const city = (data.shipping_city || data.shippingCity || data.city || "").trim() || null
    const district = (data.shipping_district || data.shippingDistrict || data.district || "").trim() || null
    const state = (data.shipping_state || data.shippingState || data.state || "").trim() || null
    const pincode = (data.shipping_pincode || data.shippingPincode || data.pincode || "").trim() || null
    const landmark = (data.shipping_landmark || data.shippingLandmark || data.landmark || "").trim() || null
    const address_type = (data.shipping_address_type || data.shippingAddressType || data.address_type || "Shipping Address").trim() || "Shipping Address"
    const phone = (data.customer_phone_override || data.customerPhoneOverride || data.shippingPhone || data.phone || "").trim() || null

    // Validation: skip empty address
    if (!street && !city && !district && !state && !pincode && !landmark) {
      return { success: false, message: "No valid address fields to sync" }
    }

    const norm = (val?: string | null) => (val || "").toLowerCase().trim().replace(/\s+/g, " ")

    const existingAddresses = await sql`
      SELECT * FROM customer_addresses WHERE customer_id = ${customerId}
    `

    const incomingStreetNorm = norm(street)
    const incomingCityNorm = norm(city)
    const incomingDistrictNorm = norm(district)
    const incomingStateNorm = norm(state)
    const incomingPincodeNorm = norm(pincode)
    const incomingLandmarkNorm = norm(landmark)

    const matching = existingAddresses.find((e: any) => {
      const eStreet = norm(e.street)
      const eArea = norm(e.area)
      const eCity = norm(e.city)
      const eDistrict = norm(e.district)
      const eState = norm(e.state)
      const ePincode = norm(e.pincode)
      const eLandmark = norm(e.landmark)

      // Exact field match
      const exactMatch =
        eStreet === incomingStreetNorm &&
        eArea === norm(area) &&
        eCity === incomingCityNorm &&
        eDistrict === incomingDistrictNorm &&
        eState === incomingStateNorm &&
        ePincode === incomingPincodeNorm &&
        eLandmark === incomingLandmarkNorm

      if (exactMatch) return true

      // Fallback matching when street contains full address string
      if (incomingStreetNorm && eStreet && (eStreet === incomingStreetNorm || eStreet.includes(incomingStreetNorm) || incomingStreetNorm.includes(eStreet))) {
        if (!eCity || !incomingCityNorm || eCity === incomingCityNorm) {
          if (!ePincode || !incomingPincodeNorm || ePincode === incomingPincodeNorm) {
            return true
          }
        }
      }

      return false
    })

    if (matching) {
      return { success: true, duplicated: true, data: matching, message: "Address already exists for customer" }
    }

    // Determine if this address should be default
    const isFirstAddress = existingAddresses.length === 0
    const hasDefault = existingAddresses.some((a: any) => a.is_default === true)
    const shouldBeDefault = isFirstAddress || !hasDefault

    const result = await sql`
      INSERT INTO customer_addresses (
        customer_id, phone, city, district, state, pincode, street, area, landmark, address_type, is_default, created_at, updated_at
      ) VALUES (
        ${customerId},
        ${phone},
        ${city},
        ${district},
        ${state},
        ${pincode},
        ${street},
        ${area},
        ${landmark},
        ${address_type},
        ${shouldBeDefault},
        NOW(),
        NOW()
      )
      RETURNING *
    `

    // Update customer top-level summary fields if they are blank or if this is default
    if (shouldBeDefault) {
      const formattedSummary = [street, landmark, city, district, state, pincode ? `PIN: ${pincode}` : null]
        .filter(Boolean)
        .join(", ")

      await sql`
        UPDATE customers
        SET address = COALESCE(NULLIF(address, ''), ${formattedSummary}),
            city = COALESCE(NULLIF(city, ''), ${city}),
            district = COALESCE(NULLIF(district, ''), ${district}),
            state = COALESCE(NULLIF(state, ''), ${state}),
            street = COALESCE(NULLIF(street, ''), ${street}),
            landmark = COALESCE(NULLIF(landmark, ''), ${landmark}),
            pincode = COALESCE(NULLIF(pincode, ''), ${pincode})
        WHERE id = ${customerId}
      `
    }

    return { success: true, duplicated: false, data: result[0], message: "Address synced successfully" }
  } catch (error) {
    console.error("syncCustomerShippingAddress error:", error)
    return { success: false, message: "Failed to sync customer address" }
  }
}
