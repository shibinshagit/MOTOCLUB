import re

with open('app/actions/product-actions.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'(WHERE p\.created_by IN \([\s\S]*?WHERE d1\.id = \$\{userId\}\s*\))',
    lambda m: m.group(1).replace('WHERE p.created_by IN', 'WHERE (p.created_by IS NULL OR p.created_by IN') + ')',
    content
)

content = re.sub(
    r'(AND p\.created_by IN \([\s\S]*?WHERE d1\.id = \$\{userId\}\s*\))',
    lambda m: m.group(1).replace('AND p.created_by IN', 'AND (p.created_by IS NULL OR p.created_by IN') + ')',
    content
)

content = re.sub(
    r'(AND created_by IN \([\s\S]*?WHERE d1\.id = \$\{userId\}\s*\))',
    lambda m: m.group(1).replace('AND created_by IN', 'AND (created_by IS NULL OR created_by IN') + ')',
    content
)

content = re.sub(
    r'JOIN devices d2 ON d2\.company_id = d1\.company_id',
    'JOIN devices d2 ON d2.company_id = d1.company_id OR (d1.company_id IS NULL AND d2.id = d1.id)',
    content
)

content = content.replace('SELECT pb.*, pv.variant_name', 'SELECT pb.*, pv.name as variant_name')

with open('app/actions/product-actions.ts', 'w', encoding='utf-8') as f:
    f.write(content)
