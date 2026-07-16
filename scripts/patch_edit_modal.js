const fs = require('fs');

let content = fs.readFileSync('components/products/edit-product-modal.tsx', 'utf8');

// 1. Remove `hasVariants` state
content = content.replace(
  /const \[hasVariants, setHasVariants\] = useState\(.*?\)/,
  ''
);

// 2. Remove pricing panel
const pricingStart = content.indexOf('<PanelSection title="Pricing">');
if (pricingStart !== -1) {
  const pricingEnd = content.indexOf('</PanelSection>', pricingStart) + '</PanelSection>'.length;
  content = content.slice(0, pricingStart) + content.slice(pricingEnd);
}

// 3. Remove inventory options panel
const invOptionsStart = content.indexOf('<PanelSection title="Inventory options"');
if (invOptionsStart !== -1) {
  const invOptionsEnd = content.indexOf('</PanelSection>', invOptionsStart) + '</PanelSection>'.length;
  content = content.slice(0, invOptionsStart) + content.slice(invOptionsEnd);
}

// 4. Remove Inventory & Barcode panel
const invBarcodeStart = content.indexOf('<PanelSection title="Inventory & barcode">');
if (invBarcodeStart !== -1) {
  const invBarcodeEnd = content.indexOf('</PanelSection>', invBarcodeStart) + '</PanelSection>'.length;
  content = content.slice(0, invBarcodeStart) + content.slice(invBarcodeEnd);
}

// 6. Fix `{hasVariants && (` tags
content = content.replace(/\{hasVariants && \(/g, '{true && (');

// 7. Fix `{!hasVariants && (` tags
content = content.replace(/\{!hasVariants && \(/g, '{false && (');
content = content.replace(/\{!hasVariants && isBatchManaged && \(/g, '{false && (');
content = content.replace(/\{!hideStockCount && !hasVariants && \(/g, '{false && (');

// 8. Fix validation logic
content = content.replace(/if \(!hideStockCount && !hasVariants && !formData\.stock\).*?\n/g, '');
content = content.replace(/if \(hasVariants\) \{/g, 'if (true) {');

// 9. Fix FormData appends
content = content.replace(/submitFormData\.append\("price", formData\.price\)/g, '');
content = content.replace(/submitFormData\.append\("wholesale_price", formData\.wholesalePrice \|\| "0"\)/g, '');
content = content.replace(/submitFormData\.append\("msp", formData\.msp \|\| "0"\)/g, '');
content = content.replace(/submitFormData\.append\("stock", formData\.stock \|\| "0"\)/g, '');
content = content.replace(/submitFormData\.append\("shelf", formData\.shelf\)/g, '');
content = content.replace(/submitFormData\.append\("barcode", formData\.barcode\)/g, '');
content = content.replace(/submitFormData\.append\("color", formData\.color\)/g, '');
content = content.replace(/submitFormData\.append\("size", formData\.size\)/g, '');
content = content.replace(/submitFormData\.append\("has_variants", hasVariants \? "true" : "false"\)/g, 'submitFormData.append("has_variants", "true")');

fs.writeFileSync('components/products/edit-product-modal.tsx', content, 'utf8');
console.log('Done patch_edit_modal.js');
