/**
 * Hybrid & Semantic Product Search Engine
 * Matches products based on:
 * - Product Names & Variant Names
 * - Category Names & Company / Brand Names
 * - Prices (Selling Price, MSP, Cost Price, Variant Prices)
 * - Descriptions, Notes, Specifications, Shelf / Warehouse Location
 * - Barcodes, SKUs, HSN codes, IDs
 * - Multi-token semantic matching (every token in search query must match at least one attribute)
 */

export function matchProductSemantic(product: any, query: string): boolean {
  if (!query || !query.trim()) return true

  const normalizedQuery = query.toLowerCase().trim()
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  if (tokens.length === 0) return true

  // 1. Build comprehensive text & numeric corpus for this product
  const corpusParts: string[] = []

  // Names & Brand
  if (product.name) corpusParts.push(String(product.name).toLowerCase())
  if (product.title) corpusParts.push(String(product.title).toLowerCase())
  if (product.company_name) corpusParts.push(String(product.company_name).toLowerCase())
  if (product.brand) corpusParts.push(String(product.brand).toLowerCase())

  // Category
  if (product.category) corpusParts.push(String(product.category).toLowerCase())
  if (product.category_name) corpusParts.push(String(product.category_name).toLowerCase())

  // Codes, Warehouse & Locations
  if (product.id != null) corpusParts.push(String(product.id))
  if (product.barcode) corpusParts.push(String(product.barcode).toLowerCase())
  if (product.sku) corpusParts.push(String(product.sku).toLowerCase())
  if (product.hsn_code) corpusParts.push(String(product.hsn_code).toLowerCase())
  if (product.shelf) corpusParts.push(String(product.shelf).toLowerCase())
  if (product.warehouse) corpusParts.push(String(product.warehouse).toLowerCase())
  if (product.warehouse_name) corpusParts.push(String(product.warehouse_name).toLowerCase())
  if (product.branch_name) corpusParts.push(String(product.branch_name).toLowerCase())
  if (product.location) corpusParts.push(String(product.location).toLowerCase())
  if (product.location_name) corpusParts.push(String(product.location_name).toLowerCase())
  if (product.device_name) corpusParts.push(String(product.device_name).toLowerCase())

  // Stock Status
  if (product.stock === null) {
    corpusParts.push("hidden")
  } else if (typeof product.stock === "number") {
    if (product.stock <= 0) {
      corpusParts.push("out of stock", "out", "oos")
    } else if (product.stock <= 5) {
      corpusParts.push("low stock", "low", "warning")
    } else {
      corpusParts.push("in stock", "in", "available", "ok")
    }
  }
  if (product.status) corpusParts.push(String(product.status).toLowerCase())
  if (product.stock_status) corpusParts.push(String(product.stock_status).toLowerCase())

  // Description & Notes
  if (product.description) corpusParts.push(String(product.description).toLowerCase())
  if (product.notes) corpusParts.push(String(product.notes).toLowerCase())
  if (product.details) corpusParts.push(String(product.details).toLowerCase())

  // Prices (Selling Price, MSP, Cost)
  const prices: (number | string)[] = []
  if (product.price != null) prices.push(product.price)
  if (product.selling_price != null) prices.push(product.selling_price)
  if (product.retail_price != null) prices.push(product.retail_price)
  if (product.msp != null) prices.push(product.msp)
  if (product.min_selling_price != null) prices.push(product.min_selling_price)
  if (product.cost != null) prices.push(product.cost)
  if (product.cost_price != null) prices.push(product.cost_price)

  for (const pr of prices) {
    const num = Number(pr)
    if (!isNaN(num)) {
      corpusParts.push(String(num))
      corpusParts.push(num.toFixed(2)) // e.g. "788.00"
      corpusParts.push(String(Math.floor(num))) // e.g. "788"
    }
  }

  // Variants (Variant names, prices, barcodes, SKUs)
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (v.name) corpusParts.push(String(v.name).toLowerCase())
      if (v.sku) corpusParts.push(String(v.sku).toLowerCase())
      if (v.barcode) corpusParts.push(String(v.barcode).toLowerCase())
      if (v.price != null) {
        const vPrice = Number(v.price)
        if (!isNaN(vPrice)) {
          corpusParts.push(String(vPrice))
          corpusParts.push(vPrice.toFixed(2))
          corpusParts.push(String(Math.floor(vPrice)))
        }
      }
      if (v.cost_price != null) {
        const vCost = Number(v.cost_price)
        if (!isNaN(vCost)) {
          corpusParts.push(String(vCost))
          corpusParts.push(vCost.toFixed(2))
        }
      }
    }
  }

  // Combine full text corpus
  const fullText = corpusParts.join(" ")

  // 2. Multi-token Semantic Match Rule:
  // Every token in the query MUST match somewhere in the product corpus
  return tokens.every((token) => fullText.includes(token))
}

/**
 * Filter & Sort products using Hybrid Semantic Search
 */
export function filterProductsSemantic(products: any[], query: string): any[] {
  if (!query || !query.trim()) return products

  const matched = products.filter((p) => matchProductSemantic(p, query))
  const normalizedQuery = query.toLowerCase().trim()

  // Score relevance so exact/name matches appear first
  return matched.sort((a, b) => {
    const aName = (a.name || a.title || "").toLowerCase()
    const bName = (b.name || b.title || "").toLowerCase()

    const aExact = aName === normalizedQuery ? 2 : aName.startsWith(normalizedQuery) ? 1 : 0
    const bExact = bName === normalizedQuery ? 2 : bName.startsWith(normalizedQuery) ? 1 : 0

    return bExact - aExact
  })
}
