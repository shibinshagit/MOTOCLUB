const fs = require('fs');

let content = fs.readFileSync('app/actions/product-actions.ts', 'utf-8');

const injectionCode = `
    // Inject Variants and Batches
    if (mappedProducts.length > 0) {
      const productIds = mappedProducts.map((p: any) => p.id)
      
      const variants = await sql\`
        SELECT * FROM product_variants
        WHERE product_id = ANY(\${productIds})
        ORDER BY id ASC
      \`
      
      const batches = await sql\`
        SELECT pb.*, pbds.stock, pbds.device_id, pv.name as variant_name
        FROM product_batches pb
        LEFT JOIN product_batch_device_stock pbds ON pb.id = pbds.batch_id
        LEFT JOIN product_variants pv ON pb.product_variant_id = pv.id
        WHERE pb.product_id = ANY(\${productIds})
        ORDER BY pb.id ASC
      \`
      
      const variantsByProductId = new Map<number, any[]>()
      const batchesByProductId = new Map<number, any[]>()
      
      for (const v of variants) {
        if (!variantsByProductId.has(v.product_id)) variantsByProductId.set(v.product_id, [])
        variantsByProductId.get(v.product_id)!.push(v)
      }
      
      for (const b of batches) {
        if (!batchesByProductId.has(b.product_id)) batchesByProductId.set(b.product_id, [])
        
        const productBatches = batchesByProductId.get(b.product_id)!
        let existingBatch = productBatches.find(pb => pb.id === b.id)
        
        if (!existingBatch) {
          existingBatch = {
            ...b,
            stocks: []
          }
          productBatches.push(existingBatch)
        }
        
        if (b.device_id !== null) {
          existingBatch.stocks.push({
            device_id: b.device_id,
            stock: b.stock
          })
        }
      }
      
      for (const p of mappedProducts) {
        p.variants = variantsByProductId.get(p.id) || []
        p.batches = batchesByProductId.get(p.id) || []
      }
    }

    console.log(\`Found \${mappedProducts.length} products\`)

    return { success: true, data: await filterProductsForStaff(mappedProducts, userId) }
`;

content = content.replace(
    '    console.log(`Found ${mappedProducts.length} products`)\n\n    return { success: true, data: await filterProductsForStaff(mappedProducts, userId) }',
    injectionCode
);

// We also need to inject it into the exact match early return
const exactMatchInjectionCode = `
      // Inject Variants and Batches for exact match
      if (mappedProducts.length > 0) {
        const productIds = mappedProducts.map((p: any) => p.id)
        
        const variants = await sql\`
          SELECT * FROM product_variants
          WHERE product_id = ANY(\${productIds})
          ORDER BY id ASC
        \`
        
        const batches = await sql\`
          SELECT pb.*, pbds.stock, pbds.device_id, pv.name as variant_name
          FROM product_batches pb
          LEFT JOIN product_batch_device_stock pbds ON pb.id = pbds.batch_id
          LEFT JOIN product_variants pv ON pb.product_variant_id = pv.id
          WHERE pb.product_id = ANY(\${productIds})
          ORDER BY pb.id ASC
        \`
        
        const variantsByProductId = new Map<number, any[]>()
        const batchesByProductId = new Map<number, any[]>()
        
        for (const v of variants) {
          if (!variantsByProductId.has(v.product_id)) variantsByProductId.set(v.product_id, [])
          variantsByProductId.get(v.product_id)!.push(v)
        }
        
        for (const b of batches) {
          if (!batchesByProductId.has(b.product_id)) batchesByProductId.set(b.product_id, [])
          
          const productBatches = batchesByProductId.get(b.product_id)!
          let existingBatch = productBatches.find(pb => pb.id === b.id)
          
          if (!existingBatch) {
            existingBatch = {
              ...b,
              stocks: []
            }
            productBatches.push(existingBatch)
          }
          
          if (b.device_id !== null) {
            existingBatch.stocks.push({
              device_id: b.device_id,
              stock: b.stock
            })
          }
        }
        
        for (const p of mappedProducts) {
          p.variants = variantsByProductId.get(p.id) || []
          p.batches = batchesByProductId.get(p.id) || []
        }
      }

      console.log(\`Found exact product match for ID \${productId}:\`, mappedProducts[0])
      return { success: true, data: await filterProductsForStaff(mappedProducts, userId) }
`;

content = content.replace(
    '        console.log(`Found exact product match for ID ${productId}:`, mappedProducts[0])\n        return { success: true, data: await filterProductsForStaff(mappedProducts, userId) }',
    exactMatchInjectionCode
);

fs.writeFileSync('app/actions/product-actions.ts', content, 'utf-8');
console.log('Done patching product-actions.ts');
