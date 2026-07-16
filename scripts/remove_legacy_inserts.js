const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'app/actions/purchase-actions.ts',
  'app/actions/sale-actions.ts',
  'app/actions/transfer-actions.ts',
  'app/actions/staff-inventory-actions.ts',
  'app/actions/product-actions.ts'
];

for (const file of filesToPatch) {
  let content = fs.readFileSync(file, 'utf-8');
  
  // Replace the INSERT INTO product_device_stock... ON CONFLICT... block
  // We can use a regex that matches the entire sql statement inserting into product_device_stock
  const pattern = /await sql\s*`\s*INSERT INTO product_device_stock[\s\S]*?DO UPDATE SET stock[\s\S]*?`/g;
  
  content = content.replace(pattern, '/* Legacy product_device_stock insert removed */');
  
  fs.writeFileSync(file, content, 'utf-8');
}
console.log('Legacy inserts removed');
