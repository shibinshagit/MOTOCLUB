/**
 * Smart auto-capitalisation for human-readable customer / job-card text (names, addresses, places).
 *
 * It is a typing helper, not a normaliser:
 *  - a letter that STARTS A NEW WORD as it is typed or pasted becomes upper case
 *      "india" -> "India", "kerala state" -> "Kerala State"
 *  - anything that edits text which is already there is left exactly as typed
 *      India -> select "I", type "i"  => "india" (never corrected back)
 *      Kerala State -> "kerala State" stays
 *  - nothing is applied on blur or on save, and stored values are never rewritten.
 *
 * Use only on name/address style inputs, not on email, phone, pincode, SKU, barcode, ids, URLs or GST numbers.
 */

const isLetter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch)
const isSpace = (ch: string | undefined) => !!ch && /\s/.test(ch)

/**
 * Compares the previous and the new value of an input to find what the user just did and capitalises
 * only freshly inserted word-starting letters. Replacements (removed text) and edits inside or at the
 * front of an existing word are returned untouched.
 */
export function smartCapitalize(prev: string, next: string): string {
  if (next === prev) return next

  // common prefix / suffix -> the changed region
  let start = 0
  const max = Math.min(prev.length, next.length)
  while (start < max && prev[start] === next[start]) start++
  let endPrev = prev.length
  let endNext = next.length
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--
    endNext--
  }

  const removed = endPrev - start
  const inserted = next.slice(start, endNext)
  if (removed > 0 || inserted.length === 0) return next // replacement or pure deletion: the user's edit wins

  const chars = next.split("")
  for (let i = 0; i < inserted.length; i++) {
    const q = start + i
    const ch = chars[q]
    if (!isLetter(ch)) continue
    const startsWord = q === 0 || isSpace(chars[q - 1])
    if (!startsWord) continue
    // typed right in front of an existing word ("ndia" + "i"): that is editing an existing word, not a new one
    const isLastInserted = i === inserted.length - 1
    if (isLastInserted && isLetter(chars[q + 1])) continue
    chars[q] = ch.toLocaleUpperCase()
  }
  return chars.join("")
}

type TextEl = HTMLInputElement | HTMLTextAreaElement

function applyTo(el: TextEl, prev: string): string {
  const next = el.value
  const out = smartCapitalize(prev, next)
  if (out !== next) {
    const pos = el.selectionStart
    const end = el.selectionEnd
    // same length, so the caret position stays valid; restore it after React/DOM writes the value
    el.value = out
    try {
      el.setSelectionRange(pos, end)
    } catch {
      /* some input types do not support selection */
    }
  }
  return out
}

/**
 * For a CONTROLLED input:
 *   <Input value={area} onChange={(e) => smartCapChange(e, area, setArea)} />
 */
export function smartCapChange(
  e: { target: TextEl },
  prev: string,
  set: (value: string) => void,
) {
  set(applyTo(e.target, prev ?? ""))
}

/**
 * For an UNCONTROLLED input read through FormData:
 *   <Input name="name" onChange={smartCapUncontrolled} />
 */
export function smartCapUncontrolled(e: { currentTarget: TextEl }) {
  const el = e.currentTarget
  const prev = el.dataset.prevValue ?? ""
  el.dataset.prevValue = applyTo(el, prev)
}
