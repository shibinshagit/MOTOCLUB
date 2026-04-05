"use server"

import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordSaleTransaction } from "./simplified-accounting"
import { initializeServicesSchema } from "./service-actions"

// Add a service sale
export async function addServiceSale(saleData: any) {
  try {
    console.log("Adding service sale with data:", JSON.stringify(saleData, null, 2))

    // Initialize services schema
    await initializeServicesSchema()

    // Start transaction
    await sql`BEGIN`

    try {
      // Calculate totals
      const subtotal = saleData.items.reduce(
        (sum: number, item: any) => sum + Number.parseFloat(item.price) * Number.parseInt(item.quantity),
        0,
      )
      const discountAmount = Number(saleData.discount) || 0
      const total = Math.max(0, subtotal - discountAmount)
      const isCancelled = saleData.paymentStatus?.toLowerCase() === "cancelled"
      const isCredit = saleData.paymentStatus?.toLowerCase() === "credit"

      // Calculate total service costs
      const totalServiceCosts = saleData.items.reduce(
        (sum: number, item: any) => sum + Number.parseFloat(item.serviceCost || 0) * Number.parseInt(item.quantity),
        0,
      )

      // Handle received amount based on status
      let receivedAmount = 0
      if (saleData.paymentStatus?.toLowerCase() === "completed") {
        receivedAmount = total
      } else if (saleData.paymentStatus?.toLowerCase() === "cancelled") {
        receivedAmount = 0
      } else if (isCredit) {
        receivedAmount = Number(saleData.receivedAmount) || 0

        if (receivedAmount > total) {
          await sql`ROLLBACK`
          return {
            success: false,
            message: `Received amount (${receivedAmount}) cannot be greater than total amount (${total})`,
          }
        }
      }

      // Insert the sale
      const saleResult = await sql`
        INSERT INTO sales (
          customer_id, created_by, device_id, total_amount, total_cost,
          status, sale_date, payment_method, discount, received_amount, sale_type
        ) VALUES (
          ${saleData.customerId || null}, ${saleData.userId}, ${saleData.deviceId},
          ${total}, ${totalServiceCosts}, ${saleData.paymentStatus || "Completed"}, 
          ${saleData.saleDate || new Date()}, ${saleData.paymentMethod || "Cash"}, 
          ${discountAmount}, ${receivedAmount}, 'service'
        ) RETURNING *
      `

      const sale = saleResult[0]
      const saleId = sale.id

      // Insert service items with staff and costs
      const serviceItems = []
      for (const item of saleData.items) {
        const itemResult = await sql`
          INSERT INTO service_items (
            sale_id, service_id, quantity, price, notes, staff_id, 
            service_cost, include_cost_in_invoice
          )
          VALUES (
            ${saleId}, ${item.serviceId}, ${item.quantity}, ${item.price}, 
            ${item.notes || null}, ${saleData.staffId}, 
            ${item.serviceCost || 0}, ${item.includeCostInInvoice || false}
          )
          RETURNING *, (SELECT name FROM services WHERE id = ${item.serviceId}) as service_name
        `

        serviceItems.push(itemResult[0])
      }

      // Record accounting transaction
      try {
        const accountingResult = await recordSaleTransaction({
          saleId,
          totalAmount: total,
          cogsAmount: totalServiceCosts, // Service costs as COGS
          receivedAmount,
          outstandingAmount: total - receivedAmount,
          status: saleData.paymentStatus || "Completed",
          paymentMethod: saleData.paymentMethod || "Cash",
          deviceId: saleData.deviceId,
          userId: saleData.userId,
          customerId: saleData.customerId,
          saleDate: new Date(saleData.saleDate || new Date()),
        })

        if (!accountingResult.success) {
          console.error("Failed to record accounting transaction:", accountingResult.error)
        }
      } catch (accountingError) {
        console.error("Error recording accounting transaction:", accountingError)
      }

      // Commit transaction
      await sql`COMMIT`
      revalidatePath("/dashboard")

      return {
        success: true,
        message: "Service sale added successfully",
        data: {
          sale: { ...sale, discount: discountAmount, received_amount: receivedAmount },
          items: serviceItems,
        },
      }
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Database query error:", error)
    return {
      success: false,
      message: `Database error: ${error.message}. Please try again later.`,
    }
  }
}
