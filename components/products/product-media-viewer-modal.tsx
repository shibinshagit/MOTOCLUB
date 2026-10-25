"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  Download,
  Film,
  Image as ImageIcon,
  Play,
  RotateCcw,
} from "lucide-react"

export interface MediaItem {
  type: "image" | "video"
  url: string
  title?: string
  thumbnailUrl?: string
}

export interface ProductMediaViewerModalProps {
  isOpen: boolean
  onClose: () => void
  mediaItems?: MediaItem[]
  imageUrls?: string[]
  videoUrl?: string | null
  initialIndex?: number
  productName?: string
  productSku?: string
}

export function ProductMediaViewerModal({
  isOpen,
  onClose,
  mediaItems: propMediaItems,
  imageUrls,
  videoUrl,
  initialIndex = 0,
  productName = "Product Media",
  productSku,
}: ProductMediaViewerModalProps) {
  // Normalize media items from either mediaItems prop or imageUrls + videoUrl
  const allItems = useMemo<MediaItem[]>(() => {
    if (propMediaItems && propMediaItems.length > 0) {
      return propMediaItems.filter((item) => item.url && item.url.trim().length > 0)
    }

    const items: MediaItem[] = []
    if (Array.isArray(imageUrls)) {
      imageUrls.forEach((url, idx) => {
        if (typeof url === "string" && url.trim().length > 0) {
          items.push({
            type: "image",
            url: url.trim(),
            title: `${productName} - Photo ${idx + 1}`,
          })
        }
      })
    }

    if (typeof videoUrl === "string" && videoUrl.trim().length > 0) {
      items.push({
        type: "video",
        url: videoUrl.trim(),
        title: `${productName} - Video`,
      })
    }

    return items
  }, [propMediaItems, imageUrls, videoUrl, productName])

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoomLevel, setZoomLevel] = useState(1) // 1x to 4x
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
  const [isDragging, setIsDragging] = useState(false)
  const [mounted, setMounted] = useState(false)

  const backdropRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Sync initial index when modal opens or initialIndex changes
  useEffect(() => {
    if (isOpen) {
      const validIndex = Math.max(0, Math.min(initialIndex, Math.max(0, allItems.length - 1)))
      setCurrentIndex(validIndex)
      setZoomLevel(1)
      setPan({ x: 0, y: 0 })
      setRotation(0)
    }
  }, [isOpen, initialIndex, allItems.length])

  // Reset zoom & pan when navigating to different media
  const resetZoom = useCallback(() => {
    setZoomLevel(1)
    setPan({ x: 0, y: 0 })
    setRotation(0)
    setIsDragging(false)
  }, [])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  const currentItem = allItems[currentIndex]
  const isImage = currentItem?.type === "image"
  const isVideo = currentItem?.type === "video"

  const handlePrev = useCallback(() => {
    if (allItems.length <= 1) return
    setCurrentIndex((prev) => (prev - 1 + allItems.length) % allItems.length)
    resetZoom()
  }, [allItems.length, resetZoom])

  const handleNext = useCallback(() => {
    if (allItems.length <= 1) return
    setCurrentIndex((prev) => (prev + 1) % allItems.length)
    resetZoom()
  }, [allItems.length, resetZoom])

  const handleZoomIn = useCallback(() => {
    if (!isImage) return
    setZoomLevel((prev) => Math.min(4, +(prev + 0.5).toFixed(2)))
  }, [isImage])

  const handleZoomOut = useCallback(() => {
    if (!isImage) return
    setZoomLevel((prev) => {
      const next = Math.max(1, +(prev - 0.5).toFixed(2))
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [isImage])

  const handleToggleZoom = useCallback(() => {
    if (!isImage) return
    if (zoomLevel > 1) {
      setZoomLevel(1)
      setPan({ x: 0, y: 0 })
    } else {
      setZoomLevel(2)
    }
  }, [isImage, zoomLevel])

  const handleRotate = useCallback(() => {
    if (!isImage) return
    setRotation((prev) => (prev + 90) % 360)
  }, [isImage])

  const handleDownload = useCallback(async () => {
    if (!currentItem?.url) return
    try {
      const response = await fetch(currentItem.url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = blobUrl
      const ext = isVideo ? "mp4" : "jpg"
      link.download = `${productName.replace(/[^a-zA-Z0-9_-]/g, "_")}-${currentIndex + 1}.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(currentItem.url, "_blank")
    }
  }, [currentItem, currentIndex, isVideo, productName])

  // Mouse wheel zoom on stage (preventing window scroll)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !isOpen || !isImage) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.3 : -0.3
      setZoomLevel((prev) => {
        const next = Math.min(4, Math.max(1, +(prev + delta).toFixed(2)))
        if (next === 1) {
          setPan({ x: 0, y: 0 })
        }
        return next
      })
    }

    stage.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      stage.removeEventListener("wheel", handleWheel)
    }
  }, [isOpen, isImage])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrev()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        handleNext()
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        handleZoomIn()
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        handleZoomOut()
      } else if (e.key === "0" || e.key === "r" || e.key === "R") {
        e.preventDefault()
        resetZoom()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, handlePrev, handleNext, handleZoomIn, handleZoomOut, resetZoom])

  // Mouse drag handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || zoomLevel <= 1 || !isImage) return
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1 || !isImage) return
    e.preventDefault()
    const newX = e.clientX - dragStartRef.current.x
    const newY = e.clientY - dragStartRef.current.y
    setPan({ x: newX, y: newY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }
      if (zoomLevel > 1 && isImage) {
        setIsDragging(true)
        dragStartRef.current = {
          x: touch.clientX - pan.x,
          y: touch.clientY - pan.y,
        }
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && zoomLevel > 1 && isImage) {
      const touch = e.touches[0]
      const newX = touch.clientX - dragStartRef.current.x
      const newY = touch.clientY - dragStartRef.current.y
      setPan({ x: newX, y: newY })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false)
    if (zoomLevel === 1 && touchStartRef.current) {
      const touch = e.changedTouches[0]
      const diffX = touch.clientX - touchStartRef.current.x
      const diffY = touch.clientY - touchStartRef.current.y
      const elapsed = Date.now() - touchStartRef.current.time

      if (elapsed < 400 && Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        if (diffX < 0) {
          handleNext()
        } else {
          handlePrev()
        }
      }
    }
    touchStartRef.current = null
  }

  // Backdrop click handler to close modal when clicking outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose()
    }
  }

  if (!isOpen || !mounted) return null

  const modalContent = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm select-none animate-in fade-in duration-150"
    >
      {/* Centered Modal Card */}
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3 bg-white shrink-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <h3 className="truncate text-sm sm:text-base font-bold text-slate-800">
              {productName}
            </h3>
            {productSku ? (
              <span className="hidden rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 border border-slate-200 sm:inline-block">
                {productSku}
              </span>
            ) : null}
            {allItems.length > 0 ? (
              <span className="rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-xs font-semibold text-brand-blue border border-brand-blue/20">
                {currentIndex + 1} of {allItems.length}
              </span>
            ) : null}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isImage ? (
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1}
                  className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  title="Zoom Out (-)"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 hover:bg-white rounded transition"
                  title="Reset Zoom (0 or R)"
                  aria-label="Reset Zoom"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 4}
                  className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  title="Zoom In (+)"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {isImage ? (
              <button
                type="button"
                onClick={handleRotate}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                title="Rotate 90° Clockwise"
                aria-label="Rotate image"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            ) : null}

            {currentItem?.url ? (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="hidden sm:flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                  title="Download Media"
                  aria-label="Download Media"
                >
                  <Download className="h-4 w-4" />
                </button>
                <a
                  href={currentItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                  title="Open in New Tab"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Media Viewing Stage */}
        <div
          ref={stageRef}
          className="relative flex-1 min-h-[340px] sm:min-h-[460px] max-h-[62vh] bg-slate-950 flex items-center justify-center overflow-hidden"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {allItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-slate-400 p-8">
              <ImageIcon className="h-16 w-16 mb-2 stroke-[1.2] text-slate-600" />
              <p className="text-sm font-medium">No media uploaded for this product</p>
            </div>
          ) : isVideo ? (
            <div className="relative max-h-full max-w-full flex items-center justify-center p-4">
              <video
                key={currentItem.url}
                controls
                autoPlay
                playsInline
                className="max-h-[56vh] max-w-[85vw] sm:max-w-[75vw] rounded-xl shadow-2xl bg-black border border-white/10"
              >
                <source src={currentItem.url} />
                Your browser does not support the video tag.
              </video>
            </div>
          ) : (
            <div
              className="relative flex items-center justify-center h-full w-full p-4"
              style={{
                cursor:
                  zoomLevel > 1
                    ? isDragging
                      ? "grabbing"
                      : "grab"
                    : "zoom-in",
              }}
              onDoubleClick={handleToggleZoom}
            >
              <img
                key={currentItem.url}
                src={currentItem.url}
                alt={currentItem.title || productName}
                draggable={false}
                className="max-h-[56vh] max-w-[85%] object-contain select-none drop-shadow-xl rounded"
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transition: isDragging ? "none" : "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
                  transformOrigin: "center center",
                }}
              />
            </div>
          )}

          {/* Previous Arrow Button */}
          {allItems.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handlePrev()
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-30 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-slate-900/80 border border-white/20 text-white backdrop-blur-md shadow-xl hover:bg-slate-800 hover:scale-105 active:scale-95 transition"
              title="Previous (Left Arrow)"
              aria-label="Previous Media"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          ) : null}

          {/* Next Arrow Button */}
          {allItems.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleNext()
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-slate-900/80 border border-white/20 text-white backdrop-blur-md shadow-xl hover:bg-slate-800 hover:scale-105 active:scale-95 transition"
              title="Next (Right Arrow)"
              aria-label="Next Media"
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          ) : null}

          {/* Stage Overlays (Zoom / Mode Info) */}
          {isImage && zoomLevel > 1 ? (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[11px] font-mono text-cyan-400 backdrop-blur-sm border border-white/10">
              <span>Zoom {Math.round(zoomLevel * 100)}%</span>
            </div>
          ) : null}

          {isImage ? (
            <div className="absolute bottom-3 left-3 hidden sm:flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] text-slate-300 backdrop-blur-sm border border-white/10">
              <span>Scroll to zoom • Double-click to toggle • Drag to pan</span>
            </div>
          ) : null}
        </div>

        {/* Modal Footer / Thumbnail Strip (only if multiple items) */}
        {allItems.length > 1 ? (
          <div className="flex items-center justify-center border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-2.5 shrink-0">
            <div className="flex min-w-0 items-center justify-center gap-2 overflow-x-auto py-0.5 no-scrollbar">
              {allItems.map((item, idx) => {
                const isActive = idx === currentIndex
                return (
                  <button
                    key={`${item.url}-${idx}`}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx)
                      resetZoom()
                    }}
                    className={`group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                      isActive
                        ? "border-brand-blue ring-2 ring-brand-blue/30 scale-105 shadow-sm"
                        : "border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300"
                    }`}
                    title={item.title || `Media ${idx + 1}`}
                  >
                    {item.type === "video" ? (
                      <div className="relative h-full w-full bg-slate-800 flex items-center justify-center">
                        <video src={item.url} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Play className="h-3 w-3 text-white fill-white" />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt={item.title || `Media ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
