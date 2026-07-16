const fs = require('fs');

let content = fs.readFileSync('app/actions/product-actions.ts', 'utf-8');

// Update createProduct extraction
content = content.replace(
    'const trending = String(formData.get("trending") || "false") === "true"',
    `const trending = String(formData.get("trending") || "false") === "true"\n  const hasVariants = String(formData.get("has_variants") || "false") === "true"\n  const isBatchManaged = String(formData.get("is_batch_managed") || "false") === "true"`
);

// Update createProduct INSERT columns
content = content.replace(
    /amazon_status,\s*flipkart_status,\s*meesho_status,\s*own_ecom_status,\s*trending\s*\)/,
    'amazon_status,\n            flipkart_status,\n            meesho_status,\n            own_ecom_status,\n            trending,\n            has_variants,\n            is_batch_managed\n          )'
);

// Update createProduct VALUES
content = content.replace(
    /\$\{amazonStatus\},\s*\$\{flipkartStatus\},\s*\$\{meeshoStatus\},\s*\$\{ownEcomStatus\},\s*\$\{trending\}\s*\)/,
    '${amazonStatus},\n            ${flipkartStatus},\n            ${meeshoStatus},\n            ${ownEcomStatus},\n            ${trending},\n            ${hasVariants},\n            ${isBatchManaged}\n          )'
);

// Update updateProduct extraction
content = content.replace(
    'const trending = String(formData.get("trending") || "false") === "true" // Add this line',
    `const trending = String(formData.get("trending") || "false") === "true" // Add this line\n  const hasVariants = String(formData.get("has_variants") || "false") === "true"\n  const isBatchManaged = String(formData.get("is_batch_managed") || "false") === "true"`
);

// Update updateProduct UPDATE query
content = content.replace(
    /own_ecom_status = \$\{ownEcomStatus\},\s*trending = \$\{trending\}\s*WHERE id = \$\{id\}/g,
    'own_ecom_status = ${ownEcomStatus},\n          trending = ${trending},\n          has_variants = ${hasVariants},\n          is_batch_managed = ${isBatchManaged}\n        WHERE id = ${id}'
);

fs.writeFileSync('app/actions/product-actions.ts', content, 'utf-8');
console.log('Done!');
