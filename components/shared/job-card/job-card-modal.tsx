"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { JobCardForm } from "./job-card-form"

interface JobCardModalProps {
  isOpen: boolean
  onClose: () => void
  editSaleId?: number | null
  initialCustomer?: any
}

export function JobCardModal({ isOpen, onClose, editSaleId, initialCustomer }: JobCardModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        <div className="p-6">
          <JobCardForm onClose={onClose} editSaleId={editSaleId} initialCustomer={initialCustomer} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
