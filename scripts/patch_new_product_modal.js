const fs = require('fs');

let content = fs.readFileSync('components/sales/new-product-modal.tsx', 'utf8');

// 1. Remove `hasVariants` state
content = content.replace(
  'const [hasVariants, setHasVariants] = useState(false)',
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

// 5. Remove Initial Batch panel
const initialBatchStart = content.indexOf('<PanelSection title="Initial Batch"');
if (initialBatchStart !== -1) {
  const initialBatchEnd = content.indexOf('</PanelSection>', initialBatchStart) + '</PanelSection>'.length;
  content = content.slice(0, initialBatchStart) + content.slice(initialBatchEnd);
}

// 6. Fix `{hasVariants && (` tags which now should just be rendered
content = content.replace(/\{hasVariants && \(/g, '{true && (');

// 7. Fix `{!hasVariants && (` tags which should be completely hidden
content = content.replace(/\{!hasVariants && \(/g, '{false && (');
content = content.replace(/\{!hasVariants && isBatchManaged && \(/g, '{false && (');
content = content.replace(/\{!hideStockCount && !hasVariants && \(/g, '{false && (');

// 8. Fix validation logic
content = content.replace('if (!hideStockCount && !hasVariants && !formData.stock) errors.stock = "Stock is required"', '');
content = content.replace('if (hasVariants) {', 'if (true) {');

// 9. Fix FormData appends
content = content.replace('submitFormData.append("price", formData.price)', '');
content = content.replace('submitFormData.append("wholesale_price", formData.wholesalePrice || "0")', '');
content = content.replace('submitFormData.append("msp", formData.msp || "0")', '');
content = content.replace('submitFormData.append("stock", formData.stock || "0")', '');
content = content.replace('submitFormData.append("shelf", formData.shelf)', '');
content = content.replace('submitFormData.append("barcode", formData.barcode)', '');
content = content.replace('submitFormData.append("color", formData.color)', '');
content = content.replace('submitFormData.append("size", formData.size)', '');
content = content.replace('submitFormData.append("has_variants", hasVariants ? "true" : "false")', 'submitFormData.append("has_variants", "true")');

// 10. Default variants length
content = content.replace(
  'const [variants, setVariants] = useState<any[]>([])',
  'const [variants, setVariants] = useState<any[]>([{ variant_name: "", color: "", size: "", length: "", height: "", sku: "", barcode: "", price: null, wholesale_price: null, stock: 0, batch_number: "AUTO_GENERATE", manufacture_date: "", expiry_date: "" }])'
);

fs.writeFileSync('components/sales/new-product-modal.tsx', content, 'utf8');
console.log('Done patch_new_product_modal.js');
