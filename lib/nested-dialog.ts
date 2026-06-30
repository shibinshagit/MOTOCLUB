export const NESTED_DIALOG_CONTENT_ATTR = "data-nested-dialog-content"

export function isNestedDialogTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element?.closest(`[${NESTED_DIALOG_CONTENT_ATTR}]`))
}

export function shouldIgnoreParentDialogClose(
  isNestedOpen: boolean,
  isNestedClosing: boolean,
): boolean {
  return isNestedOpen || isNestedClosing
}

export function preventDismissWhenNestedOpen(
  event: Event,
  isNestedOpen: boolean,
  isNestedClosing: boolean,
): void {
  if (shouldIgnoreParentDialogClose(isNestedOpen, isNestedClosing) || isNestedDialogTarget(event.target)) {
    event.preventDefault()
  }
}
