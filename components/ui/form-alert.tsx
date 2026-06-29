import type { ReactNode } from "react"
import { AlertCircle, CheckCircle, X, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface FormAlertProps {
  type: "success" | "error" | "warning"
  message: string
  title?: string
  className?: string
  action?: ReactNode
  onDismiss?: () => void
}

export function FormAlert({ type, message, title, className, action, onDismiss }: FormAlertProps) {
  if (!message) return null

  const icons = {
    success: <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />,
    error: <XCircle className="h-5 w-5 shrink-0 text-red-600" />,
    warning: <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />,
  }

  const backgrounds = {
    success: "bg-green-50 border-green-200 text-green-900",
    error: "bg-red-50 border-red-200 text-red-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
  }

  return (
    <div
      className={cn("flex items-start gap-3 rounded-md border p-3 animate-fadeIn", backgrounds[type], className)}
      role="alert"
    >
      {icons[type]}
      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-medium">{title}</p> : null}
        <p className={cn("text-sm", title && "mt-0.5")}>{message}</p>
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
