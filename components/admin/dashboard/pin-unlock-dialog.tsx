"use client"

import { useState } from "react"
import { Lock, Unlock, KeyRound, AlertCircle, Loader2, Delete } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface PinUnlockDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess: () => void
  onUnlock: (pin: string) => Promise<{ success: boolean; message?: string }>
}

export default function PinUnlockDialog({
  open,
  onOpenChange,
  onSuccess,
  onUnlock,
}: PinUnlockDialogProps) {
  const [pin, setPin] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pin.trim()) {
      setError("Please enter your Admin PIN")
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      const res = await onUnlock(pin)
      if (res.success) {
        setPin("")
        onSuccess()
      } else {
        setError(res.message || "Invalid Admin PIN")
      }
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 8) {
      setPin((prev) => prev + digit)
      setError(null)
    }
  }

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  const handleClear = () => {
    setPin("")
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-gray-200 p-6 shadow-2xl">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <Lock className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-gray-900">
            Admin Dashboard Access
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Enter the Admin Security PIN to decrypt and unlock financial metrics.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""))
                setError(null)
              }}
              placeholder="Enter PIN"
              maxLength={8}
              className="h-12 border-gray-300 bg-gray-50/50 pl-11 text-center font-mono text-xl tracking-[0.3em] placeholder:tracking-normal placeholder:text-gray-400 focus:bg-white"
            />
          </div>

          {/* Touch-Friendly Numeric Keypad for Mobile/POS screens */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Button
                key={d}
                type="button"
                variant="outline"
                onClick={() => handleKeypadPress(d)}
                disabled={isLoading}
                className="h-11 text-lg font-semibold text-gray-800 hover:bg-gray-100 hover:text-gray-900 border-gray-200"
              >
                {d}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={isLoading || pin.length === 0}
              className="h-11 text-xs font-medium text-gray-500 hover:bg-gray-100 border-gray-200"
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleKeypadPress("0")}
              disabled={isLoading}
              className="h-11 text-lg font-semibold text-gray-800 hover:bg-gray-100 hover:text-gray-900 border-gray-200"
            >
              0
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleBackspace}
              disabled={isLoading || pin.length === 0}
              className="h-11 font-medium text-gray-600 hover:bg-gray-100 border-gray-200"
              title="Backspace"
            >
              <Delete className="h-4 w-4 mx-auto" />
            </Button>
          </div>

          <Button
            type="submit"
            disabled={isLoading || pin.length === 0}
            className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying PIN...
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4" />
                Unlock Dashboard
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
