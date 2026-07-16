import re

def fix_product_actions():
    with open('app/actions/product-actions.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # In createProduct, remove fields from INSERT INTO products
    # We will use regex to find the INSERT INTO products (...) VALUES (...) block inside createProduct
    insert_pattern = re.compile(r'INSERT INTO products\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*RETURNING \*', re.DOTALL)
    
    def replacer(match):
        cols_str = match.group(1)
        vals_str = match.group(2)
        
        cols = [c.strip() for c in cols_str.split(',')]
        vals = [v.strip() for v in vals_str.split(',')]
        
        fields_to_remove = ['price', 'wholesale_price', 'msp', 'shelf', 'color', 'size', 'barcode', 'stock', 'has_variants', 'is_batch_managed']
        
        new_cols = []
        new_vals = []
        
        for c, v in zip(cols, vals):
            if c not in fields_to_remove:
                new_cols.append(c)
                new_vals.append(v)
                
        new_cols_str = ',\n            '.join(new_cols)
        new_vals_str = ',\n            '.join(new_vals)
        
        return f'INSERT INTO products (\n            {new_cols_str}\n          )\n          VALUES (\n            {new_vals_str}\n          )\n          RETURNING *'

    content = insert_pattern.sub(replacer, content)
    
    # Also updateProduct UPDATE products SET ...
    update_pattern = re.compile(r'UPDATE products\s*SET\s*(.*?)\s*WHERE id = \$\{id\}\s*RETURNING \*', re.DOTALL)
    
    def update_replacer(match):
        set_str = match.group(1)
        assignments = [a.strip() for a in set_str.split(',')]
        
        fields_to_remove = ['price', 'wholesale_price', 'msp', 'shelf', 'color', 'size', 'barcode', 'stock', 'has_variants', 'is_batch_managed']
        
        new_assignments = []
        for a in assignments:
            col_name = a.split('=')[0].strip()
            if col_name not in fields_to_remove:
                new_assignments.append(a)
                
        new_set_str = ',\n            '.join(new_assignments)
        
        return f'UPDATE products\n          SET\n            {new_set_str}\n          WHERE id = ${{id}}\n          RETURNING *'

    content = update_pattern.sub(update_replacer, content)
    
    with open('app/actions/product-actions.ts', 'w', encoding='utf-8') as f:
        f.write(content)
        
fix_product_actions()
