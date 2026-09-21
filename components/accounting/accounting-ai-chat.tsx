"use client"

/**
 * MOTOCLUB Accounting AI Assistant — Floating Chatbot
 *
 * IMPORTANT: This component is rendered ONLY from accounting-tab.tsx.
 * It must NEVER be placed in a global layout, navbar, or any other module.
 *
 * UI: Floating button (bottom-right) → click → chat window opens.
 * Backend: Calls /api/accounting/ai-chat (read-only accounting tools).
 * Device security: deviceId passed as prop from AccountingTab, injected server-side.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import {
  Bot,
  Send,
  X,
  Loader2,
  Wrench,
  Trash2,
  RotateCcw,
  AlertCircle,
  ChevronDown,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isError?: boolean
}

export interface AccountingAIChatProps {
  deviceId: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

let _counter = 0
const newId = () => `moto-msg-${Date.now()}-${++_counter}`

const QUICK_SUGGESTIONS = [
  { label: "Today's Sales",        prompt: "What are today's total sales?" },
  { label: "Today's Profit",       prompt: "What is today's profit?" },
  { label: "Today's Expenses",     prompt: "What are today's expenses?" },
  { label: "Today's COGS",         prompt: "What is today's COGS?" },
  { label: "Today's Balance",      prompt: "What is today's closing balance?" },
  { label: "This Month",           prompt: "Give me this month's sales and profit summary." },
  { label: "Accounting Summary",   prompt: "Give me today's full accounting summary." },
]

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi! I'm MOTO AI 👋\n\nI can help you understand your Accounting data.\n\nAsk me about sales, profit, expenses, COGS, balances, receivables or payables.",
  timestamp: new Date(),
}

// ---------------------------------------------------------------------------
// Sub-component: AI Avatar
// ---------------------------------------------------------------------------

function MotoAIAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 shadow-sm",
        size === "sm" ? "w-7 h-7" : "w-9 h-9",
      )}
    >
      <Wrench
        className={cn(
          "text-orange-400",
          size === "sm" ? "w-3.5 h-3.5" : "w-4.5 h-4.5",
        )}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200",
        isUser ? "flex-row-reverse items-end" : "flex-row items-start",
      )}
    >
      {!isUser && <MotoAIAvatar size="sm" />}

      <div className={cn("flex flex-col gap-0.5 max-w-[78%]", isUser && "items-end")}>
        {!isUser && (
          <span className="text-[10px] font-semibold text-slate-500 px-1 tracking-wide uppercase">
            MOTO AI
          </span>
        )}

        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "bg-slate-800 text-white rounded-br-sm shadow-sm"
              : message.isError
                ? "bg-red-50 border border-red-200 text-red-700 rounded-bl-sm"
                : "bg-white border border-slate-100 text-slate-800 rounded-bl-sm shadow-sm",
          )}
        >
          {message.content}
        </div>

        <span className="text-[10px] text-slate-400 px-1">
          {message.timestamp.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Typing Indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex gap-2 items-start animate-in fade-in duration-200">
      <MotoAIAvatar size="sm" />
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-slate-500 px-1 tracking-wide uppercase">
          MOTO AI
        </span>
        <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">Analyzing</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Suggestion Chips
// ---------------------------------------------------------------------------

function SuggestionChips({
  onSelect,
  disabled,
}: {
  onSelect: (prompt: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
        Quick Questions
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {QUICK_SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSelect(s.prompt)}
            disabled={disabled}
            type="button"
            id={`moto-ai-suggest-${s.label.toLowerCase().replace(/[\s']+/g, "-")}`}
            className={cn(
              "text-left text-xs px-3 py-2 rounded-xl border",
              "border-slate-200 bg-slate-50 text-slate-700",
              "hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800",
              "active:scale-[0.97] transition-all duration-150",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "font-medium leading-tight",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Chat Window
// ---------------------------------------------------------------------------

function ChatWindow({
  messages,
  isLoading,
  inputValue,
  onInputChange,
  onSend,
  onKeyDown,
  onClose,
  onClear,
  onSuggest,
  inputRef,
  messagesEndRef,
  showSuggestions,
}: {
  messages: ChatMessage[]
  isLoading: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onClose: () => void
  onClear: () => void
  onSuggest: (prompt: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement>
  messagesEndRef: React.RefObject<HTMLDivElement>
  showSuggestions: boolean
}) {
  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden",
        "bottom-[88px] right-4",
        // Desktop size
        "w-[400px] h-[600px]",
        // Mobile: full-width, taller
        "max-[480px]:w-[calc(100vw-24px)] max-[480px]:right-3 max-[480px]:left-3",
        "max-[480px]:h-[75vh] max-[480px]:bottom-[80px]",
        // Styling
        "rounded-2xl border border-slate-200 bg-white shadow-2xl",
        // Animation
        "animate-in fade-in slide-in-from-bottom-3 duration-200",
      )}
      role="dialog"
      aria-label="MOTO AI Accounting Assistant"
      aria-modal="false"
    >
      {/* ---------------------------------------------------------------- */}
      {/* HEADER */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 flex-shrink-0 rounded-t-2xl">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center shadow-inner">
              <Wrench className="w-4 h-4 text-orange-400" />
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900" />
          </div>

          {/* Title */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white tracking-tight">MOTO AI</span>
              <span className="text-[9px] font-semibold bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                Beta
              </span>
            </div>
            <div className="text-[11px] text-slate-400">Accounting Assistant</div>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <button
              onClick={onClear}
              type="button"
              title="Clear conversation"
              aria-label="Clear conversation"
              id="moto-ai-clear"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            type="button"
            title="Close"
            aria-label="Close MOTO AI"
            id="moto-ai-close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] text-slate-400 font-medium">
          {isLoading ? "Analyzing your accounting data…" : "Ready · Read-only accounting data"}
        </span>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* MESSAGES AREA */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50 min-h-0">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Suggestions — shown after welcome message only */}
        {showSuggestions && !isLoading && (
          <div className="animate-in fade-in duration-300">
            <SuggestionChips onSelect={onSuggest} disabled={isLoading} />
          </div>
        )}

        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* INPUT AREA */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white rounded-b-2xl">
        <div className="flex gap-2 items-end p-3">
          <textarea
            ref={inputRef}
            id="moto-ai-input"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about sales, profit, expenses…"
            disabled={isLoading}
            rows={1}
            aria-label="Type your accounting question"
            className={cn(
              "flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50",
              "px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all duration-150 min-h-[40px] max-h-[100px]",
              "leading-relaxed",
            )}
            style={{ scrollbarWidth: "none" }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement
              t.style.height = "auto"
              t.style.height = `${Math.min(t.scrollHeight, 100)}px`
            }}
          />

          <button
            onClick={onSend}
            disabled={isLoading || !inputValue.trim()}
            type="button"
            id="moto-ai-send"
            aria-label="Send message"
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
              "bg-slate-800 hover:bg-orange-500 text-white",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800",
              "transition-all duration-150 active:scale-95 shadow-sm",
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        <p className="text-[10px] text-slate-400 text-center pb-2.5">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Floating Button
// ---------------------------------------------------------------------------

function FloatingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      id="moto-ai-open"
      aria-label="Open MOTO AI Accounting Assistant"
      title="Ask MOTO AI about your accounting data"
      className={cn(
        "fixed z-50 bottom-6 right-4",
        "flex items-center gap-2.5",
        "pl-3.5 pr-4 py-3",
        "bg-slate-900 hover:bg-slate-800 text-white",
        "rounded-2xl shadow-xl hover:shadow-2xl",
        "border border-slate-700 hover:border-orange-500/50",
        "transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]",
        // Focus ring
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2",
        // Mobile adjustments
        "max-[480px]:bottom-4 max-[480px]:right-3",
      )}
    >
      {/* Icon */}
      <div className="relative">
        <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center">
          <Wrench className="w-3.5 h-3.5 text-orange-400" />
        </div>
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-slate-900 animate-pulse" />
      </div>

      {/* Label */}
      <div className="flex flex-col items-start leading-none">
        <span className="text-[11px] font-semibold text-white tracking-tight">Ask MOTO AI</span>
        <span className="text-[9px] text-slate-400 mt-0.5">Accounting Assistant</span>
      </div>

      {/* Sparkle accent */}
      <Sparkles className="w-3.5 h-3.5 text-orange-400/70 ml-0.5" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AccountingAIChat({ deviceId }: AccountingAIChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Show suggestions only when the only message is the welcome message
  const showSuggestions = messages.length === 1 && messages[0].id === "welcome"

  // Scroll to bottom whenever messages update
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isLoading, isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen])

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isLoading) return

      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMsg])
      setInputValue("")
      setIsLoading(true)

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = "40px"
      }

      try {
        // Build message history (exclude welcome placeholder)
        const history = [...messages, userMsg]
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }))

        const res = await fetch("/api/accounting/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, deviceId }),
        })

        const data = await res.json()

        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content:
              data.message ||
              "Sorry, I couldn't retrieve the accounting data right now. Please try again.",
            timestamp: new Date(),
            isError: !res.ok,
          },
        ])
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content:
              "Sorry, I couldn't connect to the accounting service. Please check your connection and try again.",
            timestamp: new Date(),
            isError: true,
          },
        ])
      } finally {
        setIsLoading(false)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    },
    [messages, deviceId, isLoading],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE])
    setInputValue("")
  }

  const handleOpen = () => setIsOpen(true)
  const handleClose = () => setIsOpen(false)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Floating trigger button — only shown when chat is closed */}
      {!isOpen && <FloatingButton onClick={handleOpen} />}

      {/* Chat window — only shown when open */}
      {isOpen && (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={() => sendMessage(inputValue)}
          onKeyDown={handleKeyDown}
          onClose={handleClose}
          onClear={handleClear}
          onSuggest={(prompt) => sendMessage(prompt)}
          inputRef={inputRef}
          messagesEndRef={messagesEndRef}
          showSuggestions={showSuggestions}
        />
      )}
    </>
  )
}
