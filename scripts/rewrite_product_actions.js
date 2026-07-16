const fs = require('fs');

let content = fs.readFileSync('app/actions/product-actions.ts', 'utf8');

const newFunction = `async function attachVariantsAndBatchesToProducts(products: any[], userId?: number) {
  if (!products || products.length === 0) return products;
  
  const productIds = products.map((p: any) => p.id);
  
  let rows;
  if (userId) {
    rows = await sql\`
      SELECT pv.product_id,
        json_agg(
          json_build_object(
            'id', pv.id,
            'product_id', pv.product_id,
            'name', pv.name,
            'sku', pv.sku,
            'barcode', pv.barcode,
            'shelf', pv.shelf,
            'cost_price', pv.cost_price,
            'mrp', pv.mrp,
            'msp', pv.msp,
            'status', pv.status,
            'minimum_stock', pv.minimum_stock,
            'batches', (
              SELECT COALESCE(json_agg(
                json_build_object(
                  'id', pb.id,
                  'batch_no', pb.batch_no,
                  'product_variant_id', pb.product_variant_id,
                  'cost_price', pb.cost_price,
                  'selling_price', pb.selling_price,
                  'quantity_purchased', pb.quantity_purchased,
                  'remaining_quantity', pb.remaining_quantity,
                  'stocks', (
                    SELECT COALESCE(json_agg(json_build_object('device_id', pbds.device_id, 'stock', pbds.stock)), '[]'::json)
                    FROM product_batch_device_stock pbds
                    WHERE pbds.batch_id = pb.id
                    AND pbds.device_id IN (
                      SELECT d2.id FROM devices d1 JOIN devices d2 ON d1.company_id = d2.company_id WHERE d1.id = \${userId}
                    )
                  )
                )
              ), '[]'::json)
              FROM product_batches pb
              WHERE pb.product_variant_id = pv.id
            )
          )
        ) as variants
      FROM product_variants pv
      WHERE pv.product_id = ANY(\${productIds})
      GROUP BY pv.product_id
    \`;
  } else {
    rows = await sql\`
      SELECT pv.product_id,
        json_agg(
          json_build_object(
            'id', pv.id,
            'product_id', pv.product_id,
            'name', pv.name,
            'sku', pv.sku,
            'barcode', pv.barcode,
            'shelf', pv.shelf,
            'cost_price', pv.cost_price,
            'mrp', pv.mrp,
            'msp', pv.msp,
            'status', pv.status,
            'minimum_stock', pv.minimum_stock,
            'batches', (
              SELECT COALESCE(json_agg(
                json_build_object(
                  'id', pb.id,
                  'batch_no', pb.batch_no,
                  'product_variant_id', pb.product_variant_id,
                  'cost_price', pb.cost_price,
                  'selling_price', pb.selling_price,
                  'quantity_purchased', pb.quantity_purchased,
                  'remaining_quantity', pb.remaining_quantity,
                  'stocks', (
                    SELECT COALESCE(json_agg(json_build_object('device_id', pbds.device_id, 'stock', pbds.stock)), '[]'::json)
                    FROM product_batch_device_stock pbds
                    WHERE pbds.batch_id = pb.id
                  )
                )
              ), '[]'::json)
              FROM product_batches pb
              WHERE pb.product_variant_id = pv.id
            )
          )
        ) as variants
      FROM product_variants pv
      WHERE pv.product_id = ANY(\${productIds})
      GROUP BY pv.product_id
    \`;
  }
  
  const variantsMap = new Map(rows.map((r: any) => [r.product_id, r.variants]));
  
  return products.map(p => {
    const variants = variantsMap.get(p.id) || [];
    const batches = [];
    for (const v of variants) {
      if (v.batches) {
        batches.push(...v.batches);
      }
    }
    return {
      ...p,
      variants,
      batches
    };
  });
}
`;

const startIndex = content.indexOf('async function attachVariantsAndBatchesToProducts');
const endMarker = 'return products.map(p => ({\n    ...p,\n    variants: variantsByProductId.get(p.id) || [],\n    batches: batchesByProductId.get(p.id) || []\n  }))\n}';
const endIndex = content.indexOf(endMarker) + endMarker.length;

if (startIndex !== -1 && content.indexOf(endMarker) !== -1) {
  content = content.slice(0, startIndex) + newFunction + content.slice(endIndex);
  fs.writeFileSync('app/actions/product-actions.ts', content, 'utf8');
  console.log('Successfully replaced attachVariantsAndBatchesToProducts');
} else {
  console.log('Could not find bounds using index');
}
