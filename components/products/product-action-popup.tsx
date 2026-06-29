"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Eye, Edit, BarChart2, Printer, Trash2 } from "lucide-react"

interface ProductActionPopupProps {
  isOpen: boolean
  onClose: () => void
  product: any
  position: { x: number; y: number }
  onView: () => void
  onEdit: () => void
  onAdjustStock?: () => void
  showAdjustStock?: boolean
  onPrint: () => void
  onDelete: () => void
}

export default function ProductActionPopup({
  isOpen,
  onClose,
  product,
  position,
  onView,
  onEdit,
  onAdjustStock,
  showAdjustStock = true,
  onPrint,
  onDelete,
}: ProductActionPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleEscape)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, onClose])

  // Adjust position to keep popup within viewport
  useEffect(() => {
    if (isOpen && popupRef.current) {
      const popup = popupRef.current
      const rect = popup.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let newX = position.x
      let newY = position.y

      // Adjust horizontal position
      if (position.x + rect.width > viewportWidth) {
        newX = viewportWidth - rect.width - 20
      }
      if (newX < 20) {
        newX = 20
      }

      // Adjust vertical position
      if (position.y + rect.height > viewportHeight) {
        newY = position.y - rect.height - 10
      }
      if (newY < 20) {
        newY = 20
      }

      setAdjustedPosition({ x: newX, y: newY })
    }
  }, [isOpen, position])

  if (!isOpen || !product) return null

  const actions = [
    {
      icon: Eye,
      label: "View",
      onClick: onView,
      className: "hover:bg-blue-50 hover:text-blue-600",
    },
    {
      icon: Edit,
      label: "Edit",
      onClick: onEdit,
      className: "hover:bg-green-50 hover:text-green-600",
    },
    ...(showAdjustStock && onAdjustStock
      ? [
          {
            icon: BarChart2,
            label: "Stock",
            onClick: onAdjustStock,
            className: "hover:bg-purple-50 hover:text-purple-600",
          },
        ]
      : []),
    {
      icon: Printer,
      label: "Print",
      onClick: onPrint,
      className: "hover:bg-orange-50 hover:text-orange-600",
    },
    {
      icon: Trash2,
      label: "Delete",
      onClick: onDelete,
      className: "hover:bg-red-50 hover:text-red-600",
    },
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/10 z-40" />

      {/* Popup - No animations */}
      <div
        ref={popupRef}
        className="fixed z-50"
        style={{
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
        }}
      >
        <Card className="w-40 shadow-lg border-gray-200 bg-white">
          <CardContent className="p-1">
            {actions.map((action, index) => {
              const Icon = action.icon
              return (
                <Button
                  key={index}
                  variant="ghost"
                  className={`w-full justify-start h-8 px-2 text-sm font-normal ${action.className}`}
                  onClick={() => {
                    action.onClick()
                    onClose()
                  }}
                >
                  <Icon className="h-3 w-3 mr-2" />
                  <span>{action.label}</span>
                </Button>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
