const fs = require('fs');

let content = fs.readFileSync('app/actions/purchase-actions.ts', 'utf8');

function extractFunction(text, funcName) {
  const start = text.indexOf("async function " + funcName);
  if (start === -1) return null;
  let braceCount = 0;
  let inFunc = false;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') {
      braceCount++;
      inFunc = true;
    } else if (text[i] === '}') {
      braceCount--;
    }
    
    if (inFunc && braceCount === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

const oldFunc = extractFunction(content, 'adjustDeviceProductStock');
if (oldFunc) {
  const newFunc = "async function adjustDeviceProductStock(" +
    "\n  productId: number," +
    "\n  variantId: number | null," +
    "\n  batchId: number | null," +
    "\n  deviceId: number," +
    "\n  quantityChange: number," +
    "\n) {" +
    "\n  if (!batchId) {" +
    "\n    throw new Error(\"Batch ID is required for stock adjustment\");" +
    "\n  }" +
    "\n" +
    "\n  // Adjust batch stock" +
    "\n  const batchStock = await sql`" +
    "\n    SELECT id, stock FROM product_batch_device_stock" +
    "\n    WHERE product_batch_id = ${batchId} AND device_id = ${deviceId}" +
    "\n    LIMIT 1" +
    "\n  `" +
    "\n" +
    "\n  if (batchStock.length > 0) {" +
    "\n    await sql`" +
    "\n      UPDATE product_batch_device_stock" +
    "\n      SET stock = stock + ${quantityChange}, updated_at = CURRENT_TIMESTAMP" +
    "\n      WHERE id = ${batchStock[0].id}" +
    "\n    `" +
    "\n  } else {" +
    "\n    await sql`" +
    "\n      INSERT INTO product_batch_device_stock (product_batch_id, device_id, stock)" +
    "\n      VALUES (${batchId}, ${deviceId}, ${quantityChange})" +
    "\n    `" +
    "\n  }" +
    "\n}";
  content = content.replace(oldFunc, newFunc);
}

// 2. Fix batch creation (2 occurrences)
content = content.split("if (!resolvedBatchId && item.batch_number && resolvedVariantId) {").join(
  "if (!resolvedBatchId && resolvedVariantId) {\n          const batchNo = item.batch_number || `PUR-${purchaseId}-${item.product_id}`;"
);
content = content.split("AND batch_no = ${item.batch_number}").join(
  "AND batch_no = ${batchNo}"
);
content = content.split("${item.batch_number}, ${mfgDate}").join(
  "${batchNo}, ${mfgDate}"
);
content = content.split("${item.selling_price}").join(
  "${item.selling_price || null}"
);

fs.writeFileSync('app/actions/purchase-actions.ts', content, 'utf8');
console.log("Done");
