const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'actions', 'product-actions.ts');
let content = fs.readFileSync(filePath, 'utf8');

const helperFunctions = `
async function attachVariantsAndBatchesToProducts(products: any[]) {
  if (!products || products.length === 0) return products;
  
  const productIds = products.map((p: any) => p.id);
  
  const variants = await sql\`
    SELECT * FROM product_variants
    WHERE product_id = ANY(\${productIds})
    ORDER BY id ASC
  \`;
  
  const batches = await sql\`
    SELECT pb.*, pbds.stock as device_stock, pbds.device_id, pv.name as variant_name
    FROM product_batches pb
    LEFT JOIN product_batch_device_stock pbds ON pb.id = pbds.batch_id
    LEFT JOIN product_variants pv ON pb.product_variant_id = pv.id
    WHERE pb.product_id = ANY(\${productIds})
    ORDER BY pb.id ASC
  \`;

  // Also get variant stocks
  const variantStocks = await sql\`
    SELECT pds.* FROM product_device_stock pds
    WHERE pds.product_id = ANY(\${productIds}) AND pds.product_variant_id IS NOT NULL
  \`;
  
  const variantsByProductId = new Map<number, any[]>();
  const batchesByProductId = new Map<number, any[]>();
  
  // Group variants
  for (const v of variants) {
    if (!variantsByProductId.has(v.product_id)) variantsByProductId.set(v.product_id, []);
    
    // Attach device stocks to variant
    const vStocks = variantStocks.filter((vs: any) => vs.product_variant_id === v.id);
    v.stocks = vStocks;
    
    variantsByProductId.get(v.product_id)!.push(v);
  }
  
  // Group batches
  for (const b of batches) {
    if (!batchesByProductId.has(b.product_id)) batchesByProductId.set(b.product_id, []);
    
    const productBatches = batchesByProductId.get(b.product_id)!;
    let existingBatch = productBatches.find(pb => pb.id === b.id);
    
    if (!existingBatch) {
      existingBatch = { ...b, stocks: [] };
      productBatches.push(existingBatch);
    }
    
    if (b.device_id !== null) {
      existingBatch.stocks.push({ device_id: b.device_id, stock: b.device_stock });
    }
  }
  
  return products.map(p => ({
    ...p,
    variants: variantsByProductId.get(p.id) || [],
    batches: batchesByProductId.get(p.id) || []
  }));
}

async function attachVariantsAndBatchesToProduct(product: any) {
  if (!product) return product;
  const products = await attachVariantsAndBatchesToProducts([product]);
  return products[0];
}
`;

// Insert helper functions after imports
const lastImportIndex = content.lastIndexOf('import ');
const nextNewline = content.indexOf('\n', lastImportIndex);
const insertPoint = content.indexOf('\n', nextNewline + 1);

if (!content.includes('attachVariantsAndBatchesToProducts')) {
  content = content.slice(0, insertPoint) + '\n' + helperFunctions + '\n' + content.slice(insertPoint);
}

// 1. Patch getProducts (exact match early return)
content = content.replace(
  /console\.log\(\`Found exact product match for ID \$\{productId\}:\`, mappedProducts\[0\]\)\s*return \{ success: true, data: await filterProductsForStaff\(mappedProducts, userId\) \}/g,
  `console.log(\`Found exact product match for ID \${productId}:\`, mappedProducts[0])
        const finalMappedProducts = await attachVariantsAndBatchesToProducts(mappedProducts)
        return { success: true, data: await filterProductsForStaff(finalMappedProducts, userId) }`
);

// 2. Patch getProducts (main return)
content = content.replace(
  /console\.log\(\`Found \$\{mappedProducts\.length\} products\`\)\s*return \{ success: true, data: await filterProductsForStaff\(mappedProducts, userId\) \}/g,
  `console.log(\`Found \${mappedProducts.length} products\`)
    const finalMappedProducts = await attachVariantsAndBatchesToProducts(mappedProducts)
    return { success: true, data: await filterProductsForStaff(finalMappedProducts, userId) }`
);

// 3. Patch getProductById
content = content.replace(
  /const staff = userId \? await resolveStaffSessionContext\(userId\) : null\s*return \{ success: true, data: filterProductForStaff\(product, staff\) \}/g,
  `const staff = userId ? await resolveStaffSessionContext(userId) : null
    const productWithVariants = await attachVariantsAndBatchesToProduct(product)
    return { success: true, data: filterProductForStaff(productWithVariants, staff) }`
);

// 4. Patch getProductByBarcode
// getProductByBarcode uses the exact same return string so we need to make sure we catch it.
// We can use a regex with a more broad match or replace all instances of that return block since it's identical.
content = content.replace(
  /const product = \{\s*\.\.\.result\[0\],\s*stock: resolvedStock,\s*category: result\[0\]\.category_name \|\| result\[0\]\.category \|\| "",\s*\}\s*const staff = userId \? await resolveStaffSessionContext\(userId\) : null\s*return \{ success: true, data: filterProductForStaff\(product, staff\) \}/g,
  `const product = {
      ...result[0],
      stock: resolvedStock,
      category: result[0].category_name || result[0].category || "",
    }

    const staff = userId ? await resolveStaffSessionContext(userId) : null
    const productWithVariants = await attachVariantsAndBatchesToProduct(product)
    return { success: true, data: filterProductForStaff(productWithVariants, staff) }`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patch complete.');
