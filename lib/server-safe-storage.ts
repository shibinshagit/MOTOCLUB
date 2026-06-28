/**
 * Non-persistent localStorage polyfill for SSR/build when window is undefined.
 */

function createStorageShim(): Storage {
  const data = new Map<string, string>()

  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  } as Storage
}

if (typeof window === "undefined" && (globalThis as any).localStorage === undefined) {
  ;(globalThis as any).localStorage = createStorageShim()
}
