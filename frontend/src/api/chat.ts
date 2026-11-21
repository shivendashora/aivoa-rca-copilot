import type { ApiRequest } from '../components/common/hooks/useCallApi'
import type { ChatMessage } from '../features/copilot/copilotSlice'
import type { RcaFormData } from './client'

// Backend: backend/app/api/routes/chat.py (prefix /api/chat)

/**
 * One saved row: what the user sent, and the agent's reply (null until the agent answers).
 * `filename` is set when the row is a file upload; `queryMessages` is then null.
 */
export interface ChatHistoryItem {
  queryMessages: string | null
  agentResponse: string | null
  filename: string | null
}

export interface ChatHistoryResponse {
  message: string
  chats: ChatHistoryItem[]
}

/** What the copilot sends back after reading a message or a file */
export interface CopilotUpdate {
  reply: string
  form: RcaFormData
  changed_fields: string[]
}

/**
 * POST /chat/upload response. The file is saved even when the copilot fails:
 * then `reply` and `form` are null and `error` says why.
 */
export interface UploadResponse {
  message: string
  filename: string
  reply: string | null
  form: RcaFormData | null
  changed_fields: string[]
  error: string | null
}

/** Sent over the chat WebSocket. The backend reads the form's current values from the database. */
export interface SocketChatMessage {
  message: string
  form_id: number | null
}

/** Received over the chat WebSocket: exactly one per message sent, in the same order */
export type SocketReply =
  | ({ type: 'reply' } & CopilotUpdate)
  /** saved=false: the message itself wasn't stored. saved=true: it was stored but the copilot failed. */
  | { type: 'error'; saved: boolean; detail: string }

/** GET /chat/getAllChats: every chat message of the logged-in user, oldest first */
export const getAllChatsRequest = (): ApiRequest => ({ url: '/chat/getAllChats' })

/** POST /chat/upload (multipart). The copilot fills `formId`'s saved values from the file. */
export const uploadFileRequest = (file: File, formId: number | null): ApiRequest<FormData> => {
  const body = new FormData()
  body.append('file', file)
  if (formId !== null) body.append('form_id', String(formId))
  return { url: '/chat/upload', method: 'POST', body }
}

/** Turns saved rows into chat bubbles: the file (if any), the user's text (if any), then the agent's reply. */
export const toChatMessages = (chats: ChatHistoryItem[]): ChatMessage[] =>
  chats.flatMap((c) => {
    const items: ChatMessage[] = []
    if (c.filename) items.push({ role: 'user', text: c.filename, file: true })
    if (c.queryMessages) items.push({ role: 'user', text: c.queryMessages })
    if (c.agentResponse) items.push({ role: 'ai', text: c.agentResponse })
    return items
  })
