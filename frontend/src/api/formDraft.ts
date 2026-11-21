import api from './client'

/**
 * Saves fields the user edits by hand: PATCH /forms/{id}/values.
 *
 * Typing is batched: changes wait DEBOUNCE_MS after the last keystroke, then go in one request.
 * Requests run one after another, so an older save can never overwrite a newer one.
 * The copilot reads values from the database, so call flushFieldSaves() before sending it a
 * message: otherwise it could miss an edit that is still waiting.
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 600

let formId: number | null = null
const pending = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | undefined
let queue: Promise<void> = Promise.resolve()
let listener: ((status: SaveStatus) => void) | null = null

/** Get told when saving starts, succeeds or fails. Returns an unsubscribe function. */
export const onSaveStatus = (cb: (status: SaveStatus) => void) => {
  listener = cb
  return () => {
    if (listener === cb) listener = null
  }
}

/** Sends everything waiting now. Resolves once all saves so far have finished. */
export function flushFieldSaves(): Promise<void> {
  clearTimeout(timer)
  if (pending.size && formId !== null) {
    const id = formId
    const values = Object.fromEntries(pending)
    pending.clear()
    listener?.('saving')
    queue = queue
      .then(() => api.patch(`/forms/${id}/values`, { values }))
      .then(
        () => listener?.('saved'),
        () => listener?.('error'),
      )
  }
  return queue
}

/** Records a manual edit; it is saved shortly after the user stops typing. */
export function queueFieldSave(id: number, name: string, value: string) {
  if (formId !== null && formId !== id) void flushFieldSaves()
  formId = id
  pending.set(name, value)
  clearTimeout(timer)
  timer = setTimeout(() => void flushFieldSaves(), DEBOUNCE_MS)
}

/** Drops edits that haven't been sent yet (the form is being cleared anyway). */
export function discardFieldSaves() {
  clearTimeout(timer)
  pending.clear()
}
