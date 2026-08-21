"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import {
  Printer,
  Check,
  Image as ImageIcon,
  Download,
  ExternalLink,
} from "lucide-react"
import {
  encodeNumberAsLetters,
  printBarcodeSticker,
  sendPrintJobToBarTender,
} from "@/lib/barcode-utils"

interface TagPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  product: {
    id?: number | string
    name?: string
    code?: string
    barcode?: string
    price?: number | string
    mrp?: number | string
    msp?: number | string
    wholesale_price?: number | string
    company_name?: string
    batch_number?: string
    batchNumber?: string
  } | null
  copies?: number
  currency?: string
}

export function TagPreviewModal({
  isOpen,
  onClose,
  product,
  copies = 1,
  currency = "INR",
}: TagPreviewModalProps) {
  const { toast } = useToast()
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [stickerQuantity, setStickerQuantity] = useState<number>(copies || 1)
  const [isSendingToBarTender, setIsSendingToBarTender] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Sync stickerQuantity when copies prop changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setStickerQuantity(copies || 1)
    }
  }, [isOpen, copies])

  // Extract fields safely
  const productName = product?.name || "Product"
  const productCode = product?.code || (product?.id ? String(product.id).padStart(4, "0") : "0000")
  const barcodeValue = product?.barcode || (product?.code ? String(product.code) : product?.id ? String(product.id) : "")
  
  const rawPrice = (typeof product?.mrp === "number" ? product.mrp : Number.parseFloat(String(product?.mrp || "")) || 0) || 
                   (typeof product?.price === "number" ? product.price : Number.parseFloat(String(product?.price || "")) || 0)
  const formattedPrice = isNaN(rawPrice) || rawPrice <= 0 ? "0.00" : rawPrice.toFixed(2)
  const priceDisplay = `${currency} ${formattedPrice}`

  const categoryOrCompany = product?.company_name || (product as any)?.category_name || (product as any)?.category || (product as any)?.brand || "MC"
  const companyShort = String(categoryOrCompany).substring(0, 14)
  const wholesalePrice = typeof product?.wholesale_price === "number" ? product.wholesale_price : Number.parseFloat(String(product?.wholesale_price || "0")) || 0
  const encodedCost = wholesalePrice > 0 ? encodeNumberAsLetters(Math.round(wholesalePrice)) : ""

  // Quantity handlers
  const handleDecrease = () => {
    setStickerQuantity((prev) => Math.max(1, prev - 1))
  }

  const handleIncrease = () => {
    setStickerQuantity((prev) => prev + 1)
  }

  // Direct thermal sticker printing (via hidden iframe, no popup tab)
  const handlePrintStickers = () => {
    if (!product) return
    printBarcodeSticker(product, currency, stickerQuantity)
  }

  // Direct BarTender Application Print Trigger (via COM / CLI / Local Print Agent)
  const handleSendToBarTender = async () => {
    if (!product) return
    setIsSendingToBarTender(true)
    try {
      const res = await sendPrintJobToBarTender({
        productId: product.id || productCode,
        productCode: productCode,
        productName: productName,
        price: rawPrice,
        barcode: barcodeValue,
        quantity: stickerQuantity,
      })

      if (res.success) {
        toast({
          title: "Sent to BarTender Application",
          description: res.message || `Print job for ${stickerQuantity} labels sent directly to BarTender.`,
        })
      } else {
        toast({
          title: "BarTender Integration Notice",
          description: res.error || "BarTender service not reachable on local PC. Standard thermal sticker print is ready.",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({
        title: "BarTender Error",
        description: err.message || "Failed to send print job to BarTender application.",
        variant: "destructive",
      })
    } finally {
      setIsSendingToBarTender(false)
    }
  }

  // Render barcode and visual tag on HTML Canvas for high-quality preview & image clipboard copying
  useEffect(() => {
    if (!isOpen || !product) return

    let isSubscribed = true

    const drawCanvas = async () => {
      if (!isSubscribed) return
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      try {
        const dpr = 2 // 2x Retina sharpness
        const width = 330
        const height = 150

        canvas.width = width * dpr
        canvas.height = height * dpr

        ctx.save()
        ctx.scale(dpr, dpr)

        // Background
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, width, height)

        // Outer Rounded Border
        ctx.strokeStyle = "#0f172a"
        ctx.lineWidth = 2
        ctx.beginPath()
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(4, 4, width - 8, height - 8, 6)
        } else {
          ctx.rect(4, 4, width - 8, height - 8)
        }
        ctx.stroke()

        // Header: Company Logo & Encoded Cost Code
        ctx.fillStyle = "#0f172a"
        ctx.font = "bold 12px sans-serif"
        ctx.textBaseline = "middle"
        ctx.fillText(companyShort.toUpperCase(), 12, 18)

        if (encodedCost) {
          ctx.fillStyle = "#475569"
          ctx.font = "bold 10px monospace"
          ctx.textBaseline = "middle"
          const textWidth = ctx.measureText(encodedCost).width
          ctx.fillText(encodedCost, width - 14 - textWidth, 18)
        }

        // Divider line 1
        ctx.strokeStyle = "#e2e8f0"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(12, 29)
        ctx.lineTo(width - 12, 29)
        ctx.stroke()

        ctx.textBaseline = "alphabetic"

        // Product Name & Code
        ctx.fillStyle = "#0f172a"
        ctx.font = "bold 13px sans-serif"
        const truncatedName = productName.length > 22 ? productName.substring(0, 20) + "..." : productName
        ctx.fillText(truncatedName, 12, 45)

        ctx.fillStyle = "#334155"
        ctx.font = "bold 12px monospace"
        const codeText = `#${productCode}`
        const codeWidth = ctx.measureText(codeText).width
        ctx.fillText(codeText, width - 12 - codeWidth, 45)

        // Render Barcode Lines using JsBarcode onto a temporary canvas
        if (barcodeValue && typeof window !== "undefined") {
          try {
            const JsBarcode = (await import("jsbarcode")).default
            const tempCanvas = document.createElement("canvas")
            
            JsBarcode(tempCanvas, barcodeValue, {
              format: "CODE128",
              width: 1.8,
              height: 42,
              displayValue: false,
              margin: 0,
            })

            const bcWidth = tempCanvas.width / 2
            const bcHeight = tempCanvas.height / 2
            const bcX = (width - bcWidth) / 2
            ctx.drawImage(tempCanvas, bcX, 52, bcWidth, bcHeight)

            // Barcode Text Below Barcode Lines
            ctx.fillStyle = "#1e293b"
            ctx.font = "bold 11px monospace"
            const bcTextWidth = ctx.measureText(barcodeValue).width
            ctx.fillText(barcodeValue, (width - bcTextWidth) / 2, 108)
          } catch (e) {
            console.error("Barcode draw error:", e)
            ctx.fillStyle = "#d97706"
            ctx.font = "italic 11px sans-serif"
            ctx.fillText("Barcode unavailable", 12, 85)
          }
        } else {
          ctx.fillStyle = "#d97706"
          ctx.font = "italic 11px sans-serif"
          ctx.fillText("Barcode unavailable", 12, 85)
        }

        // Divider line 2
        ctx.strokeStyle = "#e2e8f0"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(12, 116)
        ctx.lineTo(width - 12, 116)
        ctx.stroke()

        // Price Footer
        ctx.fillStyle = "#64748b"
        ctx.font = "bold 10px sans-serif"
        ctx.fillText("PRICE", 12, 134)

        ctx.fillStyle = "#0f172a"
        ctx.font = "bold 15px monospace"
        const priceWidth = ctx.measureText(priceDisplay).width
        ctx.fillText(priceDisplay, width - 12 - priceWidth, 135)

        ctx.restore()
      } catch (err) {
        console.error("Canvas draw exception:", err)
      }
    }

    drawCanvas()
    const timer1 = setTimeout(drawCanvas, 50)
    const timer2 = setTimeout(drawCanvas, 200)

    return () => {
      isSubscribed = false
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [isOpen, product, barcodeValue, companyShort, encodedCost, productName, productCode, priceDisplay])

  if (!product) return null

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      toast({
        title: `Copied ${fieldName}`,
        description: `"${text}" copied to clipboard.`,
      })
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard.",
        variant: "destructive",
      })
    }
  }

  // Copy Whole Tag as Image Blob to Clipboard
  const handleCopyWholeTagImage = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast({ title: "Copy Failed", description: "Could not generate image blob.", variant: "destructive" })
          return
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ])
          setCopiedField("Whole Tag Image")
          toast({
            title: "Copied Whole Tag Image!",
            description: "Entire tag with barcode lines copied to clipboard. Press Ctrl+V in BarTender or Paint to paste.",
          })
          setTimeout(() => setCopiedField(null), 2500)
        } catch {
          handleDownloadTagImage()
        }
      }, "image/png")
    } catch (err: any) {
      toast({
        title: "Copy Error",
        description: err.message || "Failed to copy image",
        variant: "destructive",
      })
    }
  }

  // Download Tag Image as PNG
  const handleDownloadTagImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement("a")
    link.download = `Tag_${productCode}_${barcodeValue || "label"}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
    toast({
      title: "Tag Image Saved",
      description: `Downloaded Tag_${productCode}.png to your PC.`,
    })
  }

  // Download BarTender Data CSV for this specific product tag
  const handleDownloadCSV = () => {
    const safeProductName = productName.replace(/[^a-zA-Z0-9_-]/g, "_")
    const fileName = `Tag_${productCode}_${safeProductName}_Data.csv`
    const headers = "Company,ProductName,ProductCode,Barcode,Price,CostCode\n"
    const row = `"${companyShort.replace(/"/g, '""')}","${productName.replace(/"/g, '""')}","${productCode}","${barcodeValue}","${priceDisplay}","${encodedCost}"\n`
    const blob = new Blob([headers + row], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.download = fileName
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
    toast({
      title: `Downloaded ${fileName}`,
      description: `Saved matching data CSV for BarTender Database Connection.`,
    })
  }

  // Download BarTender .BTW Template for this specific product tag
  const handleDownloadBTW = async () => {
    const safeProductName = productName.replace(/[^a-zA-Z0-9_-]/g, "_")
    const fileName = `Tag_${productCode}_${safeProductName}.btw`

    try {
      const response = await fetch("/templates/bartendertemplate.btw")
      if (!response.ok) throw new Error("Template file not found")
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)

      toast({
        title: `Downloaded ${fileName}`,
        description: `Saved BarTender tag file for "${productName}". Open with BarTender Designer.`,
      })
    } catch {
      const link = document.createElement("a")
      link.download = fileName
      link.href = "/templates/bartendertemplate.btw"
      link.click()
      toast({
        title: `Downloaded ${fileName}`,
        description: `Saved ${fileName} to PC. Open with BarTender Designer.`,
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-[480px] p-6 bg-white border border-slate-200 rounded-xl shadow-xl">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="text-emerald-600 font-mono font-black text-lg tracking-tighter flex items-center leading-none">
              |||||
            </span>
            BarTender Tag Preview
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Print thermal stickers directly from this popup or copy high-DPI tag image fields.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 flex flex-col items-center justify-center gap-3">
          {/* Main Visual Canvas Tag */}
          <div className="flex flex-col items-center justify-center p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl shadow-inner w-full">
            <canvas
              ref={canvasRef}
              className="w-[330px] h-[150px] bg-white rounded-lg shadow-sm border border-slate-200"
              style={{ width: "330px", height: "150px" }}
            />
          </div>

          {/* BarTender Tag Studio Section */}
          <div className="w-full bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 flex flex-col items-center gap-3">
            <h4 className="text-center font-bold text-slate-800 text-sm">BarTender Tag Studio</h4>

            {/* Quantity Controls */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDecrease}
                  disabled={stickerQuantity <= 1}
                  className="w-9 h-9 flex items-center justify-center border border-slate-300 rounded-lg text-slate-600 font-bold bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-colors text-lg"
                >
                  -
                </button>

                <div className="flex flex-col items-center justify-center w-16 h-10 bg-white border border-slate-300 rounded-lg shadow-sm px-1">
                  <input
                    type="number"
                    min={1}
                    value={stickerQuantity}
                    onChange={(e) => setStickerQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-center font-bold text-slate-900 text-base focus:outline-none bg-transparent"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleIncrease}
                  className="w-9 h-9 flex items-center justify-center border border-slate-300 rounded-lg text-slate-600 font-bold bg-white hover:bg-slate-100 shadow-sm transition-colors text-lg"
                >
                  +
                </button>
              </div>
              <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                {stickerQuantity === 1 ? "1 sticker" : `${stickerQuantity} stickers`}
              </span>
            </div>

            {/* Print Action Buttons */}
            <div className="w-full space-y-2">
              {/* 1. Direct Thermal Print */}
              <Button
                onClick={handlePrintStickers}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Print Thermal Stickers ({stickerQuantity})
              </Button>

              {/* 2. Direct BarTender Application Print Trigger */}
              <Button
                onClick={handleSendToBarTender}
                disabled={isSendingToBarTender}
                variant="outline"
                className="w-full border-blue-300 bg-blue-50/70 hover:bg-blue-100 text-blue-700 font-bold h-10 text-xs rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-blue-600" />
                {isSendingToBarTender
                  ? "Sending to BarTender App..."
                  : `Send directly to BarTender App (${stickerQuantity})`}
              </Button>
            </div>

            {/* BarTender Designer Template & CSV Download Options */}
            <div className="flex items-center justify-between w-full pt-1.5 border-t border-slate-200/80 text-[11px] text-slate-500">
              <span className="font-medium text-slate-400">BarTender Designer Files:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadBTW}
                  className="text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  .BTW Template
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  className="text-amber-600 hover:text-amber-800 font-semibold hover:underline flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Data CSV
                </button>
              </div>
            </div>
          </div>

          {/* Image Clipboard / Download Action Grid */}
          <div className="grid grid-cols-2 gap-2.5 w-full">
            <Button
              onClick={handleCopyWholeTagImage}
              variant="outline"
              className="w-full border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold h-10 rounded-lg flex items-center justify-center gap-2"
            >
              {copiedField === "Whole Tag Image" ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  Copied Tag Image!
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4 text-slate-500" />
                  Copy Tag Image
                </>
              )}
            </Button>

            <Button
              onClick={handleDownloadTagImage}
              variant="outline"
              className="w-full border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold h-10 rounded-lg flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4 text-slate-500" />
              Download Tag PNG
            </Button>
          </div>

          {/* Quick Copy Text Fields Container */}
          <div className="w-full bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              CLICK TO COPY TEXT FIELDS:
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Barcode */}
              <button
                type="button"
                onClick={() => copyToClipboard(barcodeValue, "Barcode")}
                className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200/80 rounded-lg hover:bg-emerald-50/50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-400 text-xs font-medium">Barcode:</span>
                <span className="font-mono font-bold text-slate-900 text-xs truncate ml-1">{barcodeValue || "N/A"}</span>
              </button>

              {/* Price */}
              <button
                type="button"
                onClick={() => copyToClipboard(priceDisplay, "Price")}
                className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200/80 rounded-lg hover:bg-emerald-50/50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-400 text-xs font-medium">Price:</span>
                <span className="font-mono font-bold text-emerald-600 text-xs truncate ml-1">{priceDisplay}</span>
              </button>

              {/* Code */}
              <button
                type="button"
                onClick={() => copyToClipboard(productCode, "Product Code")}
                className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200/80 rounded-lg hover:bg-emerald-50/50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-400 text-xs font-medium">Code:</span>
                <span className="font-mono font-bold text-slate-900 text-xs truncate ml-1">#{productCode}</span>
              </button>

              {/* Name */}
              <button
                type="button"
                onClick={() => copyToClipboard(productName, "Product Name")}
                className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200/80 rounded-lg hover:bg-emerald-50/50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-400 text-xs font-medium">Name:</span>
                <span className="font-bold text-slate-900 text-xs truncate ml-1 max-w-[100px]">{productName}</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
