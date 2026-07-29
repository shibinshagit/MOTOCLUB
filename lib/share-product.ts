export interface ShareProductOptions {
  includeStock?: boolean;
  productUrl?: string;
  currency?: string;
}

export function formatShareProductMessage(product: any, options: ShareProductOptions = {}): string {
  const { includeStock = false, productUrl = "", currency = "AED" } = options;
  const parts: string[] = [];

  parts.push(`Product: ${product.name || "Unknown Product"}`);

  // Determine variant string
  const variantName = product.variantName || product.variant_name;
  if (variantName && variantName.toLowerCase() !== "default") {
    parts.push(`Variant: ${variantName}`);
  }

  if (product.category || product.category_name) {
    parts.push(`Category: ${product.category || product.category_name}`);
  }

  if (product.company_name) {
    parts.push(`Brand: ${product.company_name}`);
  }

  // Determine the best selling price (never use cost or wholesale)
  const price = product.price || product.sellingPrice || product.selling_price || product.msp || product.mrp;
  if (price !== undefined && price !== null && Number(price) > 0) {
    parts.push(`Price: ${currency} ${Number(price).toFixed(2)}`);
  }

  if (product.barcode) {
    parts.push(`Barcode: ${product.barcode}`);
  }

  if (product.sku) {
    parts.push(`SKU: ${product.sku}`);
  }

  if (product.description) {
    parts.push(`Description: ${product.description}`);
  }

  if (includeStock) {
    const stock = Number(product.stock) || 0;
    parts.push(`Available Stock: ${stock > 0 ? stock : "Out of stock"}`);
  }

  if (productUrl) {
    parts.push(`Product link: ${productUrl}`);
  }

  return parts.join("\n");
}
