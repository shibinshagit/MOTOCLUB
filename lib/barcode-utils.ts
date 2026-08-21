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

// Print barcode sticker directly using a hidden iframe without opening a new browser tab/window
export function printBarcodeSticker(product: any, currency = "AED", initialCopies = 1) {
  if (!product || typeof window === "undefined") return

  const productCode = product.code || (product.id ? product.id.toString().padStart(4, "0") : "0000")
  const rawPrice = (typeof product.mrp === "number" ? product.mrp : Number.parseFloat(String(product.mrp || "")) || 0) || 
                   (typeof product.price === "number" ? product.price : Number.parseFloat(String(product.price || "")) || 0)
  const price = rawPrice.toFixed(2)

  let barcodeValue = product.barcode || product.code || (product.id ? String(product.id) : "")
  if (!barcodeValue || !validateEAN13(barcodeValue)) {
    barcodeValue = generateEAN13()
  }

  const wholesalePrice = typeof product.wholesale_price === "number" ? product.wholesale_price : Number.parseFloat(String(product.wholesale_price || "0")) || 0
  const encodedWholesalePrice = wholesalePrice > 0 ? encodeNumberAsLetters(Math.round(wholesalePrice)) : ""

  const categoryOrCompany = product.company_name || product.category_name || product.category || product.brand || "Company"
  const companyName = truncateText(String(categoryOrCompany), 20)
  const productName = truncateText(product.name || "Product", 20)

  // Remove existing print iframe if present
  const existingFrame = document.getElementById("direct-sticker-print-iframe")
  if (existingFrame) {
    existingFrame.remove()
  }

  // Create an invisible print iframe
  const iframe = document.createElement("iframe")
  iframe.id = "direct-sticker-print-iframe"
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0px"
  iframe.style.height = "0px"
  iframe.style.border = "0px"
  iframe.style.visibility = "hidden"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  let stickerRows = ""
  for (let i = 0; i < initialCopies; i++) {
    if (i % 2 === 0) stickerRows += '<div class="sticker-row">'

    const barcodeId = `barcode_${i}`
    stickerRows += `
      <div class="sticker">
        <div class="header-row">
          <div class="company-name">${companyName}</div>
          ${encodedWholesalePrice ? `<div class="encoded-price">${encodedWholesalePrice}</div>` : ""}
        </div>
        <div class="product-info">
          <div class="product-name">${productName}</div>
          <div class="product-code">#${productCode}</div>
        </div>
        <div class="barcode-box">
          <svg class="barcode" id="${barcodeId}"></svg>
        </div>
        <div class="barcode-number">${barcodeValue}</div>
        <div class="price-container">${currency} ${price}</div>
      </div>
    `

    if (i % 2 === 1 || i === initialCopies - 1) stickerRows += '</div>'
  }

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print Label</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2mm; background: white; color: #0f172a; }
        .sticker-row { display: flex; gap: 4mm; margin-bottom: 4mm; page-break-inside: avoid; }
        .sticker {
          width: 34mm; height: 23mm;
          border: 1px solid #000; border-radius: 2mm;
          padding: 1mm; display: flex; flex-direction: column;
          justify-content: space-between; background: white; box-sizing: border-box;
          position: relative;
        }
        .header-row { display: flex; justify-content: space-between; align-items: center; }
        .company-name { font-size: 6.5pt; font-weight: bold; line-height: 1.2; overflow: visible; text-transform: uppercase; }
        .encoded-price { font-size: 5.5pt; font-weight: bold; font-family: monospace; color: #475569; }
        .product-info { display: flex; justify-content: space-between; font-size: 7.5pt; font-weight: bold; margin-top: 0.5mm; }
        .product-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 20mm; }
        .product-code { font-family: monospace; }
        .barcode-box { width: 100%; height: 9mm; display: flex; align-items: center; justify-content: center; margin: 0.5mm 0; }
        .barcode { width: 100% !important; height: 100% !important; max-width: 32mm !important; }
        .barcode-number { font-size: 6.5pt; text-align: center; font-weight: bold; font-family: monospace; letter-spacing: 0.5px; margin-bottom: 0.5mm; }
        .price-container { text-align: right; font-size: 8.5pt; font-weight: bold; font-family: monospace; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    </head>
    <body>
      ${stickerRows}
      <script>
        function runPrint() {
          try {
            for (var i = 0; i < ${initialCopies}; i++) {
              JsBarcode("#barcode_" + i, "${barcodeValue}", {
                format: "CODE128", width: 1.8, height: 35, displayValue: false, margin: 0, flat: true
              });
            }
          } catch(e) {
            console.error(e);
          }
          setTimeout(function() {
            try {
              window.focus();
              window.print();
            } catch(e) {
              console.error(e);
            }
          }, 200);
        }
        if (typeof JsBarcode !== 'undefined') {
          runPrint();
        } else {
          window.onload = runPrint;
        }
      </script>
    </body>
    </html>
  `)
  doc.close()
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
  const rawFirstPrice = (typeof firstProduct.mrp === "number" ? firstProduct.mrp : Number.parseFloat(String(firstProduct.mrp || "")) || 0) || 
                        (typeof firstProduct.price === "number" ? firstProduct.price : Number.parseFloat(String(firstProduct.price || "")) || 0)
  const firstPrice = rawFirstPrice.toFixed(2)
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
    const rawPrice = (typeof product.mrp === "number" ? product.mrp : Number.parseFloat(String(product.mrp || "")) || 0) || 
                     (typeof product.price === "number" ? product.price : Number.parseFloat(String(product.price || "")) || 0)
    const price = rawPrice.toFixed(2)

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
      <title>Tag Studio Batch - ${totalStickers} stickers</title>
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
          border: 1px solid #000; border-radius: 2mm;
          padding: 0.5mm 0.5mm 1mm 0.5mm; display: flex; flex-direction: column;
          justify-content: space-between; background: white;
          position: relative;
        }
        .company-name { font-size: 6.5pt; font-weight: bold; text-align: center; margin-bottom: 0.5mm; line-height: 1.2; overflow: visible; padding-top: 0.2mm; }
        .encoded-price { position: absolute; top: 0.5mm; right: 0.5mm; font-size: 4pt; }
        .product-info { display: flex; justify-content: space-between; font-size: 7pt; font-weight: bold; padding: 0 0.5mm; margin-bottom: 0.5mm; }
        .product-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 18mm; }
        .product-code { white-space: nowrap; }
        .barcode { width: 31mm; height: 10mm; display: block; }
        .barcode-number { font-size: 6pt; text-align: center; font-weight: bold; letter-spacing: 0.5px; margin: 0.5mm 0; }
        .price-container { text-align: center; font-size: 9pt; font-weight: bold; }
        @media print { body { background: white; padding: 0; } .no-print { display: none !important; } }
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
          const dpr = 3;
          const width = 330;
          const height = 150;

          canvas.width = width * dpr;
          canvas.height = height * dpr;

          ctx.save();
          ctx.scale(dpr, dpr);

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);

          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(4, 4, width - 8, height - 8, 6);
          } else {
            ctx.rect(4, 4, width - 8, height - 8);
          }
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(firstProductData.companyName.toUpperCase(), 12, 22);

          if (firstProductData.encodedPrice) {
            ctx.fillStyle = '#475569';
            ctx.font = 'bold 10px monospace';
            const costWidth = ctx.measureText(firstProductData.encodedPrice).width;
            ctx.fillText(firstProductData.encodedPrice, width - 14 - costWidth, 22);
          }

          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(12, 28);
          ctx.lineTo(width - 12, 28);
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 13px sans-serif';
          const nameTruncated = firstProductData.productName.length > 22 ? firstProductData.productName.substring(0, 20) + '...' : firstProductData.productName;
          ctx.fillText(nameTruncated, 12, 45);

          ctx.fillStyle = '#334155';
          ctx.font = 'bold 12px monospace';
          const codeText = '#' + firstProductData.productCode;
          const codeWidth = ctx.measureText(codeText).width;
          ctx.fillText(codeText, width - 12 - codeWidth, 45);

          if (firstProductData.barcodeValue) {
            try {
              const tempCanvas = document.createElement('canvas');
              JsBarcode(tempCanvas, firstProductData.barcodeValue, {
                format: "CODE128", width: 1.8, height: 42, displayValue: false, margin: 0
              });
              const bcWidth = tempCanvas.width / 2;
              const bcHeight = tempCanvas.height / 2;
              const bcX = (width - bcWidth) / 2;
              ctx.drawImage(tempCanvas, bcX, 52, bcWidth, bcHeight);

              ctx.fillStyle = '#1e293b';
              ctx.font = 'bold 11px monospace';
              const numWidth = ctx.measureText(firstProductData.barcodeValue).width;
              ctx.fillText(firstProductData.barcodeValue, (width - numWidth) / 2, 108);
            } catch(e) {
              console.error(e);
            }
          }

          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(12, 116);
          ctx.lineTo(width - 12, 116);
          ctx.stroke();

          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('PRICE', 12, 134);

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 15px monospace';
          const priceStr = firstProductData.currency + ' ' + firstProductData.price;
          const priceWidth = ctx.measureText(priceStr).width;
          ctx.fillText(priceStr, width - 12 - priceWidth, 135);

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
  mrp?: number | string
  msp?: number | string
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
