/** App-wide light theme palette (inspired by soft-professional dashboard UI) */
export const palette = {
  page: "#F9FAFB",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#111827",
  textMuted: "#6B7280",
  violet: "#7C3AED",
  violetSoft: "#F5F3FF",
  amber: "#F59E0B",
  amberSoft: "#FFFBEB",
  blue: "#3B82F6",
  blueSoft: "#EFF6FF",
  emerald: "#10B981",
  emeraldSoft: "#ECFDF5",
  rose: "#EF4444",
  roseSoft: "#FEF2F2",
} as const

export type AccentTone = "violet" | "amber" | "blue" | "emerald" | "rose"

export const accentStyles: Record<
  AccentTone,
  { card: string; icon: string; text: string; border: string }
> = {
  violet: {
    card: "bg-violet-50",
    icon: "bg-violet-100 text-violet-600",
    text: "text-violet-700",
    border: "border-violet-100",
  },
  amber: {
    card: "bg-amber-50",
    icon: "bg-amber-100 text-amber-600",
    text: "text-amber-700",
    border: "border-amber-100",
  },
  blue: {
    card: "bg-blue-50",
    icon: "bg-blue-100 text-blue-600",
    text: "text-blue-700",
    border: "border-blue-100",
  },
  emerald: {
    card: "bg-emerald-50",
    icon: "bg-emerald-100 text-emerald-600",
    text: "text-emerald-700",
    border: "border-emerald-100",
  },
  rose: {
    card: "bg-rose-50",
    icon: "bg-rose-100 text-rose-600",
    text: "text-rose-700",
    border: "border-rose-100",
  },
}
