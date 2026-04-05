"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCustomTheme } from "@/hooks/use-custom-theme"
import { cn } from "@/lib/utils"

export function AnimatedThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const { setTheme } = useCustomTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    const sync = () => setIsDark(document.documentElement.classList.contains("dark"))
    sync()
    const el = document.documentElement
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("relative h-9 w-9", className)}
        disabled
        aria-hidden
      >
        <Sun className="h-4 w-4 opacity-40" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("relative h-9 w-9", className)}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun
        className={cn(
          "absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
          isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        )}
        aria-hidden
      />
      <Moon
        className={cn(
          "absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0"
        )}
        aria-hidden
      />
    </Button>
  )
}
