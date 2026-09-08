"use client"

import { useState } from "react"
import { updateSaleCustomerPhone } from "@/app/actions/job-card-actions"
import { useToast } from "@/components/ui/use-toast"
import { formatPhoneNumber } from "@/lib/utils"
import { Edit2, Check, X, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface PhoneCellProps {
  saleId: number
  phone: string | null | undefined
  deviceId?: number
  onUpdate?: () => void
}

export function PhoneCell({ saleId, phone, deviceId, onUpdate }: PhoneCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(phone || "")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setValue(phone || "")
    setIsEditing(true)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(false)
    setValue(phone || "")
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLoading(true)
    try {
      const res = await updateSaleCustomerPhone(saleId, value, deviceId)
      if (res.success) {
        toast({ title: "Success", description: "Phone number updated successfully." })
        setIsEditing(false)
        if (onUpdate) onUpdate()
      } else {
        toast({ title: "Error", description: res.message || "Failed to update phone number", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update phone number", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Phone number"
          className="h-7 text-xs px-2 py-1 w-32 bg-white"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSave(e as any)
            } else if (e.key === "Escape") {
              handleCancel(e as any)
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          onClick={handleSave}
          disabled={loading}
          title="Save"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          onClick={handleCancel}
          disabled={loading}
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 group min-h-[1.5rem]" onClick={(e) => e.stopPropagation()}>
      <span className="text-slate-600 text-xs">
        {phone ? formatPhoneNumber(phone) : <span className="text-slate-400 italic">No phone</span>}
      </span>
      <button
        onClick={handleStartEdit}
        className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
        title="Edit phone number"
      >
        <Edit2 className="h-3 w-3" />
      </button>
    </div>
  )
}
