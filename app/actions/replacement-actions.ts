"use server"

import { sql, resetConnectionState } from "@/lib/db"
import {
  REPLACEMENT_REASONS,
  type ReplacementReason,
  type ReplacementItemInput,
  type CreateReplacementInput,
} from "@/lib/replacement-types"

export type { ReplacementReason, ReplacementItemInput, CreateReplacementInput }

export async function getNextReplacementNumber(queryClient: any = sql): Promise<string> {
  const result = await queryClient`
    SELECT COUNT(*)::int as count FROM replacement_shipments
  `
  const nextNum = (Number(result[0]?.count) || 0) + 1
  return `RS-${String(nextNum).padStart(4, "0")}`
}

export async function getReplacementShipmentsForSale(saleId: number) {
  if (!saleId) {
    return { success: false, message: "Sale ID is required", data: [] }
  }

  try {
    const shipments = await sql`
      SELECT 
        rs.*,
        md.name as courier_partner_name,
        md.tracking_url_template as tracking_url_template,
        st.name as created_by_name
      FROM replacement_shipments rs
      LEFT JOIN master_data md ON md.id = rs.courier_partner_id
      LEFT JOIN staff st ON st.id = rs.created_by
      WHERE rs.sale_id = ${saleId}
      ORDER BY rs.created_at DESC, rs.id DESC
    `

    if (!shipments.length) {
      return { success: true, data: [] }
    }

    const shipmentIds = shipments.map((s: any) => s.id)

    const items = await sql`
      SELECT 
        rsi.*,
        p.name as product_name,
        pv.name as variant_name,
        pb.batch_no as batch_number
      FROM replacement_shipment_items rsi
      LEFT JOIN products p ON rsi.product_id = p.id
      LEFT JOIN product_variants pv ON rsi.product_variant_id = pv.id
      LEFT JOIN product_batches pb ON rsi.batch_id = pb.id
      WHERE rsi.replacement_shipment_id = ANY(${shipmentIds})
      ORDER BY rsi.id ASC
    `

    const itemsMap: Record<number, any[]> = {}
    for (const item of items) {
      if (!itemsMap[item.replacement_shipment_id]) {
        itemsMap[item.replacement_shipment_id] = []
      }
      itemsMap[item.replacement_shipment_id].push(item)
    }

    const result = shipments.map((s: any) => ({
      ...s,
      items: itemsMap[s.id] || [],
    }))

    return { success: true, data: result }
  } catch (error: any) {
    console.error("Error fetching replacement shipments:", error)
    return { success: false, message: error?.message || "Failed to fetch replacement shipments", data: [] }
  }
}

