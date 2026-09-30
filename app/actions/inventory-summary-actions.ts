"use server"

import { sql } from "@/lib/db"
import { resolveAuthorizedDeviceId } from "@/lib/device-access"
import { resolveStaffSessionContext } from "@/lib/staff-restrictions-server"
import { isStaffValueHidden } from "@/lib/staff-restrictions"

export interface InventoryValuationSummary {
  totalProductsInStock: number
  totalStockUnits: number | null
  inventoryCostValue: number | null
  purchaseInvoiceValue: number | null
  currentRetailValue: number | null
  /** Units whose value falls back to cost because no purchase record backs them. */
  unitsWithoutPurchaseRecord: number | null
}

/**
 * Current-stock valuation for one device, computed in a single aggregate query.
 *
 * Stock: per product, batch stock (product_batch_device_stock) when the product has any batch
 *   row on the device, otherwise legacy product_device_stock. Same rule as getDeviceProductStock
 *   and the inventory list, so parent stock is never added on top of batch stock.
 * Inventory cost: batch stock x product_batches.cost_price (unit acquisition cost, which already
 *   includes purchase tax and allocated courier less discount); legacy stock x products.wholesale_price
 *   (the COGS fallback cost).
 * Purchase invoice value: batch stock x the unit share of the purchase grand total (line subtotal +
 *   tax + allocated courier - allocated discount, allocated by pre-tax line value as in
 *   allocatePurchaseCosts). Stock with no purchase record falls back to its cost.
 * Retail: variant MRP (else price) for batch stock, product MRP (else price) otherwise.
 * Negative stock is kept as-is (netting into units and values), matching existing behaviour.
 */
export async function getInventoryValuationSummary(
  requestedDeviceId: number,
): Promise<{ success: boolean; data?: InventoryValuationSummary; message?: string }> {
  try {
    const deviceId = await resolveAuthorizedDeviceId(Number(requestedDeviceId))
    if (!deviceId) return { success: false, message: "Unauthorized" }

    const rows = await sql`
      WITH item_calc AS (
        SELECT
          pi.id AS item_id,
          pi.batch_id,
          (
            pi.quantity * pi.price
            + COALESCE(pi.tax_amount, 0)
            + COALESCE(pu.courier_charge, 0) * (pi.quantity * pi.price) / NULLIF(SUM(pi.quantity * pi.price) OVER (PARTITION BY pi.purchase_id), 0)
            - COALESCE(pu.discount, 0) * (pi.quantity * pi.price) / NULLIF(SUM(pi.quantity * pi.price) OVER (PARTITION BY pi.purchase_id), 0)
          ) / NULLIF(pi.quantity, 0) AS unit_invoice
        FROM purchase_items pi
        JOIN purchases pu ON pu.id = pi.purchase_id
        WHERE pi.quantity > 0
      ),
      batch_invoice AS (
        SELECT DISTINCT ON (pb.id) pb.id AS batch_id, ic.unit_invoice
        FROM product_batches pb
        JOIN item_calc ic ON ic.batch_id = pb.id OR ic.item_id = pb.purchase_item_id
        ORDER BY pb.id, (ic.batch_id = pb.id) DESC
      ),
      company_products AS (
        SELECT p.id, p.wholesale_price, p.mrp, p.price
        FROM products p
        WHERE p.created_by IN (
          SELECT d2.id FROM devices d1 JOIN devices d2 ON d2.company_id = d1.company_id WHERE d1.id = ${deviceId}
        )
      ),
      batch_rows AS (
        SELECT
          pv.product_id,
          pbds.stock::numeric AS stock,
          COALESCE(pb.cost_price, 0) AS unit_cost,
          COALESCE(bi.unit_invoice, pb.cost_price, 0) AS unit_invoice,
          (bi.unit_invoice IS NULL) AS no_purchase,
          COALESCE(NULLIF(pv.mrp, 0), pv.price, 0) AS unit_retail
        FROM product_batch_device_stock pbds
        JOIN product_batches pb ON pb.id = pbds.batch_id
        JOIN product_variants pv ON pv.id = pb.product_variant_id
        LEFT JOIN batch_invoice bi ON bi.batch_id = pb.id
        WHERE pbds.device_id = ${deviceId}
      ),
      legacy_rows AS (
        SELECT
          pds.product_id,
          pds.stock::numeric AS stock,
          COALESCE(cp.wholesale_price, 0) AS unit_cost,
          COALESCE(cp.wholesale_price, 0) AS unit_invoice,
          true AS no_purchase,
          COALESCE(NULLIF(cp.mrp, 0), cp.price, 0) AS unit_retail
        FROM product_device_stock pds
        JOIN company_products cp ON cp.id = pds.product_id
        WHERE pds.device_id = ${deviceId}
          AND NOT EXISTS (SELECT 1 FROM batch_rows br WHERE br.product_id = pds.product_id)
      ),
      all_rows AS (
        SELECT br.* FROM batch_rows br JOIN company_products cp ON cp.id = br.product_id
        UNION ALL
        SELECT * FROM legacy_rows
      ),
      per_product AS (
        SELECT product_id, SUM(stock) AS stock FROM all_rows GROUP BY product_id
      )
      SELECT
        (SELECT COUNT(*) FROM per_product WHERE stock > 0)::int AS products_in_stock,
        COALESCE(SUM(stock), 0) AS units,
        COALESCE(SUM(stock * unit_cost), 0) AS cost_value,
        COALESCE(SUM(stock * unit_invoice), 0) AS invoice_value,
        COALESCE(SUM(stock * unit_retail), 0) AS retail_value,
        COALESCE(SUM(stock) FILTER (WHERE no_purchase), 0) AS units_no_purchase
      FROM all_rows
    `

    const row = rows[0] || {}
    const staff = await resolveStaffSessionContext(deviceId)
    const hideCogs = isStaffValueHidden(staff, "cogs")
    const hideStock = isStaffValueHidden(staff, "stock_count")
    const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100

    return {
      success: true,
      data: {
        totalProductsInStock: hideStock ? 0 : Number(row.products_in_stock || 0),
        totalStockUnits: hideStock ? null : Number(row.units || 0),
        inventoryCostValue: hideCogs ? null : money(row.cost_value),
        purchaseInvoiceValue: hideCogs ? null : money(row.invoice_value),
        currentRetailValue: money(row.retail_value),
        unitsWithoutPurchaseRecord: hideCogs ? null : Number(row.units_no_purchase || 0),
      },
    }
  } catch (error) {
    console.error("getInventoryValuationSummary error:", error)
    return { success: false, message: "Failed to load inventory summary" }
  }
}
