"use client"

import InventoryDrawer from "@/components/products/inventory-drawer"

interface ProductTabProps {
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
  onClose?: () => void
}

export default function ProductTab({
  userId,
  isAddModalOpen = false,
  onModalClose,
  onClose,
}: ProductTabProps) {
  return (
    <InventoryDrawer
      open
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
      userId={userId}
      isAddModalOpen={isAddModalOpen}
      onModalClose={onModalClose}
    />
  )
}
