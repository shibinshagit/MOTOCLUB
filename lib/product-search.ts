/**
 * Hybrid & Semantic Product Search Engine
 * Matches products based on:
 * - Product Names & Variant Names
 * - Category Names & Company / Brand Names
 * - Prices (Selling Price, MSP, Cost Price, Variant Prices)
 * - Descriptions, Notes, Specifications, Shelf / Warehouse Location, Suitable For
 * - Barcodes, SKUs, HSN codes, IDs, Batch Numbers
 * - Multi-token semantic matching with Levenshtein typo tolerance
 * - Relevance ranking hierarchy & stock-priority preservation
 */

/**
 * Fast Levenshtein distance implementation for short strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  const aLen = a.length
  const bLen = b.length
  if (aLen === 0) return bLen
  if (bLen === 0) return aLen
  if (Math.abs(aLen - bLen) > 3) return Math.max(aLen, bLen)

  // Distance matrix supporting adjacent character transposition (Damerau-Levenshtein)
  const d: number[][] = []
  for (let i = 0; i <= aLen; i++) {
    d[i] = [i]
  }
  for (let j = 0; j <= bLen; j++) {
    d[0][j] = j
  }

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      // Transposition (e.g. 'ri' <-> 'ir' in 'variant' <-> 'vairant')
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }

  return d[aLen][bLen]
}

/**
 * Checks if a query token matches a candidate word:
 * 1. Exact match
 * 2. Prefix match
 * 3. Substring match
 * 4. Minor typo tolerance (distance <= 1 for len >= 4, distance <= 2 for len >= 6)
 */
function isTokenMatch(candidateWord: string, token: string): boolean {
  if (!candidateWord || !token) return false
  if (candidateWord === token) return true
  if (candidateWord.startsWith(token)) return true
  if (candidateWord.includes(token)) return true

  const tokLen = token.length
  const candLen = candidateWord.length

  // Only allow typo tolerance for tokens with at least 4 characters to avoid false positives
  if (tokLen >= 4 && Math.abs(candLen - tokLen) <= 2) {
    const dist = levenshteinDistance(candidateWord, token)
    if (dist <= 1) return true
    if (tokLen >= 6 && dist <= 2) return true
  }

  return false
}

interface ProductCorpus {
  productNames: string[]
  companyNames: string[]
  categoryNames: string[]
  codeFields: string[]
  variantFields: string[]
  batchFields: string[]
  otherFields: string[]
  allWords: string[]
  fullText: string
  normalizedJoined: string
}

