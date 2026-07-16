const fs = require('fs');
let content = fs.readFileSync('components/products/edit-product-modal.tsx', 'utf8');

content = content.replace('setHasVariants(product.has_variants || false)', '');
content = content.replace('if (!hideStockCount && !hasVariants && !formData.stock) errors.stock = "Stock is required"', '');

fs.writeFileSync('components/products/edit-product-modal.tsx', content);
