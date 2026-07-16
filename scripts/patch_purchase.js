const fs = require('fs');

let content = fs.readFileSync('app/actions/purchase-actions.ts', 'utf8');

const targetContent = \`        let resolvedBatchId = item.batch_id
        if (!resolvedBatchId && item.batch_number && resolvedVariantId) {
          // Check if batch already exists
          const existingBatch = await sql\\\`
            SELECT id FROM product_batches 
            WHERE product_variant_id = \\\${resolvedVariantId} AND batch_no = \\\${item.batch_number}
            LIMIT 1
          \\\`
          if (existingBatch.length > 0) {
            resolvedBatchId = existingBatch[0].id
          } else {
            // Create a new batch
            const mfgDate = item.mfg_date || null
            const expiryDate = item.expiry_date || null
            const newBatch = await sql\\\`
              INSERT INTO product_batches (
                product_variant_id, batch_no, manufacture_date, expiry_date, cost_price, selling_price
              ) VALUES (
                \\\${resolvedVariantId}, \\\${item.batch_number}, \\\${mfgDate}, \\\${expiryDate}, \\\${item.price}, \\\${item.selling_price}
              )
              RETURNING id
            \\\`
            resolvedBatchId = newBatch[0].id
          }
        }\`;

const replacementContent = \`        let resolvedBatchId = item.batch_id
        if (!resolvedBatchId && resolvedVariantId) {
          const batchNo = item.batch_number || \\\`PUR-\\\${purchaseId}-\\\${item.product_id}\\\`
          // Check if batch already exists
          const existingBatch = await sql\\\`
            SELECT id FROM product_batches 
            WHERE product_variant_id = \\\${resolvedVariantId} AND batch_no = \\\${batchNo}
            LIMIT 1
          \\\`
          if (existingBatch.length > 0) {
            resolvedBatchId = existingBatch[0].id
          } else {
            // Create a new batch
            const mfgDate = item.mfg_date || null
            const expiryDate = item.expiry_date || null
            const newBatch = await sql\\\`
              INSERT INTO product_batches (
                product_variant_id, batch_no, manufacture_date, expiry_date, cost_price, selling_price
              ) VALUES (
                \\\${resolvedVariantId}, \\\${batchNo}, \\\${mfgDate}, \\\${expiryDate}, \\\${item.price}, \\\${item.selling_price || null}
              )
              RETURNING id
            \\\`
            resolvedBatchId = newBatch[0].id
          }
        }\`;

content = content.replace(new RegExp(targetContent.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\\\$&'), 'g'), replacementContent);
fs.writeFileSync('app/actions/purchase-actions.ts', content);
console.log('Done patch_purchase.js');
