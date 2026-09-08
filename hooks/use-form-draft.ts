"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const DEFAULT_DEBOUNCE_MS = 400

interface StoredDraftEnvelope<T> {
  data: T
  savedAt: number
  version: number
}

export type DraftStatus = "idle" | "saving" | "saved" | "unsaved"

export interface UseFormDraftOptions<T> {
  /**
   * Unique identifier for the form, e.g. "job-card", "transfer", "product-create"
   */
  formId: string
  /**
   * User or device ID for tenant/session isolation
   */
  userId?: string | number | null
  /**
   * Current form data state
   */
  data: T
  /**
   * Whether persistence is active (e.g. only in create mode or when modal is open)
   */
  enabled?: boolean
  /**
   * Debounce delay in milliseconds before writing to localStorage
   */
  debounceMs?: number
  /**
   * Expiry time in milliseconds (defaults to 7 days)
   */
  expiresInMs?: number
  /**
   * Determines whether the form data contains non-empty / meaningful user input
   */
  hasMeaningfulData?: (data: T) => boolean
}

export interface UseFormDraftReturn<T> {
  /**
   * Retrieves the stored draft if present and not expired
   */
  getDraft: () => T | null
  /**
   * Immediately clears the draft from storage
   */
  clearDraft: () => void
  /**
   * Forces an immediate save of the draft (bypassing debounce)
   */
  saveDraftNow: (overrideData?: T) => void
  /**
   * Whether a valid saved draft currently exists in storage
   */
  hasDraft: boolean
  /**
   * Current persistence status
   */
  status: DraftStatus
  /**
   * Timestamp when the draft was last persisted
   */
  lastSaved: Date | null
  /**
   * Whether the form has finished hydrating its initial/draft state
   */
  isHydrated: boolean
  /**
   * Call after restoring or initializing form state to begin observing changes
   */
  markHydrated: () => void
}

export function useFormDraft<T>({
  formId,
  userId,
  data,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  expiresInMs = DEFAULT_EXPIRY_MS,
  hasMeaningfulData,
}: UseFormDraftOptions<T>): UseFormDraftReturn<T> {
  const storageKey = useMemo(() => {
    const userScope = userId !== null && userId !== undefined && String(userId).trim() !== "" ? String(userId) : "default"
    return `motoclub:draft:${formId}:${userScope}`
  }, [formId, userId])

  const [isHydrated, setIsHydrated] = useState(false)
  const [status, setStatus] = useState<DraftStatus>("idle")
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasDraft, setHasDraft] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return false
      const parsed = JSON.parse(raw) as StoredDraftEnvelope<T>
      if (!parsed || typeof parsed !== "object" || !parsed.savedAt) return false
      if (Date.now() - parsed.savedAt > expiresInMs) {
        localStorage.removeItem(storageKey)
        return false
      }
      return true
    } catch {
      return false
    }
  })

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const previousSerializedRef = useRef<string>("")
  const isHydratedRef = useRef(false)
  isHydratedRef.current = isHydrated
  const dataRef = useRef<T>(data)
  dataRef.current = data

  // Read draft safely
  const getDraft = useCallback((): T | null => {
    if (typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const envelope = JSON.parse(raw) as StoredDraftEnvelope<T>
      if (!envelope || typeof envelope !== "object" || !("data" in envelope)) {
        return null
      }
      if (envelope.savedAt && Date.now() - envelope.savedAt > expiresInMs) {
        localStorage.removeItem(storageKey)
        setHasDraft(false)
        return null
      }
      return envelope.data
    } catch (err) {
      console.warn(`[useFormDraft] Failed to read draft for "${storageKey}":`, err)
      return null
    }
  }, [storageKey, expiresInMs])

  // Clear draft safely
  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    try {
      localStorage.removeItem(storageKey)
    } catch (err) {
      console.warn(`[useFormDraft] Failed to clear draft for "${storageKey}":`, err)
    }
    setHasDraft(false)
    setStatus("idle")
    previousSerializedRef.current = ""
  }, [storageKey])

  // Save immediately
  const saveDraftNow = useCallback(
    (overrideData?: T) => {
      if (typeof window === "undefined") return
      const targetData = overrideData !== undefined ? overrideData : dataRef.current

      if (hasMeaningfulData && !hasMeaningfulData(targetData)) {
        clearDraft()
        return
      }

      try {
        const envelope: StoredDraftEnvelope<T> = {
          data: targetData,
          savedAt: Date.now(),
          version: 1,
        }
        const serialized = JSON.stringify(envelope)
        localStorage.setItem(storageKey, serialized)
        previousSerializedRef.current = serialized
        setHasDraft(true)
        setStatus("saved")
        setLastSaved(new Date(envelope.savedAt))
      } catch (err) {
        console.warn(`[useFormDraft] Failed to persist draft for "${storageKey}":`, err)
        setStatus("idle")
      }
    },
    [hasMeaningfulData, storageKey, clearDraft],
  )

  const markHydrated = useCallback(() => {
    setIsHydrated(true)
    isHydratedRef.current = true
    try {
      previousSerializedRef.current = JSON.stringify(dataRef.current)
    } catch {
      previousSerializedRef.current = ""
    }
  }, [])

  // Auto-save effect
  useEffect(() => {
    if (!enabled || !isHydrated) return

    let currentSerialized = ""
    try {
      currentSerialized = JSON.stringify(data)
    } catch {
      return
    }

    // If identical to last saved state, do nothing
    if (currentSerialized === previousSerializedRef.current) {
      return
    }

    if (hasMeaningfulData && !hasMeaningfulData(data)) {
      if (hasDraft) {
        clearDraft()
      }
      return
    }

    setStatus("unsaved")

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      setStatus("saving")
      try {
        const envelope: StoredDraftEnvelope<T> = {
          data,
          savedAt: Date.now(),
          version: 1,
        }
        const serialized = JSON.stringify(envelope)
        localStorage.setItem(storageKey, serialized)
        previousSerializedRef.current = currentSerialized
        setHasDraft(true)
        setStatus("saved")
        setLastSaved(new Date(envelope.savedAt))
      } catch (err) {
        console.warn(`[useFormDraft] Auto-save error for "${storageKey}":`, err)
        setStatus("idle")
      }
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [data, enabled, isHydrated, debounceMs, storageKey, hasMeaningfulData, hasDraft, clearDraft])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return {
    getDraft,
    clearDraft,
    saveDraftNow,
    hasDraft,
    status,
    lastSaved,
    isHydrated,
    markHydrated,
  }
}
