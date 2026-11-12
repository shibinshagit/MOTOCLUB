export interface ShareProductOptions {
  includeStock?: boolean;
  productUrl?: string;
  currency?: string;
  customStock?: number | null;
}

export function formatShareProductMessage(product: any, options: ShareProductOptions = {}): string {
  const { includeStock = false, productUrl = "", currency = "AED", customStock = null } = options;
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

  // Note: Barcode is deliberately omitted from product sharing per user requirements

  if (product.sku) {
    parts.push(`SKU: ${product.sku}`);
  }

  if (product.description) {
    parts.push(`Description: ${product.description}`);
  }

  if (includeStock) {
    let stock = 0;
    if (customStock !== null && customStock !== undefined && !isNaN(Number(customStock))) {
      stock = Number(customStock);
    } else if (product.stock !== undefined && product.stock !== null && !isNaN(Number(product.stock))) {
      stock = Number(product.stock);
    } else if (product.current_stock !== undefined && product.current_stock !== null && !isNaN(Number(product.current_stock))) {
      stock = Number(product.current_stock);
    } else if (product.device_stock !== undefined && product.device_stock !== null && !isNaN(Number(product.device_stock))) {
      stock = Number(product.device_stock);
    } else if (product.company_total_stock !== undefined && product.company_total_stock !== null && !isNaN(Number(product.company_total_stock))) {
      stock = Number(product.company_total_stock);
    } else if (product.quantity !== undefined && product.quantity !== null && !isNaN(Number(product.quantity))) {
      stock = Number(product.quantity);
    } else if (Array.isArray(product.variants) && product.variants.length > 0) {
      stock = product.variants.reduce((acc: number, v: any) => acc + (Number(v.stock ?? v.device_stock ?? v.current_stock) || 0), 0);
    } else if (Array.isArray(product.batches) && product.batches.length > 0) {
      stock = product.batches.reduce((acc: number, b: any) => {
        const bStock = Array.isArray(b.stocks)
          ? b.stocks.reduce((sAcc: number, s: any) => sAcc + Number(s.stock || 0), 0)
          : Number(b.stock || 0);
        return acc + (isNaN(bStock) ? 0 : bStock);
      }, 0);
    }
    parts.push(`Available Stock: ${stock > 0 ? stock : "Out of stock"}`);
  }

  if (productUrl) {
    parts.push(`Product link: ${productUrl}`);
  }

  return parts.join("\n");
}
