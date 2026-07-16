import os

file_path = 'app/actions/purchase-actions.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

import re

# 1. Replace adjustDeviceProductStock
target_adjust = re.search(r'async function adjustDeviceProductStock.*?\n}', content, re.DOTALL)
if target_adjust:
    # We need to find the full function which has nested braces
    pass

# Wait, the easiest way is to just checkout the backup file I must have from before?
# I didn't create a backup. Let's just fix the function using python string replacement.

def extract_function(text, func_name):
    start = text.find(f"async function {func_name}")
    if start == -1: return None
    brace_count = 0
    in_func = False
    for i in range(start, len(text)):
        if text[i] == '{':
            brace_count += 1
            in_func = True
        elif text[i] == '}':
            brace_count -= 1
        
        if in_func and brace_count == 0:
            return text[start:i+1]
    return None

old_func = extract_function(content, 'adjustDeviceProductStock')

new_func = """async function adjustDeviceProductStock(
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
  const batchStock = await sql`
    SELECT id, stock FROM product_batch_device_stock
    WHERE product_batch_id = ${batchId} AND device_id = ${deviceId}
    LIMIT 1
  `

  if (batchStock.length > 0) {
    await sql`
      UPDATE product_batch_device_stock
      SET stock = stock + ${quantityChange}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${batchStock[0].id}
    `
  } else {
    await sql`
      INSERT INTO product_batch_device_stock (product_batch_id, device_id, stock)
      VALUES (${batchId}, ${deviceId}, ${quantityChange})
    `
  }
}"""

if old_func:
    content = content.replace(old_func, new_func)

# 2. Fix batch creation (2 occurrences)
content = content.replace(
    "if (!resolvedBatchId && item.batch_number && resolvedVariantId) {",
    "if (!resolvedBatchId && resolvedVariantId) {\n          const batchNo = item.batch_number || `PUR-${purchaseId}-${item.product_id}`;"
)
content = content.replace(
    "AND batch_no = ${item.batch_number}",
    "AND batch_no = ${batchNo}"
)
content = content.replace(
    "${item.batch_number}, ${mfgDate}",
    "${batchNo}, ${mfgDate}"
)
content = content.replace(
    "${item.selling_price}",
    "${item.selling_price || null}"
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