export function extractProductCorpus(product: any): ProductCorpus {
  const productNames: string[] = []
  const companyNames: string[] = []
  const categoryNames: string[] = []
  const codeFields: string[] = []
  const variantFields: string[] = []
  const batchFields: string[] = []
  const otherFields: string[] = []

  // Names
  if (product.name) productNames.push(String(product.name).toLowerCase())
  if (product.title) productNames.push(String(product.title).toLowerCase())

  // Company / Brand
  if (product.company_name) companyNames.push(String(product.company_name).toLowerCase())
  if (product.brand) companyNames.push(String(product.brand).toLowerCase())

  // Category
  if (product.category) categoryNames.push(String(product.category).toLowerCase())
  if (product.category_name) categoryNames.push(String(product.category_name).toLowerCase())

  // Codes & IDs
  if (product.id != null) codeFields.push(String(product.id))
  if (product.barcode) codeFields.push(String(product.barcode).toLowerCase())
  if (product.sku) codeFields.push(String(product.sku).toLowerCase())
  if (product.product_code) codeFields.push(String(product.product_code).toLowerCase())
  if (product.hsn_code) codeFields.push(String(product.hsn_code).toLowerCase())

  // Locations & shelf
  if (product.shelf) otherFields.push(String(product.shelf).toLowerCase())
  if (product.warehouse) otherFields.push(String(product.warehouse).toLowerCase())
  if (product.warehouse_name) otherFields.push(String(product.warehouse_name).toLowerCase())
  if (product.branch_name) otherFields.push(String(product.branch_name).toLowerCase())
  if (product.location) otherFields.push(String(product.location).toLowerCase())
  if (product.location_name) otherFields.push(String(product.location_name).toLowerCase())
  if (product.device_name) otherFields.push(String(product.device_name).toLowerCase())

  // Descriptions & specifications
  if (product.description) otherFields.push(String(product.description).toLowerCase())
  if (product.notes) otherFields.push(String(product.notes).toLowerCase())
  if (product.details) otherFields.push(String(product.details).toLowerCase())
  if (product.suitable_for) otherFields.push(String(product.suitable_for).toLowerCase())
  if (product.color) otherFields.push(String(product.color).toLowerCase())
  if (product.size) otherFields.push(String(product.size).toLowerCase())

  // Stock status aliases
  if (product.stock === null) {
    otherFields.push("hidden")
  } else if (typeof product.stock === "number") {
    if (product.stock <= 0) {
      otherFields.push("out of stock", "out", "oos")
    } else if (product.stock <= 5) {
      otherFields.push("low stock", "low", "warning")
    } else {
      otherFields.push("in stock", "in", "available", "ok")
    }
  }
  if (product.status) otherFields.push(String(product.status).toLowerCase())
  if (product.stock_status) otherFields.push(String(product.stock_status).toLowerCase())

  // Prices
  const prices: (number | string)[] = []
  if (product.price != null) prices.push(product.price)
  if (product.selling_price != null) prices.push(product.selling_price)
  if (product.retail_price != null) prices.push(product.retail_price)
  if (product.mrp != null) prices.push(product.mrp)
  if (product.msp != null) prices.push(product.msp)
  if (product.min_selling_price != null) prices.push(product.min_selling_price)
  if (product.wholesale_price != null) prices.push(product.wholesale_price)
  if (product.cost != null) prices.push(product.cost)
  if (product.cost_price != null) prices.push(product.cost_price)

  for (const pr of prices) {
    const num = Number(pr)
    if (!isNaN(num)) {
      otherFields.push(String(num))
      otherFields.push(num.toFixed(2))
      otherFields.push(String(Math.floor(num)))
    }
  }

  // Variants & Variant Batches
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (v.name) variantFields.push(String(v.name).toLowerCase())
      if (v.variant_name) variantFields.push(String(v.variant_name).toLowerCase())
      if (v.sku) variantFields.push(String(v.sku).toLowerCase())
      if (v.barcode) variantFields.push(String(v.barcode).toLowerCase())
      if (v.shelf) otherFields.push(String(v.shelf).toLowerCase())

      if (v.price != null) {
        const vPrice = Number(v.price)
        if (!isNaN(vPrice)) {
          otherFields.push(String(vPrice), vPrice.toFixed(2), String(Math.floor(vPrice)))
        }
      }

      if (Array.isArray(v.batches)) {
        for (const b of v.batches) {
          if (b.batch_no) batchFields.push(String(b.batch_no).toLowerCase())
          if (b.supplier_name) otherFields.push(String(b.supplier_name).toLowerCase())
        }
      }
    }
  }

  // Standalone Batches if present directly
  if (Array.isArray(product.batches)) {
    for (const b of product.batches) {
      if (b.batch_no) batchFields.push(String(b.batch_no).toLowerCase())
      if (b.supplier_name) otherFields.push(String(b.supplier_name).toLowerCase())
    }
  }

  const allSections = [
    ...productNames,
    ...companyNames,
    ...categoryNames,
    ...codeFields,
    ...variantFields,
    ...batchFields,
    ...otherFields,
  ]

  const fullText = allSections.join(" ")
  const allWords = Array.from(new Set(fullText.split(/\s+/).filter(Boolean)))
  const normalizedJoined = fullText.replace(/\s+/g, "")

  return {
    productNames,
    companyNames,
    categoryNames,
    codeFields,
    variantFields,
    batchFields,
    otherFields,
    allWords,
    fullText,
    normalizedJoined,
  }
}

/**
 * Checks if a product matches the query using fuzzy / semantic matching
 */
export function matchProductSemantic(product: any, query: string): boolean {
  if (!query || !query.trim()) return true

  const normalizedQuery = query.toLowerCase().trim()
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  const corpus = extractProductCorpus(product)

  // 1. Direct whole-query match (handles spaces/order, e.g. "new variant" inside corpus)
  if (corpus.fullText.includes(normalizedQuery)) {
    return true
  }

  // 2. Space-insensitive match (e.g. "newvariant" vs "new variant")
  const queryNoSpaces = normalizedQuery.replace(/\s+/g, "")
  if (queryNoSpaces.length >= 3 && corpus.normalizedJoined.includes(queryNoSpaces)) {
    return true
  }

  // 3. Multi-token match: EVERY token must match at least one word in the corpus
  return tokens.every((token) => {
    // Fast substring in full text
    if (corpus.fullText.includes(token)) return true

    // Space-insensitive check for this token
    const tokenNoSpace = token.replace(/\s+/g, "")
    if (corpus.normalizedJoined.includes(tokenNoSpace)) return true

    // Fuzzy / typo match across distinct words
    return corpus.allWords.some((word) => isTokenMatch(word, token))
  })
}

