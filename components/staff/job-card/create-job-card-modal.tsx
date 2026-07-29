"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { JobCardForm } from "./job-card-form"

interface CreateJobCardModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateJobCardModal({ isOpen, onClose }: CreateJobCardModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        <div className="p-6">
          <JobCardForm onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
