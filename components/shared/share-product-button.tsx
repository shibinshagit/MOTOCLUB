"use client"

import { openWhatsApp } from "@/lib/whatsapp-utils"
import { useState, useEffect } from "react"
import { Share2, Check, Copy, MessageCircle, Send, Mail, Link2, Loader2, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { formatShareProductMessage } from "@/lib/share-product"
import { createProductShareLink, getProductAvailableStock } from "@/app/actions/product-share-actions"
import { useToast } from "@/components/ui/use-toast"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"

interface ShareProductButtonProps {
  product: any
  currency?: string
  currentDeviceId?: number
  className?: string
  label?: string
}

export function ShareProductButton({
  product,
  currency = "AED",
  currentDeviceId,
  className,
  label = "Share Product",
}: ShareProductButtonProps) {
  const { toast } = useToast()
  const reduxDeviceId = useSelector(selectDeviceId) as number | undefined
  const effectiveDeviceId = currentDeviceId || reduxDeviceId || product?.created_by

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [includeStock, setIncludeStock] = useState(false)
  const [liveStock, setLiveStock] = useState<number | null>(() => {
    if (product?.stock !== undefined && product?.stock !== null && !isNaN(Number(product.stock))) {
      return Number(product.stock)
    }
    if (product?.company_total_stock !== undefined && product?.company_total_stock !== null && !isNaN(Number(product.company_total_stock))) {
      return Number(product.company_total_stock)
    }
    return null
  })
  const [isLoadingStock, setIsLoadingStock] = useState(false)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [productUrl, setProductUrl] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [hasNativeShare, setHasNativeShare] = useState(false)

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setHasNativeShare(true)
    }
  }, [])

  const getProductUrl = async () => {
    if (productUrl) return productUrl
    if (!product?.id) return ""

    setIsGeneratingLink(true)
    try {
      const result = await createProductShareLink(product.id, effectiveDeviceId)
      if (result.success && result.url) {
        setProductUrl(result.url)
        return result.url
      }
    } catch (error) {
      console.error("Failed to generate share link", error)
    } finally {
      setIsGeneratingLink(false)
    }
    return ""
  }

  // Always open modal dialog so user can customize "Include Available Stock" option
  const handleShareClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setIsModalOpen(true)
  }

  const handleIncludeStockChange = async (checked: boolean) => {
    setIncludeStock(checked)
    if (checked && (liveStock === null || liveStock === 0) && product?.id) {
      setIsLoadingStock(true)
      try {
        const res = await getProductAvailableStock(product.id, effectiveDeviceId)
        if (res.success) {
          setLiveStock(res.stock)
        }
      } catch (err) {
        console.error("Failed to fetch live stock:", err)
      } finally {
        setIsLoadingStock(false)
      }
    }
  }

  const getShareText = async () => {
    const url = await getProductUrl()
    let stockVal = liveStock
    if (includeStock && (stockVal === null || stockVal === 0) && product?.id) {
      try {
        const res = await getProductAvailableStock(product.id, effectiveDeviceId)
        if (res.success) {
          stockVal = res.stock
          setLiveStock(res.stock)
        }
      } catch {
        // Fall back to product properties
      }
    }
    return formatShareProductMessage(product, {
      includeStock,
      productUrl: url,
      currency,
      customStock: stockVal,
    })
  }

  const handleWhatsApp = async () => {
    const text = await getShareText()
    openWhatsApp("", text)
  }

  const handleTelegram = async () => {
    const text = await getShareText()
    const url = productUrl || (await getProductUrl()) || ""
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank")
  }

  const handleEmail = async () => {
    const text = await getShareText()
    window.open(`mailto:?subject=${encodeURIComponent(`Product Details: ${product?.name || "Product"}`)}&body=${encodeURIComponent(text)}`, "_blank")
  }

  const handleCopyDetails = async () => {
    const text = await getShareText()
    await navigator.clipboard.writeText(text)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
    toast({
      title: "Details copied",
      description: "Product details copied to clipboard.",
    })
  }

  const handleCopyLink = async () => {
    const url = await getProductUrl()
    if (url) {
      await navigator.clipboard.writeText(url)
      setIsLinkCopied(true)
      setTimeout(() => setIsLinkCopied(false), 2000)
      toast({
        title: "Link copied",
        description: "Product share link copied to clipboard.",
      })
    } else {
      toast({
        title: "Error",
        description: "Could not generate product link.",
        variant: "destructive",
      })
    }
  }

  const handleNativeShare = async () => {
    if (!navigator.share) return
    try {
      const url = await getProductUrl()
      const text = await getShareText()
      await navigator.share({
        title: `Product: ${product?.name || "Product"}`,
        text: text,
      })
    } catch (error: any) {
      if (error?.name === "AbortError") return
      console.error("Native share failed", error)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShareClick}
        disabled={isGeneratingLink}
        className={className || "h-8 border-violet-200 bg-white px-3 text-xs text-violet-700 hover:bg-violet-50"}
      >
        {isGeneratingLink ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
        )}
        {label}
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          overlayClassName="z-[300] bg-black/60"
          className="z-[300] sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Share Product</DialogTitle>
            <DialogDescription>
              Share {product?.name} details with your customers or team.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between border-b pb-4">
              <Label htmlFor="include-stock" className="flex flex-col gap-1 cursor-pointer">
                <span className="font-medium text-sm">Include Available Stock</span>
                <span className="text-xs text-gray-500">
                  {includeStock ? (
                    isLoadingStock ? (
                      <span className="text-violet-600 animate-pulse">Checking stock...</span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">
                        Stock: {liveStock !== null ? (liveStock > 0 ? `${liveStock} units` : "Out of stock") : "Included"}
                      </span>
                    )
                  ) : (
                    "Show current stock quantity in the message"
                  )}
                </span>
              </Label>
              <Switch
                id="include-stock"
                checked={includeStock}
                onCheckedChange={handleIncludeStockChange}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleWhatsApp}
                variant="outline"
                className="flex items-center justify-start gap-2 h-12 hover:bg-[#25D366] hover:text-white hover:border-[#25D366] transition-colors"
              >
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </Button>
              <Button
                onClick={handleTelegram}
                variant="outline"
                className="flex items-center justify-start gap-2 h-12 hover:bg-[#0088cc] hover:text-white hover:border-[#0088cc] transition-colors"
              >
                <Send className="h-5 w-5" />
                Telegram
              </Button>
              <Button onClick={handleEmail} variant="outline" className="flex items-center justify-start gap-2 h-12">
                <Mail className="h-5 w-5 text-gray-500" />
                Email
              </Button>
              <Button onClick={handleCopyDetails} variant="outline" className="flex items-center justify-start gap-2 h-12">
                {isCopied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-gray-500" />}
                {isCopied ? "Copied" : "Copy Details"}
              </Button>
            </div>

            {hasNativeShare && (
              <Button
                onClick={handleNativeShare}
                variant="outline"
                className="w-full flex items-center justify-center gap-2 h-11 border-violet-200 text-violet-700 hover:bg-violet-50"
              >
                <Smartphone className="h-4 w-4" />
                Share via Device (More Apps)
              </Button>
            )}

            <div className="mt-1">
              <Button onClick={handleCopyLink} variant="secondary" className="w-full flex items-center justify-center gap-2 h-11">
                {isLinkCopied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
                {isLinkCopied ? "Link Copied" : "Copy Product Link Only"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