/**
 * Calculates a hierarchical relevance score for a product based on user search query
 * Hierarchy:
 * 1. Exact product name match (+1000)
 * 2. Product name prefix match (+800)
 * 3. Product name substring match (+600)
 * 4. SKU / code / barcode match (+500)
 * 5. Variant match (+400)
 * 6. Company / brand match (+300)
 * 7. Category match (+200)
 * 8. Description / batch / shelf / other fields match (+100)
 * 9. Fuzzy / typo match (+50)
 */
export function calculateProductRelevanceScore(product: any, query: string): number {
  if (!query || !query.trim()) return 0

  const normalizedQuery = query.toLowerCase().trim()
  const queryNoSpaces = normalizedQuery.replace(/\s+/g, "")
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const corpus = extractProductCorpus(product)

  let score = 0

  // 0. Exact Product ID match
  const idStr = String(product.id || "")
  if (idStr === normalizedQuery || `#${idStr}` === normalizedQuery) {
    score += 1500
  }

  // 1. Exact Product Name match
  const matchedExactName = corpus.productNames.some((n) => n === normalizedQuery || n.replace(/\s+/g, "") === queryNoSpaces)
  if (matchedExactName) {
    score += 1000
  } else {
    // 2. Product Name Prefix match
    const matchedPrefixName = corpus.productNames.some((n) => n.startsWith(normalizedQuery))
    if (matchedPrefixName) {
      score += 800
    } else {
      // 3. Product Name Substring match
      const matchedSubName = corpus.productNames.some((n) => n.includes(normalizedQuery) || n.replace(/\s+/g, "").includes(queryNoSpaces))
      if (matchedSubName) {
        score += 600
      }
    }
  }

  // 4. SKU / code / barcode match
  const matchedExactCode = corpus.codeFields.some((c) => c === normalizedQuery || c.replace(/\s+/g, "") === queryNoSpaces)
  if (matchedExactCode) {
    score += 500
  } else if (corpus.codeFields.some((c) => c.includes(normalizedQuery))) {
    score += 450
  }

  // 5. Variant match
  const matchedVariant = corpus.variantFields.some((v) => v.includes(normalizedQuery) || (queryNoSpaces.length >= 3 && v.replace(/\s+/g, "").includes(queryNoSpaces)))
  if (matchedVariant) {
    score += 400
  }

  // 6. Company / brand match
  const matchedCompany = corpus.companyNames.some((c) => c.includes(normalizedQuery) || (queryNoSpaces.length >= 3 && c.replace(/\s+/g, "").includes(queryNoSpaces)))
  if (matchedCompany) {
    score += 300
  }

  // 7. Category match
  const matchedCategory = corpus.categoryNames.some((cat) => cat.includes(normalizedQuery) || (queryNoSpaces.length >= 3 && cat.replace(/\s+/g, "").includes(queryNoSpaces)))
  if (matchedCategory) {
    score += 200
  }

  // 8. Description / batch / other fields match
  const matchedBatch = corpus.batchFields.some((b) => b.includes(normalizedQuery))
  if (matchedBatch) {
    score += 150
  } else if (corpus.otherFields.some((o) => o.includes(normalizedQuery))) {
    score += 100
  }

  // 9. Token-level matches & fuzzy matches
  let tokenMatchCount = 0
  let fuzzyMatchCount = 0

  for (const token of tokens) {
    if (corpus.fullText.includes(token)) {
      tokenMatchCount++
    } else if (corpus.allWords.some((w) => isTokenMatch(w, token))) {
      fuzzyMatchCount++
    }
  }

  score += tokenMatchCount * 15
  score += fuzzyMatchCount * 50

  return score
}

/**
 * Comparator for stock-priority ordering:
 * 1. Exact search/ID match takes highest precedence if a searchTerm is provided.
 * 2. Products with currentStock > 0 appear first.
 * 3. Within available stock products:
 *    - If searchTerm is present: sorted by relevance score DESC.
 *    - If relevance scores are tied (or no search term): sorted by currentStock DESC (higher stock first).
 * 4. Within zero-stock products:
 *    - If searchTerm is present: sorted by relevance score DESC.
 * 5. Stable order preserved for products with equal stock and relevance.
 */
