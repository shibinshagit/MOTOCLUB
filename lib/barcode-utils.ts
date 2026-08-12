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

// Print barcode sticker with quantity control and BarTender export options
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
      <title>Tag Studio - ${productName} (#${productCode})</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; width: 80mm; padding: 4mm; background: #f8fafc; color: #0f172a; }
        
        .controls {
          position: fixed; top: 12px; right: 12px;
          background: #ffffff; padding: 16px; border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.08);
          z-index: 1000; width: 280px; font-family: system-ui, -apple-system, sans-serif;
          border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 10px;
        }
        
        .controls-header { font-size: 14px; font-weight: 700; color: #0f172a; text-align: center; border-b: 1px solid #f1f5f9; padding-bottom: 6px; }
        .controls-section { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; margin-bottom: 2px; }

        .quantity-control { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 4px 0; }
        .quantity-btn { width: 34px; height: 34px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font-size: 20px; font-weight: bold; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
        .quantity-btn:hover { background: #e2e8f0; }
        .quantity-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .quantity-display { font-size: 18px; font-weight: bold; min-width: 44px; text-align: center; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; }

        .btn {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; width: 100%; border: none; text-align: center;
        }
        .btn-print { background: #16a34a; color: #ffffff; font-weight: 700; }
        .btn-print:hover { background: #15803d; }

        .btn-copy-image { background: #059669; color: #ffffff; font-weight: 700; }
        .btn-copy-image:hover { background: #047857; }

        .btn-download-png { background: #0f172a; color: #ffffff; }
        .btn-download-png:hover { background: #1e293b; }

        .btn-csv { background: #f59e0b; color: #ffffff; }
        .btn-csv:hover { background: #d97706; }

        .btn-btw { background: #2563eb; color: #ffffff; }
        .btn-btw:hover { background: #1d4ed8; }

        .btn-outline { background: #ffffff; color: #334155; border: 1px solid #cbd5e1; font-size: 11px; }
        .btn-outline:hover { background: #f1f5f9; border-color: #94a3b8; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: 100%; }

        .toast {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
          background: #0f172a; color: #ffffff; padding: 10px 18px; border-radius: 8px;
          font-size: 12px; font-weight: 600; box-shadow: 0 10px 20px rgba(0,0,0,0.2);
          z-index: 9999; display: none; opacity: 0; transition: opacity 0.25s ease-in-out;
        }

        .sticker-row { display: flex; gap: 4mm; margin-bottom: 4mm; }
        .sticker {
          width: 32mm; height: 22mm;
          border: 2px solid #000000; border-radius: 1.5mm;
          padding: 0.8mm; display: flex; flex-direction: column;
          justify-content: space-between; background: #ffffff; color: #000000;
          position: relative; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif;
        }
        .company-name { font-size: 7.5pt; font-weight: 900; color: #000000; text-align: center; margin-bottom: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; letter-spacing: 0.3px; }
        .encoded-price { position: absolute; top: 0.5mm; right: 0.8mm; font-size: 6pt; font-weight: 900; color: #000000; font-family: monospace; }
        .product-info { display: flex; justify-content: space-between; font-size: 8pt; font-weight: 900; color: #000000; padding: 0 0.5mm; margin-bottom: 0.5mm; }
        .product-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 18mm; font-weight: 900; color: #000000; }
        .product-code { white-space: nowrap; font-family: monospace; font-weight: 900; color: #000000; }
        .barcode { width: 30mm; height: 10mm; display: flex; align-items: center; justify-content: center; }
        .barcode svg { width: 100% !important; height: 100% !important; max-width: 30mm !important; }
        .barcode-number { font-size: 7.5pt; text-align: center; font-weight: 900; color: #000000; font-family: monospace; letter-spacing: 0.5px; margin: 0.5mm 0; }
        .price-container { text-align: center; font-size: 10pt; font-weight: 900; color: #000000; font-family: monospace; }

        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: #000000 !important; font-weight: 900 !important; }
          body { background: white; padding: 0; margin: 0; }
          .no-print { display: none !important; }
          .sticker { border: 2px solid #000000 !important; color: #000000 !important; background: #ffffff !important; }
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    </head>
    <body>
      <div id="toastNotification" class="toast"></div>

      <!-- Controls Panel -->
      <div class="controls no-print">
        <div class="controls-header">BarTender Tag Studio</div>
        
        <div class="quantity-control">
          <button class="quantity-btn" id="decreaseBtn" onclick="updateQuantity(-1)">−</button>
          <div class="quantity-display" id="quantityDisplay">1</div>
          <button class="quantity-btn" onclick="updateQuantity(1)">+</button>
        </div>
        <div style="text-align: center; font-size: 11px; color: #64748b;">
          <span id="rowsInfo">1 sticker</span>
        </div>

        <button class="btn btn-print" onclick="window.print()">
          🖨️ Print Stickers
        </button>

        <div class="controls-section">BarTender Designer Options</div>

        <button class="btn btn-copy-image" onclick="copyWholeTagImage()">
          📋 Copy Whole Tag (Image)
        </button>
        <div style="font-size: 10px; color: #64748b; margin-top: -4px; line-height: 1.2;">
          *Click copy & press Ctrl+V directly in BarTender Designer
        </div>

        <div class="grid-2">
          <button class="btn btn-download-png" onclick="downloadTagImage()">
            💾 Tag PNG
          </button>
          <button class="btn btn-csv" onclick="downloadBarTenderCSV()">
            📊 CSV Data
          </button>
        </div>

        <button class="btn btn-btw" onclick="downloadBTWTemplate()">
          🏷️ Download .BTW Template
        </button>

        <div class="controls-section">Quick Copy Text</div>
        <div class="grid-2">
          <button class="btn btn-outline" onclick="copyBarcode()">
            Barcode
          </button>
          <button class="btn btn-outline" onclick="copyTabRow()">
            Tabbed Row
          </button>
        </div>
      </div>
      
      <div id="stickerContainer"></div>

      <!-- Canvas for image generation -->
      <canvas id="exportCanvas" style="display:none;"></canvas>

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

        function showToast(message) {
          const toast = document.getElementById('toastNotification');
          if (!toast) return;
          toast.textContent = message;
          toast.style.display = 'block';
          setTimeout(() => { toast.style.opacity = '1'; }, 10);
          setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
          }, 3200);
        }

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
              format: "EAN13", width: 2.8, height: 48, displayValue: false, margin: 0, flat: true, lineColor: "#000000"
            });
          }

          drawExportCanvas();
        }

        function drawExportCanvas() {
          const canvas = document.getElementById('exportCanvas');
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          const dpr = 4;
          const width = 330;
          const height = 150;

          canvas.width = width * dpr;
          canvas.height = height * dpr;

          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.imageSmoothingEnabled = false;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(4, 4, width - 8, height - 8, 6);
          } else {
            ctx.rect(4, 4, width - 8, height - 8);
          }
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 15px Arial, sans-serif';
          ctx.fillText(productData.companyName.toUpperCase(), 12, 23);

          if (productData.encodedPrice) {
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 12px monospace';
            const costWidth = ctx.measureText(productData.encodedPrice).width;
            ctx.fillText(productData.encodedPrice, width - 14 - costWidth, 23);
          }

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(12, 30);
          ctx.lineTo(width - 12, 30);
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 15px Arial, sans-serif';
          const nameTruncated = productData.productName.length > 20 ? productData.productName.substring(0, 18) + '...' : productData.productName;
          ctx.fillText(nameTruncated, 12, 47);

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 13px monospace';
          const codeText = '#' + productData.productCode;
          const codeWidth = ctx.measureText(codeText).width;
          ctx.fillText(codeText, width - 12 - codeWidth, 47);

          if (productData.barcodeValue) {
            try {
              const tempCanvas = document.createElement('canvas');
              JsBarcode(tempCanvas, productData.barcodeValue, {
                format: "CODE128", width: 2.2, height: 48, displayValue: false, margin: 0, lineColor: "#000000"
              });
              const bcWidth = Math.min(width - 32, tempCanvas.width / 2);
              const bcHeight = 44;
              const bcX = (width - bcWidth) / 2;
              ctx.drawImage(tempCanvas, bcX, 52, bcWidth, bcHeight);

              ctx.fillStyle = '#000000';
              ctx.font = 'bold 13px monospace';
              const numWidth = ctx.measureText(productData.barcodeValue).width;
              ctx.fillText(productData.barcodeValue, (width - numWidth) / 2, 111);
            } catch(e) {
              console.error(e);
            }
          }

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(12, 118);
          ctx.lineTo(width - 12, 118);
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 12px Arial, sans-serif';
          ctx.fillText('PRICE', 12, 137);

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 17px monospace';
          const priceStr = productData.currency + ' ' + productData.price;
          const priceWidth = ctx.measureText(priceStr).width;
          ctx.fillText(priceStr, width - 12 - priceWidth, 137);

          ctx.restore();
        }

        async function copyWholeTagImage() {
          const canvas = document.getElementById('exportCanvas');
          if (!canvas) return;
          try {
            canvas.toBlob(async function(blob) {
              if (!blob) {
                showToast('❌ Could not create image blob');
                return;
              }
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': blob })
                ]);
                showToast('📋 Copied Tag Image! Press Ctrl+V in BarTender Designer.');
              } catch(err) {
                downloadTagImage();
                showToast('⚠️ Clipboard restricted. Downloaded Tag PNG instead!');
              }
            }, 'image/png');
          } catch(e) {
            showToast('Error: ' + e.message);
          }
        }

        function downloadTagImage() {
          const canvas = document.getElementById('exportCanvas');
          if (!canvas) return;
          const link = document.createElement('a');
          link.download = 'Tag_' + productData.productCode + '_' + (productData.barcodeValue || 'label') + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          showToast('💾 Downloaded Tag PNG!');
        }

        function downloadBarTenderCSV() {
          const csvContent = "Company,ProductName,ProductCode,Barcode,Price,CostCode\\n" +
            \`"\${productData.companyName.replace(/"/g, '""')}","\${productData.productName.replace(/"/g, '""')}","\${productData.productCode}","\${productData.barcodeValue}","\${productData.currency} \${productData.price}","\${productData.encodedPrice}"\\n\`;
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.download = 'Tag_' + productData.productCode + '_BarTenderData.csv';
          link.href = URL.createObjectURL(blob);
          link.click();
          showToast('📊 Downloaded BarTender Data CSV!');
        }

        function downloadBTWTemplate() {
          const link = document.createElement('a');
          link.download = 'bartendertemplate.btw';
          link.href = '/templates/bartendertemplate.btw';
          link.click();
          showToast('🏷️ Downloaded BarTender .BTW Template!');
        }

        function copyBarcode() {
          navigator.clipboard.writeText(productData.barcodeValue).then(() => {
            showToast('📋 Copied Barcode: ' + productData.barcodeValue);
          });
        }

        function copyTabRow() {
          const row = productData.productName + '\\t' + productData.productCode + '\\t' + productData.barcodeValue + '\\t' + productData.currency + ' ' + productData.price + '\\t' + productData.encodedPrice;
          navigator.clipboard.writeText(row).then(() => {
            showToast('📋 Copied Tabbed Data Row!');
          });
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
  
  const firstProduct = products[0]
  const firstCode = firstProduct.id ? firstProduct.id.toString().padStart(4, "0") : "0000"
  const firstPrice = typeof firstProduct.price === "number" ? firstProduct.price.toFixed(2) : (Number.parseFloat(firstProduct.price || "0") || 0).toFixed(2)
  let firstBarcode = firstProduct.barcode || ""
  if (!firstBarcode || !validateEAN13(firstBarcode)) {
    firstBarcode = generateEAN13()
  }
  const firstWholesale = typeof firstProduct.wholesale_price === "number" ? firstProduct.wholesale_price : Number.parseFloat(firstProduct.wholesale_price || "0") || 0
  const firstEncodedWholesale = encodeNumberAsLetters(Math.round(firstWholesale))
  const firstCompanyName = truncateText(firstProduct.company_name || "Company", 20)
  const firstProductName = truncateText(firstProduct.name || "Product", 15)

  // Generate CSV data for all items in batch
  let csvRows = "Company,ProductName,ProductCode,Barcode,Price,CostCode\n"

  products.forEach((product) => {
    const productCode = product.id ? product.id.toString().padStart(4, "0") : "0000"
    const price = typeof product.price === "number" ? product.price.toFixed(2) : (Number.parseFloat(product.price || "0") || 0).toFixed(2)

    let barcodeValue = product.barcode || ""
    if (!barcodeValue || !validateEAN13(barcodeValue)) {
      barcodeValue = generateEAN13()
    }

    const wholesalePrice = typeof product.wholesale_price === "number" ? product.wholesale_price : Number.parseFloat(product.wholesale_price || "0") || 0
    const encodedWholesalePrice = encodeNumberAsLetters(Math.round(wholesalePrice))

    const companyName = truncateText(product.company_name || "Company", 20)
    const productName = truncateText(product.name || "Product", 15)

    csvRows += `"${companyName.replace(/"/g, '""')}","${productName.replace(/"/g, '""')}","${productCode}","${barcodeValue}","${currency} ${price}","${encodedWholesalePrice}"\n`

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
          height: 48,
          displayValue: false,
          margin: 0,
          flat: true,
          lineColor: "#000000"
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
      <title>Tag Studio Batch - ${totalStickers} stickers</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: Arial, Helvetica, sans-serif; width: 80mm; padding: 4mm; background: #f8fafc; color: #000000; }
        .controls {
          position: fixed; top: 12px; right: 12px;
          background: #ffffff; padding: 16px; border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.08);
          z-index: 1000; width: 280px; font-family: system-ui, -apple-system, sans-serif;
          border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 10px;
        }
        .controls-header { font-size: 14px; font-weight: 700; color: #0f172a; text-align: center; border-b: 1px solid #f1f5f9; padding-bottom: 6px; }
        .controls-section { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; margin-bottom: 2px; }

        .btn {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; width: 100%; border: none; text-align: center;
        }
        .btn-print { background: #16a34a; color: #ffffff; font-weight: 700; }
        .btn-print:hover { background: #15803d; }

        .btn-copy-image { background: #059669; color: #ffffff; font-weight: 700; }
        .btn-copy-image:hover { background: #047857; }

        .btn-download-png { background: #0f172a; color: #ffffff; }
        .btn-download-png:hover { background: #1e293b; }

        .btn-csv { background: #f59e0b; color: #ffffff; }
        .btn-csv:hover { background: #d97706; }

        .btn-btw { background: #2563eb; color: #ffffff; }
        .btn-btw:hover { background: #1d4ed8; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: 100%; }

        .toast {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
          background: #0f172a; color: #ffffff; padding: 10px 18px; border-radius: 8px;
          font-size: 12px; font-weight: 600; box-shadow: 0 10px 20px rgba(0,0,0,0.2);
          z-index: 9999; display: none; opacity: 0; transition: opacity 0.25s ease-in-out;
        }

        .sticker-row { display: flex; gap: 4mm; margin-bottom: 4mm; }
        .sticker {
          width: 32mm; height: 22mm;
          border: 2px solid #000000; border-radius: 1.5mm;
          padding: 0.8mm; display: flex; flex-direction: column;
          justify-content: space-between; background: #ffffff; color: #000000;
          position: relative; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif;
        }
        .company-name { font-size: 7.5pt; font-weight: 900; color: #000000; text-align: center; margin-bottom: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; letter-spacing: 0.3px; }
        .encoded-price { position: absolute; top: 0.5mm; right: 0.8mm; font-size: 6pt; font-weight: 900; color: #000000; font-family: monospace; }
        .product-info { display: flex; justify-content: space-between; font-size: 8pt; font-weight: 900; color: #000000; padding: 0 0.5mm; margin-bottom: 0.5mm; }
        .product-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 18mm; font-weight: 900; color: #000000; }
        .product-code { white-space: nowrap; font-family: monospace; font-weight: 900; color: #000000; }
        .barcode { width: 30mm; height: 10mm; display: flex; align-items: center; justify-content: center; }
        .barcode svg { width: 100% !important; height: 100% !important; max-width: 30mm !important; }
        .barcode-number { font-size: 7.5pt; text-align: center; font-weight: 900; color: #000000; font-family: monospace; letter-spacing: 0.5px; margin: 0.5mm 0; }
        .price-container { text-align: center; font-size: 10pt; font-weight: 900; color: #000000; font-family: monospace; }

        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: #000000 !important; font-weight: 900 !important; }
          body { background: white; padding: 0; margin: 0; }
          .no-print { display: none !important; }
          .sticker { border: 2px solid #000000 !important; color: #000000 !important; background: #ffffff !important; }
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    </head>
    <body>
      <div id="toastNotification" class="toast"></div>

      <div class="controls no-print">
        <div class="controls-header">BarTender Batch Studio</div>
        <div style="text-align: center; font-size: 12px; color: #64748b; margin-bottom: 4px;">
          Total: <strong>${totalStickers} stickers</strong>
        </div>

        <button class="btn btn-print" onclick="window.print()">
          🖨️ Print Batch (${totalStickers})
        </button>

        <div class="controls-section">BarTender Designer Actions</div>

        <button class="btn btn-copy-image" onclick="copyWholeTagImage()">
          📋 Copy First Tag (Image)
        </button>
        <div style="font-size: 10px; color: #64748b; margin-top: -4px; line-height: 1.2;">
          *Paste into BarTender with Ctrl+V
        </div>

        <button class="btn btn-csv" onclick="downloadBatchCSV()">
          📊 Download Batch CSV Data
        </button>

        <button class="btn btn-btw" onclick="downloadBTWTemplate()">
          🏷️ Download .BTW Template
        </button>
      </div>

      ${stickerRows}

      <canvas id="exportCanvas" style="display:none;"></canvas>

      <script>
        const firstProductData = {
          companyName: "${firstCompanyName.replace(/"/g, '\\"')}",
          encodedPrice: "${firstEncodedWholesale}",
          productName: "${firstProductName.replace(/"/g, '\\"')}",
          productCode: "${firstCode}",
          barcodeValue: "${firstBarcode}",
          currency: "${currency}",
          price: "${firstPrice}"
        };

        const batchCsvData = \`${csvRows.replace(/`/g, "\\`")}\`;

        function showToast(message) {
          const toast = document.getElementById('toastNotification');
          if (!toast) return;
          toast.textContent = message;
          toast.style.display = 'block';
          setTimeout(() => { toast.style.opacity = '1'; }, 10);
          setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
          }, 3200);
        }

        ${barcodeScripts}

        function drawExportCanvas() {
          const canvas = document.getElementById('exportCanvas');
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          const dpr = 4;
          const width = 330;
          const height = 150;

          canvas.width = width * dpr;
          canvas.height = height * dpr;

          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.imageSmoothingEnabled = false;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(4, 4, width - 8, height - 8, 6);
          } else {
            ctx.rect(4, 4, width - 8, height - 8);
          }
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 15px Arial, sans-serif';
          ctx.fillText(firstProductData.companyName.toUpperCase(), 12, 23);

          if (firstProductData.encodedPrice) {
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 12px monospace';
            const costWidth = ctx.measureText(firstProductData.encodedPrice).width;
            ctx.fillText(firstProductData.encodedPrice, width - 14 - costWidth, 23);
          }

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(12, 30);
          ctx.lineTo(width - 12, 30);
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 15px Arial, sans-serif';
          const nameTruncated = firstProductData.productName.length > 20 ? firstProductData.productName.substring(0, 18) + '...' : firstProductData.productName;
          ctx.fillText(nameTruncated, 12, 47);

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 13px monospace';
          const codeText = '#' + firstProductData.productCode;
          const codeWidth = ctx.measureText(codeText).width;
          ctx.fillText(codeText, width - 12 - codeWidth, 47);

          if (firstProductData.barcodeValue) {
            try {
              const tempCanvas = document.createElement('canvas');
              JsBarcode(tempCanvas, firstProductData.barcodeValue, {
                format: "CODE128", width: 2.2, height: 48, displayValue: false, margin: 0, lineColor: "#000000"
              });
              const bcWidth = Math.min(width - 32, tempCanvas.width / 2);
              const bcHeight = 44;
              const bcX = (width - bcWidth) / 2;
              ctx.drawImage(tempCanvas, bcX, 52, bcWidth, bcHeight);

              ctx.fillStyle = '#000000';
              ctx.font = 'bold 13px monospace';
              const numWidth = ctx.measureText(firstProductData.barcodeValue).width;
              ctx.fillText(firstProductData.barcodeValue, (width - numWidth) / 2, 111);
            } catch(e) {
              console.error(e);
            }
          }

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(12, 118);
          ctx.lineTo(width - 12, 118);
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 12px Arial, sans-serif';
          ctx.fillText('PRICE', 12, 137);

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 17px monospace';
          const priceStr = firstProductData.currency + ' ' + firstProductData.price;
          const priceWidth = ctx.measureText(priceStr).width;
          ctx.fillText(priceStr, width - 12 - priceWidth, 137);

          ctx.restore();
        }

        async function copyWholeTagImage() {
          drawExportCanvas();
          const canvas = document.getElementById('exportCanvas');
          if (!canvas) return;
          try {
            canvas.toBlob(async function(blob) {
              if (!blob) return;
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': blob })
                ]);
                showToast('📋 Copied Tag Image! Press Ctrl+V in BarTender Designer.');
              } catch(err) {
                showToast('⚠️ Clipboard restricted.');
              }
            }, 'image/png');
          } catch(e) {
            showToast('Error: ' + e.message);
          }
        }

        function downloadBatchCSV() {
          const blob = new Blob([batchCsvData], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.download = 'Batch_BarTenderData.csv';
          link.href = URL.createObjectURL(blob);
          link.click();
          showToast('📊 Downloaded Batch CSV for BarTender!');
        }

        function downloadBTWTemplate() {
          const link = document.createElement('a');
          link.download = 'bartendertemplate.btw';
          link.href = '/templates/bartendertemplate.btw';
          link.click();
          showToast('🏷️ Downloaded BarTender .BTW Template!');
        }

        drawExportCanvas();
      </script>
    </body>
    </html>
  `)

  printWindow.document.close()
}

export interface BarTenderPrintPayload {
  productId: string | number
  productCode: string
  productName: string
  price?: number | string
  batchNumber?: string
  quantity: number
  barcode?: string
}

/**
 * Sends a label print job directly to the BarTender API backend
 * or local print agent running on the client's machine.
 */
export async function sendPrintJobToBarTender(payload: BarTenderPrintPayload): Promise<{ success: boolean; message?: string; error?: string }> {
  // 1. Try direct local print agent first (running on staff's Windows PC at http://localhost:9100/print)
  const agentUrl = process.env.NEXT_PUBLIC_BARTENDER_PRINT_AGENT_URL || "http://localhost:9100/print"
  try {
    const agentRes = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (agentRes.ok) {
      const agentData = await agentRes.json()
      if (agentData.success) {
        return {
          success: true,
          message: agentData.message || "Print job sent to BarTender via Local Agent",
        }
      }
    }
  } catch {
    // Local agent not running or unreachable on localhost, fallback to server API route
  }

  // 2. Fallback to Next.js server API route (/api/print/label)
  try {
    const res = await fetch("/api/print/label", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Printing failed with HTTP status ${res.status}`,
      }
    }

    return {
      success: true,
      message: data.message || "Print job sent to BarTender",
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Network error while sending print job to BarTender API.",
    }
  }
}
