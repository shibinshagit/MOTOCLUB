const fs = require('fs');

function fixProductActions() {
    let content = fs.readFileSync('app/actions/product-actions.ts', 'utf-8');

    // In createProduct, remove fields from INSERT INTO products
    const insertPattern = /INSERT INTO products\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*RETURNING \*/gs;
    
    content = content.replace(insertPattern, (match, colsStr, valsStr) => {
        const cols = colsStr.split(',').map(c => c.trim());
        const vals = valsStr.split(',').map(v => v.trim());
        
        const fieldsToRemove = ['price', 'wholesale_price', 'msp', 'shelf', 'color', 'size', 'barcode', 'stock', 'has_variants', 'is_batch_managed'];
        
        const newCols = [];
        const newVals = [];
        
        for (let i = 0; i < cols.length; i++) {
            if (!fieldsToRemove.includes(cols[i])) {
                newCols.push(cols[i]);
                newVals.push(vals[i]);
            }
        }
        
        const newColsStr = newCols.join(',\n            ');
        const newValsStr = newVals.join(',\n            ');
        
        return "INSERT INTO products (\n            " + newColsStr + "\n          )\n          VALUES (\n            " + newValsStr + "\n          )\n          RETURNING *";
    });
    
    // Also updateProduct UPDATE products SET ...
    const updatePattern = /UPDATE products\s*SET\s*(.*?)\s*WHERE id = \$\{id\}\s*RETURNING \*/gs;
    
    content = content.replace(updatePattern, (match, setStr) => {
        const assignments = setStr.split(',').map(a => a.trim());
        
        const fieldsToRemove = ['price', 'wholesale_price', 'msp', 'shelf', 'color', 'size', 'barcode', 'stock', 'has_variants', 'is_batch_managed'];
        
        const newAssignments = [];
        for (const a of assignments) {
            const colName = a.split('=')[0].trim();
            if (!fieldsToRemove.includes(colName)) {
                newAssignments.push(a);
            }
        }
        
        const newSetStr = newAssignments.join(',\n            ');
        
        return "UPDATE products\n          SET\n            " + newSetStr + "\n          WHERE id = ${id}\n          RETURNING *";
    });
    
    fs.writeFileSync('app/actions/product-actions.ts', content, 'utf-8');
}

fixProductActions();
