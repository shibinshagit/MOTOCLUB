"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
export interface BatchAllocation {
  batchId: number
  quantity: number
  costPrice?: number
  sellingPrice?: number
}

interface BatchAllocatorProps {
  isOpen: boolean
  onClose: () => void
  productName: string
  requiredQty: number
  batches: any[]
  initialAllocations: BatchAllocation[]
  deviceId: number
  onSave: (allocations: BatchAllocation[], autoAllocate: boolean) => void
}

export function BatchAllocator({
  isOpen,
  onClose,
  productName,
  requiredQty,
  batches,
  initialAllocations,
  deviceId,
  onSave
}: BatchAllocatorProps) {
  const [allocations, setAllocations] = useState<BatchAllocation[]>([])
  const [isAuto, setIsAuto] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setAllocations(initialAllocations || [])
      setIsAuto(initialAllocations.length === 0)
    }
  }, [isOpen, initialAllocations])

  const handleQtyChange = (batchId: number, qtyStr: string) => {
    const qty = parseInt(qtyStr) || 0
    setIsAuto(false) // manual override disables auto
    
    setAllocations(prev => {
      const existing = prev.find(a => a.batchId === batchId)
      if (existing) {
        if (qty <= 0) return prev.filter(a => a.batchId !== batchId)
        return prev.map(a => a.batchId === batchId ? { ...a, quantity: qty } : a)
      } else {
        if (qty <= 0) return prev
        const batch = batches.find(b => b.id === batchId || b.batch_id === batchId)
        return [...prev, { batchId, quantity: qty, costPrice: batch?.cost_price, sellingPrice: batch?.selling_price }]
      }
    })
  }

  const handleAutoAllocate = () => {
    const sortedBatches = [...batches].sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    let remaining = requiredQty
    const newAllocations: BatchAllocation[] = []

    for (const b of sortedBatches) {
      if (remaining <= 0) break
      const stockCount = b.stocks?.find((s: any) => Number(s.device_id) === Number(deviceId))?.stock || b.device_stock || b.stock || 0
      if (stockCount > 0) {
        const allocQty = Math.min(stockCount, remaining)
        newAllocations.push({
          batchId: b.id || b.batch_id,
          quantity: allocQty,
          costPrice: b.cost_price,
          sellingPrice: b.selling_price
        })
        remaining -= allocQty
      }
    }
    setAllocations(newAllocations)
    setIsAuto(true)
  }

  const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0)
  const isComplete = totalAllocated === requiredQty
  const remaining = requiredQty - totalAllocated

  const handleSave = () => {
    onSave(allocations, isAuto)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Allocate Batches - {productName}</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
            <div>
              <p className="text-sm font-medium">Required Qty</p>
              <p className="text-2xl font-bold">{requiredQty}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Allocated</p>
              <p className={`text-2xl font-bold ${isComplete ? 'text-green-600' : 'text-red-600'}`}>
                {totalAllocated} / {requiredQty}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleAutoAllocate} className="text-xs">
              Auto Allocate (FIFO)
            </Button>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {batches.map(b => {
              const stockCount = b.stocks?.find((s: any) => Number(s.device_id) === Number(deviceId))?.stock || b.device_stock || b.stock || 0
              if (stockCount <= 0) return null
              
              const currentAlloc = allocations.find(a => a.batchId === b.id)?.quantity || 0
              const date = b.created_at ? new Date(b.created_at).toLocaleDateString() : ''
              
              return (
                <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div>
                    <p className="font-medium text-sm">{b.batch_no}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">Available: {stockCount}</Badge>
                      <Badge variant="outline" className="text-[10px]">Cost: {b.cost_price}</Badge>
                      <Badge variant="outline" className="text-[10px]">Price: {b.selling_price}</Badge>
                    </div>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min={0}
                      max={stockCount}
                      value={currentAlloc || ""}
                      onChange={(e) => handleQtyChange(b.id, e.target.value)}
                      placeholder="Qty"
                      className="text-right"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {!isComplete && (
            <p className="text-sm text-red-500 font-medium text-center">
              Please allocate remaining {remaining} quantities.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!isComplete}>
            Confirm Allocation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
