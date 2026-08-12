"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Copy, Barcode, Check, FileSpreadsheet, Image as ImageIcon, Download } from "lucide-react"
import { encodeNumberAsLetters } from "@/lib/barcode-utils"

interface TagPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  product: {
    id?: number | string
    name?: string
    code?: string
    barcode?: string
    price?: number | string
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
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Extract fields safely
  const productName = product?.name || "Product"
  const productCode = product?.code || (product?.id ? String(product.id).padStart(4, "0") : "0000")
  const barcodeValue = product?.barcode || (product?.code ? String(product.code) : product?.id ? String(product.id) : "")
  
  const rawPrice = typeof product?.price === "number" ? product.price : Number.parseFloat(String(product?.price || "0")) || 0
  const formattedPrice = isNaN(rawPrice) || rawPrice <= 0 ? "0.00" : rawPrice.toFixed(2)
  const priceDisplay = `${currency} ${formattedPrice}`

  const companyShort = product?.company_name ? product.company_name.substring(0, 8) : "MC"
  const wholesalePrice = typeof product?.wholesale_price === "number" ? product.wholesale_price : Number.parseFloat(String(product?.wholesale_price || "0")) || 0
  const encodedCost = wholesalePrice > 0 ? encodeNumberAsLetters(Math.round(wholesalePrice)) : ""

  // Render barcode and visual tag on HTML Canvas for high-quality preview & image clipboard copying
  useEffect(() => {
    if (!isOpen || !product) return

    const drawCanvas = async () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

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
      ctx.roundRect(4, 4, width - 8, height - 8, 6)
      ctx.stroke()

      // Header: Company Logo & Encoded Cost Code
      ctx.fillStyle = "#0f172a"
      ctx.font = "bold 13px sans-serif"
      ctx.fillText(companyShort.toUpperCase(), 12, 22)

      if (encodedCost) {
        ctx.fillStyle = "#475569"
        ctx.font = "bold 10px monospace"
        const textWidth = ctx.measureText(encodedCost).width
        ctx.fillText(encodedCost, width - 14 - textWidth, 22)
      }

      // Divider line 1
      ctx.strokeStyle = "#e2e8f0"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(12, 28)
      ctx.lineTo(width - 12, 28)
      ctx.stroke()

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

          const bcWidth = tempCanvas.width / dpr
          const bcHeight = tempCanvas.height / dpr
          const bcX = (width - bcWidth) / 2
          ctx.drawImage(tempCanvas, bcX, 52, bcWidth, bcHeight)

          // Barcode Text Below Barcode Lines
          ctx.fillStyle = "#1e293b"
          ctx.font = "bold 11px monospace"
          const bcTextWidth = ctx.measureText(barcodeValue).width
          ctx.fillText(barcodeValue, (width - bcTextWidth) / 2, 108)
        } catch (e) {
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
    }

    drawCanvas()
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

  // Copy Whole Tag as Image Blob to Clipboard (Includes Barcode Lines!)
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
          // Fallback: Download PNG if clipboard image write is restricted by browser security
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

  // Copy Tab-Separated Row for Excel/BarTender tables
  const handleCopyTabRow = () => {
    const text = `${productName}\t${productCode}\t${barcodeValue}\t${priceDisplay}\t${encodedCost}`
    copyToClipboard(text, "Tab-Separated Row")
  }

  // Copy Full Text Block
  const handleCopyFullText = () => {
    const text = `Product Name: ${productName}
Product Code: #${productCode}
Barcode: ${barcodeValue || "N/A"}
Price: ${priceDisplay}
Cost Code: ${encodedCost || "N/A"}`

    copyToClipboard(text, "Full Text Tag")
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-[480px] p-6 bg-white">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Barcode className="h-5 w-5 text-emerald-600" />
            BarTender Tag Preview
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Copy the whole tag image (with barcode lines) or individual fields to paste into BarTender.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 flex flex-col items-center justify-center gap-3">
          {/* Main Visual Canvas Tag (Visual rendering matching physical sticker photo) */}
          <div className="flex flex-col items-center justify-center p-2 bg-slate-100 border border-slate-200 rounded-lg shadow-inner">
            <canvas
              ref={canvasRef}
              className="w-[330px] h-[150px] bg-white rounded shadow-sm"
              style={{ width: "330px", height: "150px" }}
            />
          </div>

          {/* Primary Action: Copy Whole Tag Image (With Barcode Lines!) */}
          <div className="grid grid-cols-2 gap-2 w-full pt-1">
            <Button
              onClick={handleCopyWholeTagImage}
              variant="default"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-10 shadow-sm"
            >
              {copiedField === "Whole Tag Image" ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  Copied Tag Image!
                </>
              ) : (
                <>
                  <ImageIcon className="mr-1.5 h-4 w-4" />
                  Copy Whole Tag (Image)
                </>
              )}
            </Button>

            <Button
              onClick={handleDownloadTagImage}
              variant="outline"
              className="w-full border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold h-10"
            >
              <Download className="mr-1.5 h-4 w-4 text-slate-600" />
              Download Tag PNG
            </Button>
          </div>

          {/* Individual Field Quick-Copy Grid */}
          <div className="w-full bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Click to Copy Text Fields:
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              {/* Copy Barcode */}
              <button
                type="button"
                onClick={() => copyToClipboard(barcodeValue, "Barcode")}
                className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-500 text-[11px]">Barcode:</span>
                <span className="font-mono font-bold text-slate-800 truncate ml-1">{barcodeValue || "N/A"}</span>
              </button>

              {/* Copy Price */}
              <button
                type="button"
                onClick={() => copyToClipboard(priceDisplay, "Price")}
                className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-500 text-[11px]">Price:</span>
                <span className="font-mono font-bold text-emerald-700 truncate ml-1">{priceDisplay}</span>
              </button>

              {/* Copy Product Code */}
              <button
                type="button"
                onClick={() => copyToClipboard(productCode, "Product Code")}
                className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-500 text-[11px]">Code:</span>
                <span className="font-mono font-bold text-slate-800 truncate ml-1">#{productCode}</span>
              </button>

              {/* Copy Product Name */}
              <button
                type="button"
                onClick={() => copyToClipboard(productName, "Product Name")}
                className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-left"
              >
                <span className="text-slate-500 text-[11px]">Name:</span>
                <span className="font-bold text-slate-800 truncate ml-1 max-w-[90px]">{productName}</span>
              </button>
            </div>
          </div>

          {copies > 1 && (
            <p className="text-xs text-slate-500 italic">
              Requested Copies: <span className="font-semibold text-slate-700">{copies} stickers</span>
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col pt-2 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button
              onClick={handleCopyTabRow}
              variant="secondary"
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium h-9 border border-slate-200"
            >
              {copiedField === "Tab-Separated Row" ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  Copied Row!
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                  Copy Row (Tabbed)
                </>
              )}
            </Button>

            <Button
              onClick={handleCopyFullText}
              variant="outline"
              className="w-full text-slate-700 text-xs font-medium h-9 border border-slate-200"
            >
              {copiedField === "Full Text Tag" ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  Copied Text!
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy Text Block
                </>
              )}
            </Button>
          </div>

          <Button
            onClick={onClose}
            variant="outline"
            className="w-full text-xs text-slate-600 h-9"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
