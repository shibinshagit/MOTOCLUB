export interface ShareProductOptions {
  includeStock?: boolean;
  productUrl?: string;
  currency?: string;
}

export function formatShareProductMessage(product: any, options: ShareProductOptions = {}): string {
  const { includeStock = false, productUrl = "", currency = "AED" } = options;
  const parts: string[] = [];

  parts.push(`🚗 Product\n${product.name || "Unknown Product"}`);

  if (product.category || product.category_name) {
    parts.push(`🏷 Category\n${product.category || product.category_name}`);
  }

  if (product.company_name) {
    parts.push(`🏢 Brand\n${product.company_name}`);
  }

  // Determine the best selling price (never use cost or wholesale)
  const price = product.price || product.selling_price || product.msp || product.mrp;
  if (price !== undefined && price !== null && Number(price) > 0) {
    parts.push(`💰 Selling Price\n${currency} ${Number(price).toFixed(2)}`);
  }

  if (product.barcode) {
    parts.push(`📦 Barcode\n${product.barcode}`);
  }

  if (product.sku) {
    parts.push(`🔖 SKU\n${product.sku}`);
  }

  if (product.description) {
    parts.push(`📝 Description\n${product.description}`);
  }

  if (includeStock) {
    const stock = Number(product.stock) || 0;
    parts.push(`📊 Available Stock\n${stock > 0 ? stock : "Out of stock"}`);
  }

  // Handle images
  const imageUrls: string[] = [];
  if (product.media && Array.isArray(product.media)) {
    product.media.forEach((m: any) => {
      if (m.url) imageUrls.push(m.url);
    });
  } else if (product.image_url) {
    imageUrls.push(product.image_url);
  }

  if (imageUrls.length > 0) {
    parts.push(`📷 Product Images\n${imageUrls.join("\n")}`);
  }

  if (productUrl) {
    parts.push(`🔗 Product Link\n${productUrl}`);
  }

  return parts.join("\n\n--------------------------------\n\n");
}
