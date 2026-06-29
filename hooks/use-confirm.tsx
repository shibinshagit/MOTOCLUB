"use client"

import { useCallback, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ConfirmOptions = {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export function useConfirm() {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((input: ConfirmOptions | string) => {
    const normalized: ConfirmOptions =
      typeof input === "string"
        ? { description: input }
        : input

    return new Promise<boolean>((resolve) => {
      setOptions({
        title: normalized.title ?? "Are you sure?",
        description: normalized.description,
        confirmLabel: normalized.confirmLabel ?? "Continue",
        cancelLabel: normalized.cancelLabel ?? "Cancel",
        destructive: normalized.destructive ?? false,
      })
      setResolver(() => resolve)
      setOpen(true)
    })
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resolver?.(false)
      setResolver(null)
    }
  }

  const handleConfirm = () => {
    resolver?.(true)
    setResolver(null)
    setOpen(false)
  }

  const ConfirmDialog = (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="z-[200]"
        overlayClassName="z-[200] bg-black/80"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title ?? "Are you sure?"}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description ?? ""}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{options?.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={options?.destructive ? "bg-red-600 hover:bg-red-700" : undefined}
          >
            {options?.confirmLabel ?? "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, ConfirmDialog, isConfirmOpen: open }
}
