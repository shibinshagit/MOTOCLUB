type ToastFn = (props: {
  title?: string
  description?: string
  variant?: "default" | "destructive"
  duration?: number
}) => void

export function notifySuccess(toast: ToastFn, description: string, title = "Success") {
  toast({ title, description })
}

export function notifyError(toast: ToastFn, description: string, title = "Error") {
  toast({ title, description, variant: "destructive" })
}

export function notifyWarning(toast: ToastFn, description: string, title = "Warning") {
  toast({ title, description, variant: "destructive" })
}