export async function createReplacementShipment(input: CreateReplacementInput) {
  if (!input.saleId) {
    return { success: false, message: "Original Sale ID is required." }
  }

  if (!input.reason?.trim()) {
    return { success: false, message: "Replacement reason is required." }
  }

  const validItems = (input.items || []).filter((item) => Number(item.quantity) > 0)
  if (!validItems.length) {
    return { success: false, message: "At least one item with a quantity greater than zero is required." }
  }

  resetConnectionState()

  try {
    const outcome = await sql.begin(async (tx: any) => {
      // 1. Fetch & lock original sale
      const saleRows = await tx`
        SELECT s.*, c.name as customer_name, c.phone as customer_phone
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.id = ${input.saleId}
        FOR UPDATE OF s
      `

      if (!saleRows.length) {
        throw new Error(`Original Sale #${input.saleId} not found.`)
      }

      const originalSale = saleRows[0]
      const effectiveDeviceId = input.deviceId || originalSale.device_id || 1
      const effectiveStaffId = input.staffId || originalSale.staff_id || null

      // 2. Fetch original sale items for validation
      const saleItemsRows = await tx`
        SELECT si.*, p.name as product_name, p.is_batch_managed, p.has_variants
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ${input.saleId}
        FOR UPDATE OF si
      `

      const saleItemsMap = new Map<number, any>()
      for (const item of saleItemsRows) {
        saleItemsMap.set(item.id, item)
      }

      // 3. Fetch existing active replacement shipment items to check remaining eligible quantities
      const existingReplacedRows = await tx`
        SELECT rsi.sale_item_id, SUM(rsi.quantity)::int as total_replaced
        FROM replacement_shipment_items rsi
        JOIN replacement_shipments rs ON rsi.replacement_shipment_id = rs.id
        WHERE rs.sale_id = ${input.saleId} AND rs.status != 'Cancelled'
        GROUP BY rsi.sale_item_id
      `

      const replacedQtyMap = new Map<number, number>()
      for (const row of existingReplacedRows) {
        if (row.sale_item_id) {
          replacedQtyMap.set(row.sale_item_id, Number(row.total_replaced) || 0)
        }
      }

      // 4. Validate items & stock availability, then apply inventory movements
      const itemsToInsert: Array<{
        saleItemId: number | null
        productId: number
        productVariantId: number | null
        batchId: number | null
        quantity: number
      }> = []

      for (const itemInput of validItems) {
        let saleItem = itemInput.saleItemId ? saleItemsMap.get(itemInput.saleItemId) : null
        let productName = "Product"

        if (saleItem) {
          if (saleItem.product_id !== itemInput.productId) {
            throw new Error(`Product mismatch for item #${itemInput.saleItemId}.`)
          }

          productName = saleItem.product_name || "Product"
          const originalQty = Number(saleItem.quantity) || 0
          const prevReplaced = replacedQtyMap.get(saleItem.id) || 0
          const maxEligible = Math.max(0, originalQty - prevReplaced)

          if (itemInput.quantity > maxEligible) {
            throw new Error(
              `Requested replacement quantity (${itemInput.quantity}) for "${productName}" exceeds remaining eligible quantity (${maxEligible}).`
            )
          }
        } else {
          // Additional product selected from catalog
          const prodRows = await tx`SELECT id, name FROM products WHERE id = ${itemInput.productId} LIMIT 1`
          if (!prodRows.length) {
            throw new Error(`Selected product #${itemInput.productId} not found in catalog.`)
          }
          productName = prodRows[0].name || "Catalog Product"
        }

        const variantId = itemInput.productVariantId ?? (saleItem ? saleItem.product_variant_id : null) ?? null
        let batchId = itemInput.batchId ?? (saleItem ? saleItem.batch_id : null) ?? null

        // If batch not explicitly passed, find first available batch for product/variant
        if (!batchId) {
          let batchRows
          if (variantId) {
            batchRows = await tx`
              SELECT pb.id, COALESCE(pbds.stock, 0) as stock
              FROM product_batches pb
              JOIN product_variants pv ON pv.id = pb.product_variant_id
              LEFT JOIN product_batch_device_stock pbds ON pbds.batch_id = pb.id AND pbds.device_id = ${effectiveDeviceId}
              WHERE pv.product_id = ${itemInput.productId} AND pb.product_variant_id = ${variantId}
                AND COALESCE(pbds.stock, 0) >= ${itemInput.quantity}
              ORDER BY pb.created_at ASC LIMIT 1
            `
          } else {
            batchRows = await tx`
              SELECT pb.id, COALESCE(pbds.stock, 0) as stock
              FROM product_batches pb
              JOIN product_variants pv ON pv.id = pb.product_variant_id
              LEFT JOIN product_batch_device_stock pbds ON pbds.batch_id = pb.id AND pbds.device_id = ${effectiveDeviceId}
              WHERE pv.product_id = ${itemInput.productId}
                AND COALESCE(pbds.stock, 0) >= ${itemInput.quantity}
              ORDER BY pb.created_at ASC LIMIT 1
            `
          }
          if (batchRows.length > 0) {
            batchId = batchRows[0].id
          }
        }

        // Validate & deduct stock atomically
        if (batchId) {
          const batchStockRows = await tx`
            SELECT id, stock FROM product_batch_device_stock
            WHERE batch_id = ${batchId} AND device_id = ${effectiveDeviceId}
            FOR UPDATE
          `
          const availStock = batchStockRows.length > 0 ? Number(batchStockRows[0].stock || 0) : 0
          if (availStock < itemInput.quantity) {
            throw new Error(
              `Insufficient stock for "${productName}". Requested: ${itemInput.quantity}, Available: ${availStock}.`
            )
          }

          const nextStock = availStock - itemInput.quantity
          await tx`
            UPDATE product_batch_device_stock
            SET stock = ${nextStock}, updated_at = NOW()
            WHERE id = ${batchStockRows[0].id}
          `
        } else {
          const legacyStockRows = await tx`
            SELECT id, stock FROM product_device_stock
            WHERE product_id = ${itemInput.productId} AND device_id = ${effectiveDeviceId}
            FOR UPDATE
          `
          const availStock = legacyStockRows.length > 0 ? Number(legacyStockRows[0].stock || 0) : 0
          if (availStock < itemInput.quantity) {
            throw new Error(
              `Insufficient stock for "${productName}". Requested: ${itemInput.quantity}, Available: ${availStock}.`
            )
          }

          const nextStock = availStock - itemInput.quantity
          await tx`
            UPDATE product_device_stock
            SET stock = ${nextStock}, updated_at = NOW()
            WHERE id = ${legacyStockRows[0].id}
          `
        }

        itemsToInsert.push({
          saleItemId: saleItem ? saleItem.id : null,
          productId: itemInput.productId,
          productVariantId: variantId,
          batchId: batchId,
          quantity: itemInput.quantity,
        })
      }

      // 5. Generate replacement number sequence
      let replacementNumber = await getNextReplacementNumber(tx)

      // Ensure uniqueness
      let attempts = 0
      while (attempts < 10) {
        const dup = await tx`SELECT id FROM replacement_shipments WHERE replacement_number = ${replacementNumber} LIMIT 1`
        if (dup.length === 0) break
        attempts++
        const countRes = await tx`SELECT COUNT(*)::int as count FROM replacement_shipments`
        replacementNumber = `RS-${String(Number(countRes[0]?.count || 0) + 1 + attempts).padStart(4, "0")}`
      }

      const initialStatus = input.trackingId?.trim() ? "Shipping" : "Pending"
      const shippingDateVal = input.shippingDate ? new Date(input.shippingDate) : (initialStatus === "Shipping" ? new Date() : null)

      // 6. Insert replacement_shipments record
      const insertedShipment = await tx`
        INSERT INTO replacement_shipments (
          replacement_number,
          sale_id,
          customer_id,
          device_id,
          reason,
          status,
          fulfillment_type,
          courier_partner_id,
          courier_service_id,
          courier_service_name,
          tracking_id,
          shipping_date,
          shipped_at,
          shipping_address,
          shipping_city,
          shipping_street,
          shipping_landmark,
          shipping_address_type,
          shipping_pincode,
          notes,
          created_by
        ) VALUES (
          ${replacementNumber},
          ${input.saleId},
          ${originalSale.customer_id || null},
          ${effectiveDeviceId},
          ${input.reason.trim()},
          ${initialStatus},
          ${input.fulfillmentType || "ship"},
          ${input.courierPartnerId || null},
          ${input.courierServiceId || null},
          ${input.courierServiceName?.trim() || null},
          ${input.trackingId?.trim() || null},
          ${shippingDateVal},
          ${initialStatus === "Shipping" ? new Date() : null},
          ${input.shippingAddress?.trim() || originalSale.shipping_address || null},
          ${input.shippingCity?.trim() || null},
          ${input.shippingStreet?.trim() || null},
          ${input.shippingLandmark?.trim() || null},
          ${input.shippingAddressType?.trim() || null},
          ${input.shippingPincode?.trim() || null},
          ${input.notes?.trim() || null},
          ${effectiveStaffId}
        )
        RETURNING *
      `

      const replacementShipment = insertedShipment[0]

      // 7. Insert items & log stock history
      for (const item of itemsToInsert) {
        await tx`
          INSERT INTO replacement_shipment_items (
            replacement_shipment_id,
            sale_item_id,
            product_id,
            product_variant_id,
            batch_id,
            quantity
          ) VALUES (
            ${replacementShipment.id},
            ${item.saleItemId},
            ${item.productId},
            ${item.productVariantId},
            ${item.batchId},
            ${item.quantity}
          )
        `

        // Record stock history
        await tx`
          INSERT INTO product_stock_history (
            product_id,
            product_variant_id,
            batch_id,
            quantity,
            type,
            reference_id,
            reference_type,
            notes,
            created_by,
            device_id
          ) VALUES (
            ${item.productId},
            ${item.productVariantId},
            ${item.batchId},
            ${-Math.abs(item.quantity)},
            'Replacement Shipment',
            ${replacementShipment.id},
            'replacement_shipment',
            ${`Replacement ${replacementNumber} for Original Sale #${input.saleId} (${input.reason.trim()})`},
            ${effectiveStaffId},
            ${effectiveDeviceId}
          )
        `
      }

      return {
        replacementShipment,
        originalSale,
      }
    })

    return {
      success: true,
      message: `Replacement shipment ${outcome.replacementShipment.replacement_number} created successfully.`,
      data: outcome.replacementShipment,
    }
  } catch (error: any) {
    console.error("Error creating replacement shipment:", error)
    return {
      success: false,
      message: error?.message || "Failed to create replacement shipment.",
    }
  }
}

export async function updateReplacementShipmentStatus(input: {
  replacementId: number
  deliveryStatus: string
  trackingId?: string | null
  courierPartnerId?: number | null
  courierServiceId?: number | null
  courierServiceName?: string | null
  shippingDate?: string | null
  notes?: string | null
}) {
  if (!input.replacementId) {
    return { success: false, message: "Replacement Shipment ID is required." }
  }

  try {
    const existing = await sql`
      SELECT * FROM replacement_shipments WHERE id = ${input.replacementId} LIMIT 1
    `
    if (!existing.length) {
      return { success: false, message: "Replacement shipment not found." }
    }

    const current = existing[0]
    const newStatus = (input.deliveryStatus || current.status || "Pending").trim()
    const cleanTracking = input.trackingId !== undefined ? (input.trackingId?.trim() || null) : current.tracking_id

    const isNewShipping =
      (newStatus === "Shipping" || newStatus === "Shipped" || newStatus === "In transit") &&
      !current.shipped_at

    const isDelivered = newStatus === "Delivered" && !current.delivered_at

    const targetShippingDate = input.shippingDate
      ? new Date(input.shippingDate)
      : isNewShipping && !current.shipping_date
      ? new Date()
      : current.shipping_date

    const targetShippedAt = isNewShipping ? new Date() : current.shipped_at
    const targetDeliveredAt = isDelivered ? new Date() : current.delivered_at

    const updated = await sql`
      UPDATE replacement_shipments
      SET status = ${newStatus},
          tracking_id = ${cleanTracking},
          courier_partner_id = ${input.courierPartnerId !== undefined ? input.courierPartnerId : current.courier_partner_id},
          courier_service_id = ${input.courierServiceId !== undefined ? input.courierServiceId : current.courier_service_id},
          courier_service_name = ${input.courierServiceName !== undefined ? input.courierServiceName?.trim() || null : current.courier_service_name},
          shipping_date = ${targetShippingDate},
          shipped_at = ${targetShippedAt},
          delivered_at = ${targetDeliveredAt},
          notes = ${input.notes !== undefined ? input.notes?.trim() || null : current.notes},
          updated_at = NOW()
      WHERE id = ${input.replacementId}
      RETURNING *
    `

    return {
      success: true,
      message: "Replacement shipment details updated successfully.",
      data: updated[0],
    }
  } catch (error: any) {
    console.error("Error updating replacement shipment:", error)
    return { success: false, message: error?.message || "Failed to update replacement shipment." }
  }
}

export async function cancelReplacementShipment(replacementId: number, staffId?: number) {
  if (!replacementId) {
    return { success: false, message: "Replacement Shipment ID is required." }
  }

  resetConnectionState()

  try {
    await sql.begin(async (tx: any) => {
      const rsRows = await tx`
        SELECT * FROM replacement_shipments WHERE id = ${replacementId} FOR UPDATE
      `
      if (!rsRows.length) {
        throw new Error("Replacement shipment not found.")
      }

      const rs = rsRows[0]
      if (rs.status === "Cancelled") {
        throw new Error("Replacement shipment is already cancelled.")
      }

      // Fetch items to restore stock
      const items = await tx`
        SELECT * FROM replacement_shipment_items WHERE replacement_shipment_id = ${replacementId}
      `

      for (const item of items) {
        const qty = Number(item.quantity) || 0
        if (qty <= 0) continue

        if (item.batch_id) {
          await tx`
            UPDATE product_batch_device_stock
            SET stock = stock + ${qty}, updated_at = NOW()
            WHERE batch_id = ${item.batch_id} AND device_id = ${rs.device_id}
          `
        } else {
          await tx`
            UPDATE product_device_stock
            SET stock = stock + ${qty}, updated_at = NOW()
            WHERE product_id = ${item.product_id} AND device_id = ${rs.device_id}
          `
        }

        // Log stock restore
        await tx`
          INSERT INTO product_stock_history (
            product_id,
            product_variant_id,
            batch_id,
            quantity,
            type,
            reference_id,
            reference_type,
            notes,
            created_by,
            device_id
          ) VALUES (
            ${item.product_id},
            ${item.product_variant_id},
            ${item.batch_id},
            ${qty},
            'Replacement Cancellation',
            ${replacementId},
            'replacement_shipment_cancellation',
            ${`Restored stock for cancelled Replacement ${rs.replacement_number}`},
            ${staffId || null},
            ${rs.device_id}
          )
        `
      }

      await tx`
        UPDATE replacement_shipments
        SET status = 'Cancelled', updated_at = NOW()
        WHERE id = ${replacementId}
      `
    })

    return { success: true, message: "Replacement shipment cancelled and inventory restored." }
  } catch (error: any) {
    console.error("Error cancelling replacement shipment:", error)
    return { success: false, message: error?.message || "Failed to cancel replacement shipment." }
  }
}
