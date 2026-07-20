const fs = require('fs');
const path = 'd:/projects/AutoClub/MOTOCLUB/app/actions/product-actions.ts';
let content = fs.readFileSync(path, 'utf8');

const regexBarcode = /.*REPLACE\(COALESCE\(p\.barcode, ''\), ' ', ''\) LIKE \$\{searchPattern\} OR\s*/g;
const regexColor = /.*REPLACE\(LOWER\(COALESCE\(p\.color, ''\)\), ' ', ''\) LIKE \$\{searchPattern\} OR\s*/g;

content = content.replace(regexBarcode, '');
content = content.replace(regexColor, '');

fs.writeFileSync(path, content, 'utf8');
console.log("Replaced successfully");
