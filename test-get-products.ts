import { getProducts } from './app/actions/product-actions';
async function test() {
  const result = await getProducts(4, 10, 'wheel');
  console.log(JSON.stringify(result, null, 2));
}
test();
