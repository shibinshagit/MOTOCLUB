"use client"

import { useState } from "react"
import { Share2, Check, Copy, MessageCircle, Send, Mail, Link2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { formatShareProductMessage } from "@/lib/share-product"
import { createProductShareLink } from "@/app/actions/product-share-actions"
import { useToast } from "@/components/ui/use-toast"

interface ShareProductButtonProps {
  product: any
  currency?: string
  currentDeviceId?: number
  className?: string
}

export function ShareProductButton({ product, currency = "AED", currentDeviceId, className }: ShareProductButtonProps) {
  const { toast } = useToast()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [includeStock, setIncludeStock] = useState(false)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [productUrl, setProductUrl] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const [isLinkCopied, setIsLinkCopied] = useState(false)

  const getProductUrl = async () => {
    if (productUrl) return productUrl
    if (!product?.id || !currentDeviceId) return ""

    setIsGeneratingLink(true)
    try {
      const result = await createProductShareLink(product.id, currentDeviceId)
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

  const handleShareClick = async () => {
    // Attempt Web Share API first
    if (navigator.share) {
      try {
        const url = await getProductUrl()
        const text = formatShareProductMessage(product, { includeStock, productUrl: url, currency })
        
        await navigator.share({
          title: `Product: ${product.name}`,
          text: text,
        })
        return
      } catch (error: any) {
        // If user cancelled, don't show the fallback
        if (error.name === 'AbortError') return
        console.error("Native share failed, falling back to modal", error)
      }
    }
    
    // Fallback to custom modal
    setIsModalOpen(true)
  }

  const getShareText = async () => {
    const url = await getProductUrl()
    return formatShareProductMessage(product, { includeStock, productUrl: url, currency })
  }

  const handleWhatsApp = async () => {
    const text = await getShareText()
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
  }

  const handleTelegram = async () => {
    const text = await getShareText()
    const url = productUrl || ""
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank")
  }

  const handleEmail = async () => {
    const text = await getShareText()
    window.open(`mailto:?subject=${encodeURIComponent(`Product Details: ${product.name}`)}&body=${encodeURIComponent(text)}`, "_blank")
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
        variant: "destructive"
      })
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
        Share Product
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
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
                <span className="text-xs text-gray-500">Show current stock quantity in the message</span>
              </Label>
              <Switch
                id="include-stock"
                checked={includeStock}
                onCheckedChange={setIncludeStock}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handleWhatsApp} variant="outline" className="flex items-center justify-start gap-2 h-12 hover:bg-[#25D366] hover:text-white hover:border-[#25D366] transition-colors">
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </Button>
              <Button onClick={handleTelegram} variant="outline" className="flex items-center justify-start gap-2 h-12 hover:bg-[#0088cc] hover:text-white hover:border-[#0088cc] transition-colors">
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

            <div className="mt-2">
              <Button onClick={handleCopyLink} variant="secondary" className="w-full flex items-center justify-center gap-2 h-12">
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
