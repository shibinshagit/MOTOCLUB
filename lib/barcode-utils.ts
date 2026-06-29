"use client"

// Generate a valid EAN-13 barcode with proper check digit
export function generateEAN13(): string {
  let code = "200"
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10).toString()
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number.parseInt(code[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return code + checkDigit
}

// Validate an EAN-13 barcode
export function validateEAN13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) {
    return false
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number.parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const calculatedCheckDigit = (10 - (sum % 10)) % 10
  return calculatedCheckDigit === Number.parseInt(barcode[12])
}

// Function to encode a number using Alphabetic Digit Cipher
export function encodeNumberAsLetters(num: number): string {
  if (num <= 0) return ""
  const numStr = num.toString()
  let result = ""
  for (let i = 0; i < numStr.length; i++) {
    const digit = Number.parseInt(numStr[i])
    if (digit === 0) {
      result += "J"
    } else {
      result += String.fromCharCode(64 + digit)
    }
  }
  return result
}

// Function to truncate text with ellipsis based on max length
function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + "..."
}

// Print barcode sticker with quantity control
export function printBarcodeSticker(product: any, currency = "AED") {
  if (!product) return

  const productCode = product.id ? product.id.toString().padStart(4, "0") : "0000"
  const price = typeof product.price === "number" ? product.price.toFixed(2) : (Number.parseFloat(product.price || "0") || 0).toFixed(2)

  let barcodeValue = product.barcode || ""
  if (!barcodeValue || !validateEAN13(barcodeValue)) {
    barcodeValue = generateEAN13()
  }

  const wholesalePrice = typeof product.wholesale_price === "number" ? product.wholesale_price : Number.parseFloat(product.wholesale_price || "0") || 0
  const encodedWholesalePrice = encodeNumberAsLetters(Math.round(wholesalePrice))

  // Truncate long names
  const companyName = truncateText(product.company_name || "Company", 20)
  const productName = truncateText(product.name || "Product", 15) // Max 15 chars for product name

  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    alert("Please allow pop-ups to print price tags")
    return
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>TVS LP40 Price Tag - ${productName}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: Arial, sans-serif; width: 80mm; padding: 2mm; background: #f0f0f0; }
        .controls { position: fixed; top: 10px; right: 10px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); z-index: 1000; min-width: 200px; }
        .quantity-control { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 15px 0; }
        .quantity-btn { width: 40px; height: 40px; border: 2px solid #2196F3; background: white; color: #2196F3; font-size: 24px; font-weight: bold; border-radius: 4px; cursor: pointer; }
        .quantity-btn:hover { background: #2196F3; color: white; }
        .quantity-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .quantity-display { font-size: 24px; font-weight: bold; min-width: 50px; text-align: center; padding: 8px; border: 2px solid #ddd; border-radius: 4px; }
        .print-button { padding: 12px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; width: 100%; margin-top: 10px; }
        .print-button:hover { background: #45a049; }
        .sticker-row { display: flex; gap: 4mm; margin-bottom: 4mm; }
        .sticker { width: 32mm; height: 22mm; border: 1px solid #000; border-radius: 2mm; padding: 0.5mm 0.5mm 1mm 0.5mm; display: flex; flex-direction: column; justify-content: space-between; background: white; position: relative; }
        .company-name { font-size: 6pt; font-weight: bold; text-align: center; margin-bottom: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .encoded-price { position: absolute; top: 0.5mm; right: 0.5mm; font-size: 4pt; font-weight: bold; }
        .product-info { display: flex; justify-content: space-between; font-size: 7pt; font-weight: bold; padding: 0 0.5mm; margin-bottom: 0.5mm; }
        .product-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 18mm; }
        .product-code { white-space: nowrap; }
        .barcode { width: 31mm; height: 10mm; display: flex; align-items: center; justify-content: center; }
        .barcode svg { width: 100% !important; height: 100% !important; max-width: 31mm !important; }
        .barcode svg { width: 100% !important; height: 100% !important; }
        .barcode-number { font-size: 6pt; text-align: center; font-weight: bold; letter-spacing: 0.5px; margin: 0.5mm 0; }
        .price-container { text-align: center; font-size: 9pt; font-weight: bold; }
        @media print { body { background: white; padding: 0; } .no-print { display: none !important; } }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    </head>
    <body>
      <div class="controls no-print">
        <h3 style="margin-bottom: 10px; text-align: center;">Print Stickers</h3>
        <div style="text-align: center; font-size: 14px; color: #666; margin-bottom: 5px;">Quantity</div>
        <div class="quantity-control">
          <button class="quantity-btn" id="decreaseBtn" onclick="updateQuantity(-1)">−</button>
          <div class="quantity-display" id="quantityDisplay">1</div>
          <button class="quantity-btn" onclick="updateQuantity(1)">+</button>
        </div>
        <div style="text-align: center; font-size: 12px; color: #888; margin-bottom: 10px;">
          <span id="rowsInfo">1 sticker</span>
        </div>
        <button class="print-button" onclick="window.print()">Print</button>
      </div>
      
      <div id="stickerContainer"></div>

      <script>
        let currentQuantity = 1;
        const productData = {
          companyName: "${companyName.replace(/"/g, '\\"')}",
          encodedPrice: "${encodedWholesalePrice}",
          productName: "${productName.replace(/"/g, '\\"')}",
          productCode: "${productCode}",
          barcodeValue: "${barcodeValue}",
          currency: "${currency}",
          price: "${price}"
        };
        
        function updateQuantity(change) {
          currentQuantity = Math.max(1, currentQuantity + change);
          document.getElementById('quantityDisplay').textContent = currentQuantity;
          document.getElementById('decreaseBtn').disabled = currentQuantity <= 1;
          
          const rows = Math.ceil(currentQuantity / 2);
          const stickerText = currentQuantity === 1 ? '1 sticker' : currentQuantity + ' stickers';
          const rowText = rows === 1 ? '1 row' : rows + ' rows';
          document.getElementById('rowsInfo').textContent = stickerText + ' (' + rowText + ')';
          
          renderStickers();
        }
        
        function renderStickers() {
          const container = document.getElementById('stickerContainer');
          let html = '';
          
          for (let i = 0; i < currentQuantity; i++) {
            if (i % 2 === 0) html += '<div class="sticker-row">';
            
            html += '<div class="sticker">' +
              '<div class="company-name">' + productData.companyName + '</div>' +
              (productData.encodedPrice ? '<div class="encoded-price">' + productData.encodedPrice + '</div>' : '') +
              '<div class="product-info">' +
                '<div class="product-name">' + productData.productName + '</div>' +
                '<div class="product-code">#' + productData.productCode + '</div>' +
              '</div>' +
              '<svg class="barcode" id="barcode' + i + '"></svg>' +
              '<div class="barcode-number">' + productData.barcodeValue + '</div>' +
              '<div class="price-container">' + productData.currency + ' ' + productData.price + '</div>' +
            '</div>';
            
            if (i % 2 === 1 || i === currentQuantity - 1) html += '</div>';
          }
          
          container.innerHTML = html;
          
          for (let i = 0; i < currentQuantity; i++) {
            JsBarcode("#barcode" + i, productData.barcodeValue, {
              format: "EAN13", width: 2.8, height: 50, displayValue: false, margin: 0, flat: true
            });
          }
        }
        
        renderStickers();
        document.getElementById('decreaseBtn').disabled = true;
      </script>
    </body>
    </html>
  `)

  printWindow.document.close()
}

// Print multiple stickers (at most 2 per row)
export function printMultipleBarcodeStickers(products: any[], copies = 1, currency = "AED") {
  if (!products || products.length === 0) return

  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    alert("Please allow pop-ups to print price tags")
    return
  }

  let stickerRows = ""
  let barcodeScripts = ""
  let barcodeIndex = 0
  let totalStickers = 0

  products.forEach((product) => {
    const productCode = product.id ? product.id.toString().padStart(4, "0") : "0000"
    const price = typeof product.price === "number" ? product.price.toFixed(2) : (Number.parseFloat(product.price || "0") || 0).toFixed(2)

    let barcodeValue = product.barcode || ""
    if (!barcodeValue || !validateEAN13(barcodeValue)) {
      barcodeValue = generateEAN13()
    }

    const wholesalePrice = typeof product.wholesale_price === "number" ? product.wholesale_price : Number.parseFloat(product.wholesale_price || "0") || 0
    const encodedWholesalePrice = encodeNumberAsLetters(Math.round(wholesalePrice))

    // Truncate long names for multiple stickers
    const companyName = truncateText(product.company_name || "Company", 20)
    const productName = truncateText(product.name || "Product", 15)

    for (let copy = 0; copy < copies; copy++) {
      if (totalStickers % 2 === 0) {
        stickerRows += '<div class="sticker-row">'
      }

      const barcodeId = `barcode${barcodeIndex}`
      barcodeIndex++
      totalStickers++

      stickerRows += `
        <div class="sticker">
          <div class="company-name">${companyName}</div>
          ${encodedWholesalePrice ? `<div class="encoded-price">${encodedWholesalePrice}</div>` : ""}
          <div class="product-info">
            <div class="product-name">${productName}</div>
            <div class="product-code">#${productCode}</div>
          </div>
          <svg class="barcode" id="${barcodeId}"></svg>
          <div class="barcode-number">${barcodeValue}</div>
          <div class="price-container">${currency} ${price}</div>
        </div>
      `

      if (totalStickers % 2 === 0) {
        stickerRows += '</div>'
      }

      barcodeScripts += `
        JsBarcode("#${barcodeId}", "${barcodeValue}", {
          format: "EAN13",
          width: 2.8,
          height: 50,
          displayValue: false,
          margin: 0,
          flat: true
        });
      `
    }
  })

  if (totalStickers % 2 !== 0) {
    stickerRows += '</div>'
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>TVS LP40 Batch Print - ${totalStickers} stickers</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: Arial, sans-serif; width: 80mm; padding: 2mm; }
        .sticker-row { display: flex; gap: 4mm; margin-bottom: 4mm; }
        .sticker {
          width: 32mm; height: 22mm;
          border: 1px solid #000; border-radius: 2mm;
          padding: 0.5mm 0.5mm 1mm 0.5mm; display: flex; flex-direction: column;
          justify-space-between; background: white;
          position: relative;
        }
        .company-name { 
          font-size: 6pt; 
          font-weight: bold; 
          text-align: center; 
          margin-bottom: 0.5mm; 
          white-space: nowrap; 
          overflow: hidden; 
          text-overflow: ellipsis; 
        }
        .encoded-price { position: absolute; top: 0.5mm; right: 0.5mm; font-size: 4pt; }
        .product-info { 
          display: flex; 
          justify-content: space-between; 
          font-size: 7pt; 
          font-weight: bold; 
          padding: 0 0.5mm; 
          margin-bottom: 0.5mm; 
        }
        .product-name { 
          white-space: nowrap; 
          overflow: hidden; 
          text-overflow: ellipsis; 
          max-width: 18mm; 
        }
        .product-code { 
          white-space: nowrap; 
        }
        .barcode { width: 31mm; height: 10mm; display: block; }
        .barcode-number { font-size: 6pt; text-align: center; font-weight: bold; letter-spacing: 0.5px; margin: 0.5mm 0; }
        .price-container { text-align: center; font-size: 9pt; font-weight: bold; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    </head>
    <body>
      ${stickerRows}
      <script>
        ${barcodeScripts}
        setTimeout(() => window.print(), 1500);
      </script>
    </body>
    </html>
  `)

  printWindow.document.close()
}

