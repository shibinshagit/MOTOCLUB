const fs = require('fs');
let content = fs.readFileSync('components/sales/new-product-modal.tsx', 'utf8');

const start1 = content.indexOf('<PanelSection title="Pricing & Inventory"');
const end1 = content.indexOf('</PanelSection>', start1) + 15;
console.log(content.slice(start1, end1));
