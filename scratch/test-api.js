const http = require('http');

http.get('http://localhost:3006/api/debug-db-sales', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