export function compareProductsByStockPriority(a: any, b: any, searchTerm?: string): number {
  const trimmed = searchTerm ? searchTerm.trim() : ""

  if (trimmed !== "") {
    const isExactA = String(a.id) === trimmed ? 1 : 0
    const isExactB = String(b.id) === trimmed ? 1 : 0
    if (isExactA !== isExactB) {
      return isExactB - isExactA
    }
  }

  const stockA = Math.max(0, Number(a.stock || 0))
  const stockB = Math.max(0, Number(b.stock || 0))

  const hasStockA = stockA > 0 ? 1 : 0
  const hasStockB = stockB > 0 ? 1 : 0

  // Tier 1 (has stock > 0) comes before Tier 0 (stock === 0)
  if (hasStockA !== hasStockB) {
    return hasStockB - hasStockA
  }

  // Within the same stock tier, sort by relevance score when searching
  if (trimmed !== "") {
    const scoreA = calculateProductRelevanceScore(a, trimmed)
    const scoreB = calculateProductRelevanceScore(b, trimmed)
    if (scoreB !== scoreA) {
      return scoreB - scoreA
    }
  }

  // Within available products with equal relevance, sort DESC by stock amount
  if (hasStockA === 1 && stockB !== stockA) {
    return stockB - stockA
  }

  return 0
}

/**
 * Filter & Sort products using Hybrid Semantic Search & Stock Priority
 */
export function filterProductsSemantic(products: any[], query: string): any[] {
  if (!query || !query.trim()) return products

  const matched = products.filter((p) => matchProductSemantic(p, query))
  return matched.sort((a, b) => compareProductsByStockPriority(a, b, query))
}

export function sortProductsByStockPriority<T extends any>(products: T[], searchTerm?: string): T[] {
  return [...products].sort((a, b) => compareProductsByStockPriority(a, b, searchTerm))
}

export interface SuggestionProductItem {
  id: number
  name: string
  category?: string
  company_name?: string
  price?: number
  stock?: number
}

export interface ProductSuggestionsResult {
  products: SuggestionProductItem[]
  categories: { name: string }[]
  companies: { name: string }[]
  totalCount: number
}

/**
 * Generate autocomplete suggestions from an array of loaded products
 * Grouped into Products, Categories, and Companies
 * Limit: 5–8 suggestions total
 */
export function generateProductSuggestions(
  products: any[],
  query: string,
  maxTotal = 8
): ProductSuggestionsResult {
  if (!query || query.trim().length < 2) {
    return { products: [], categories: [], companies: [], totalCount: 0 }
  }

  const normalizedQuery = query.toLowerCase().trim()
  const matched = products.filter((p) => matchProductSemantic(p, normalizedQuery))
  const sorted = [...matched].sort((a, b) => compareProductsByStockPriority(a, b, normalizedQuery))

  // 1. Matched Categories
  const categorySet = new Set<string>()
  for (const p of products) {
    const cat = p.category || p.category_name
    if (cat && typeof cat === "string") {
      const lower = cat.toLowerCase()
      if (lower.includes(normalizedQuery) || isTokenMatch(lower, normalizedQuery)) {
        categorySet.add(cat.trim())
      }
    }
  }

  // 2. Matched Companies / Brands
  const companySet = new Set<string>()
  for (const p of products) {
    const comp = p.company_name || p.brand
    if (comp && typeof comp === "string") {
      const lower = comp.toLowerCase()
      if (lower.includes(normalizedQuery) || isTokenMatch(lower, normalizedQuery)) {
        companySet.add(comp.trim())
      }
    }
  }

  // Allocate quotas for balanced suggestions (up to maxTotal)
  const maxCategories = Math.min(2, categorySet.size)
  const maxCompanies = Math.min(2, companySet.size)
  const maxProducts = Math.max(3, maxTotal - maxCategories - maxCompanies)

  const productSuggestions: SuggestionProductItem[] = sorted.slice(0, maxProducts).map((p) => ({
    id: p.id,
    name: p.name || p.title,
    category: p.category || p.category_name,
    company_name: p.company_name || p.brand,
    price: p.price ?? p.mrp ?? p.msp,
    stock: p.stock != null ? Number(p.stock) : undefined,
  }))

  const categorySuggestions = Array.from(categorySet)
    .slice(0, maxCategories)
    .map((name) => ({ name }))

  const companySuggestions = Array.from(companySet)
    .slice(0, maxCompanies)
    .map((name) => ({ name }))

  const totalCount = productSuggestions.length + categorySuggestions.length + companySuggestions.length

  return {
    products: productSuggestions,
    categories: categorySuggestions,
    companies: companySuggestions,
    totalCount,
  }
}

