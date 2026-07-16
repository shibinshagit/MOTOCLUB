const fs = require('fs');

let content = fs.readFileSync('app/actions/product-actions.ts', 'utf-8');

content = content.replace(
    /WHERE p\.created_by IN \([\s\S]*?WHERE d1\.id = \$\{userId\}\s*\)/g,
    match => match.replace('WHERE p.created_by IN', 'WHERE (p.created_by IS NULL OR p.created_by IN') + ')'
);

content = content.replace(
    /AND p\.created_by IN \([\s\S]*?WHERE d1\.id = \$\{userId\}\s*\)/g,
    match => match.replace('AND p.created_by IN', 'AND (p.created_by IS NULL OR p.created_by IN') + ')'
);

content = content.replace(
    /AND created_by IN \([\s\S]*?WHERE d1\.id = \$\{userId\}\s*\)/g,
    match => match.replace('AND created_by IN', 'AND (created_by IS NULL OR created_by IN') + ')'
);

content = content.replace(
    /JOIN devices d2 ON d2\.company_id = d1\.company_id/g,
    'JOIN devices d2 ON d2.company_id = d1.company_id OR (d1.company_id IS NULL AND d2.id = d1.id)'
);

content = content.replace('SELECT pb.*, pv.variant_name', 'SELECT pb.*, pv.name as variant_name');

fs.writeFileSync('app/actions/product-actions.ts', content, 'utf-8');
