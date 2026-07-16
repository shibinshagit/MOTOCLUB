const fs = require('fs');

let content = fs.readFileSync('app/actions/purchase-actions.ts', 'utf8');

// Remove adjustDeviceProductStock calls handling `product_device_stock`
// Since product_device_stock is now a VIEW, we ONLY insert/update `product_batch_device_stock`.
// We need to rewrite `adjustDeviceProductStock`.

const newAdjustDeviceProductStock = \`async function adjustDeviceProductStock(
  productId: number,
  variantId: number | null,
  batchId: number | null,
  deviceId: number,
  quantityChange: number,
) {
  if (!batchId) {
    throw new Error("Batch ID is required for stock adjustment");
  }

  // Adjust batch stock
  const batchStock = await sql\\\`
    SELECT id, stock FROM product_batch_device_stock
    WHERE product_batch_id = \\\${batchId} AND device_id = \\\${deviceId}
    LIMIT 1
  \\\`

  if (batchStock.length > 0) {
    await sql\\\`
      UPDATE product_batch_device_stock
      SET stock = stock + \\\${quantityChange}, updated_at = CURRENT_TIMESTAMP
      WHERE id = \\\${batchStock[0].id}
    \\\`
  } else {
    await sql\\\`
      INSERT INTO product_batch_device_stock (product_batch_id, device_id, stock)
      VALUES (\\\${batchId}, \\\${deviceId}, \\\${quantityChange})
    \\\`
  }
}\`;

// Replace adjustDeviceProductStock
content = content.replace(/async function adjustDeviceProductStock[\s\S]*?\}[\s\S]*?\}[\s\S]*?\}/, newAdjustDeviceProductStock);

// Fix auto batch generation
const targetBatchGen = \`        let resolvedBatchId = item.batch_id
        if (!resolvedBatchId && item.batch_number && resolvedVariantId) {
          // Check if batch already exists
          const existingBatch = await sql\\\`
            SELECT id FROM product_batches 
            WHERE product_variant_id = \\\${resolvedVariantId} AND batch_no = \\\${item.batch_number}
            LIMIT 1
          \\\`\`;

const replacementBatchGen = \`        let resolvedBatchId = item.batch_id
        if (!resolvedBatchId && resolvedVariantId) {
          const batchNo = item.batch_number || \\\`PUR-\\\${purchaseId}-\\\${item.product_id}\\\`;
          // Check if batch already exists
          const existingBatch = await sql\\\`
            SELECT id FROM product_batches 
            WHERE product_variant_id = \\\${resolvedVariantId} AND batch_no = \\\${batchNo}
            LIMIT 1
          \\\`\`;

content = content.replace(targetBatchGen, replacementBatchGen);

const targetInsertBatch = \`              INSERT INTO product_batches (
                product_variant_id, batch_no, manufacture_date, expiry_date, cost_price, selling_price
              ) VALUES (
                \${resolvedVariantId}, \${item.batch_number}, \${mfgDate}, \${expiryDate}, \${item.price}, \${item.selling_price}
              )\`;

const replaceInsertBatch = \`              INSERT INTO product_batches (
                product_variant_id, batch_no, manufacture_date, expiry_date, cost_price, selling_price
              ) VALUES (
                \${resolvedVariantId}, \${batchNo}, \${mfgDate}, \${expiryDate}, \${item.price}, \${item.selling_price || null}
              )\`;

// Use generic string replace for these templates
content = content.replace(targetInsertBatch, replaceInsertBatch);

fs.writeFileSync('app/actions/purchase-actions.ts', content, 'utf8');
console.log('Done cleaning purchase-actions.ts');
