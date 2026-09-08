type ToastFn = (props: {
  title?: string
  description?: string
  variant?: "default" | "destructive"
  duration?: number
}) => void

export function notifySuccess(toast: ToastFn, description: string, title = "Success", duration = 3500) {
  toast({ title, description, duration })
}

export function notifyError(toast: ToastFn, description: string, title = "Error", duration = 5000) {
  toast({ title, description, variant: "destructive", duration })
}

export function notifyWarning(toast: ToastFn, description: string, title = "Warning", duration = 4000) {
  toast({ title, description, variant: "destructive", duration })
}
