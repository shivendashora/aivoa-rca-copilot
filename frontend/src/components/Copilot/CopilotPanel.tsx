import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AlertCircle, Check, CheckCircle2, FileText, FlaskConical, Loader2, Paperclip, Send, User, Zap } from 'lucide-react'
import type { ChatMessage } from '../../features/copilot/copilotSlice'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { applyAiUpdate } from '../../features/rca/rcaSlice'
import CommonButton from '../common/common-button'
import { cn } from '../../lib/cn'
import { tokenStorage } from '../../lib/tokenStorage'
import { refreshAccessToken } from '../../api/client'
import useAPICaller from '../common/hooks/useCallApi'
import {
  getAllChatsRequest,
  toChatMessages,
  uploadFileRequest,
  type ChatHistoryResponse,
  type SocketChatMessage,
  type SocketReply,
  type UploadResponse,
} from '../../api/chat'

const bubble = 'rounded-card px-3 py-2.5 text-[12.5px] leading-[1.55] whitespace-pre-wrap'
const aiBubble = 'border border-[#eef0f3] bg-white text-ink-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'

function AiAvatar({ done }: { done?: boolean }) {
  return (
    <div className="grid size-[26px] flex-none place-items-center rounded-full bg-brand-soft text-brand">
      {done ? <Check size={13} strokeWidth={3} /> : <Zap size={13} fill="currentColor" strokeWidth={0} />}
    </div>
  )
}

function UserAvatar() {
  return (
    <div className="grid size-6 flex-none place-items-center rounded-full border border-line bg-line-soft text-muted">
      <User size={12} />
    </div>
  )
}

/**
 * A bubble on screen. `id` is set for messages added in this session.
 * `failed` means the backend didn't save it; `uploading` means a file is still being sent.
 */
type UiMessage = ChatMessage & { id?: number; failed?: boolean; uploading?: boolean }

/** File extension in capitals for the badge, e.g. "PDF". */
const fileExt = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 4) : 'FILE'
}

function FileCard({ m }: { m: UiMessage }) {
  const state = m.uploading ? 'uploading' : m.failed ? 'failed' : 'uploaded'
  return (
    <div
      className={cn(
        'flex w-[220px] items-center gap-2.5 rounded-card border bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)]',
        state === 'failed' ? 'border-red-200' : 'border-line',
      )}
    >
      <div className="relative grid size-8 flex-none place-items-center rounded-md bg-brand-soft text-brand">
        <FileText size={16} />
        <span className="absolute -bottom-1 rounded-sm bg-brand px-0.5 text-[7px] leading-tight font-bold text-white">
          {fileExt(m.text)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-ink" title={m.text}>
          {m.text}
        </div>
        <div
          className={cn(
            'mt-0.5 flex items-center gap-1 text-[10.5px]',
            state === 'uploaded' && 'text-emerald-600',
            state === 'uploading' && 'text-muted',
            state === 'failed' && 'text-red-600',
          )}
        >
          {state === 'uploading' && (
            <>
              <Loader2 size={11} className="animate-spin" /> Uploading…
            </>
          )}
          {state === 'uploaded' && (
            <>
              <CheckCircle2 size={11} /> Uploaded
            </>
          )}
          {state === 'failed' && (
            <>
              <AlertCircle size={11} /> Upload failed
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Message({ m, isFirst }: { m: UiMessage; isFirst: boolean }) {
  if (m.role === 'user') {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="flex max-w-[80%] flex-col items-end gap-1">
          {m.file ? (
            <FileCard m={m} />
          ) : (
            <>
              <div className={cn(bubble, 'bg-brand text-white', m.failed && 'opacity-60')}>{m.text}</div>
              {m.failed && <span className="text-[10px] text-red-600">Not saved</span>}
            </>
          )}
        </div>
        <UserAvatar />
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2.5">
      <AiAvatar done={!isFirst} />
      <div className={cn(bubble, aiBubble, 'max-w-[82%]')}>{m.text}</div>
    </div>
  )
}

export default function CopilotPanel() {
  const dispatch = useAppDispatch()
  // The copilot fills this form, starting from the values already in it
  const formId = useAppSelector((s) => s.rca.definition?.id ?? null)
  const currentForm = useAppSelector((s) => s.rca.form)

  const [messages, setMessages] = useState<UiMessage[]>([])
  const [status, setStatus] = useState<string>('connecting')
  const [text, setText] = useState('')
  const wsref = useRef<WebSocket | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const nextId = useRef(0)
  // Ids of sent messages still waiting for the server's answer, oldest first.
  // The server answers each message in order, so the first answer belongs to the first id.
  const pendingIds = useRef<number[]>([])
  // Same count as pendingIds, as state, so the "Analyzing" bubble re-renders
  const [waiting, setWaiting] = useState(0)

  const { callApi, loading, error } = useAPICaller<ChatHistoryResponse>()
  const upload = useAPICaller<UploadResponse, FormData>()

  /** Adds a bubble after the existing ones (old chats first, new ones last, same order as the DB). */
  const appendMessage = useCallback((m: UiMessage) => {
    const id = ++nextId.current
    setMessages((prev) => [...prev, { ...m, id }])
    return id
  }, [])

  const updateMessage = useCallback((id: number, changes: Partial<UiMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)))
  }, [])

  // Load the user's saved chats once when the panel opens
  useEffect(() => {
    const fetchMessages = async () => {
      const result = await callApi(getAllChatsRequest())
      // Old chats go before anything sent while they were still loading
      if (result) setMessages((prev) => [...toChatMessages(result.chats), ...prev])
    }
    fetchMessages()
  }, [callApi])

  // Keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, waiting])

  useEffect(() => {
    let stopped = false // set on unmount: stop reconnecting
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    // One answer per message sent: the copilot's reply (with the updated form), or an error
    const onMessage = (e: MessageEvent) => {
      const id = pendingIds.current.shift()
      setWaiting(pendingIds.current.length)

      let msg: SocketReply
      try {
        msg = JSON.parse(e.data as string) as SocketReply
      } catch {
        return
      }

      if (msg.type === 'reply') {
        dispatch(applyAiUpdate({ form: msg.form, changed_fields: msg.changed_fields }))
        appendMessage({ role: 'ai', text: msg.reply })
        return
      }
      // Not stored at all: mark the bubble so it doesn't look saved. Stored but the copilot failed: say so.
      if (!msg.saved && id !== undefined) updateMessage(id, { failed: true })
      else appendMessage({ role: 'ai', text: `⚠ ${msg.detail}` })
    }

    const connect = async (freshToken: boolean) => {
      let token = tokenStorage.getAccessToken()
      if (freshToken) {
        try {
          token = await refreshAccessToken()
        } catch {
          // Refresh token expired too: the user has to log in again
          if (!stopped) setStatus('error')
          return
        }
      }
      if (stopped || !token) return

      // Browsers can't set headers on a WebSocket, so the token goes in the query string
      const socket = new WebSocket(
        `ws://127.0.0.1:8000/api/chat/ws?access_token=${encodeURIComponent(token)}`
      )
      wsref.current = socket
      setStatus('connecting')

      socket.onopen = () => {
        attempt = 0
        setStatus('connected')
      }
      socket.onmessage = onMessage
      socket.onclose = (e: CloseEvent) => {
        // Ignore close events from a stale socket that was already replaced
        if (wsref.current !== socket || stopped) return
        wsref.current = null
        // Answers to messages still in flight will never arrive
        pendingIds.current = []
        setWaiting(0)
        setStatus('Disconnected')

        // The backend restarted or the network dropped: try again, waiting 1s, 2s, 4s... up to 10s.
        // 1008 means the server rejected the token (expired after 10 minutes): get a fresh one first.
        const delay = Math.min(1000 * 2 ** attempt, 10000)
        attempt += 1
        retryTimer = setTimeout(() => connect(e.code === 1008), delay)
      }
      socket.onerror = () => {
        // A close event always follows, which schedules the retry
        if (wsref.current === socket) setStatus('Disconnected')
      }
    }

    connect(false)

    return () => {
      stopped = true
      clearTimeout(retryTimer)
      const socket = wsref.current
      if (socket) {
        // Detach handlers so this socket can't touch state after cleanup
        socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null
        socket.close()
        wsref.current = null
      }
    }
  }, [appendMessage, updateMessage, dispatch])

  const connected = status === 'connected'

  const submit = () => {
    const value = text.trim()
    const socket = wsref.current
    if (!value || socket?.readyState !== WebSocket.OPEN) return
    const payload: SocketChatMessage = { message: value, form_id: formId, current_form: currentForm }
    socket.send(JSON.stringify(payload))
    pendingIds.current.push(appendMessage({ role: 'user', text: value }))
    setWaiting(pendingIds.current.length)
    setText('')
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const id = appendMessage({ role: 'user', text: file.name, file: true, uploading: true })
    const res = await upload.callApi(uploadFileRequest(file, formId, currentForm))
    if (!res) {
      updateMessage(id, { uploading: false, failed: true })
      return
    }
    // Show the name the server saved, so it reads the same after the next fetch
    updateMessage(id, { uploading: false, text: res.filename })
    if (res.reply && res.form) {
      dispatch(applyAiUpdate({ form: res.form, changed_fields: res.changed_fields }))
      appendMessage({ role: 'ai', text: res.reply })
    } else if (res.error) {
      appendMessage({ role: 'ai', text: `⚠ ${res.error}` })
    }
  }

  // History loading, or the copilot working on a message or file
  const busy = loading || waiting > 0 || upload.loading

  return (
    <>
      <header className="flex items-start justify-between border-b border-line px-[18px] py-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical size={16} className="text-brand" />
            AIVOA Copilot
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">Drop incident files or paste text below.</p>
        </div>
        <span
          title={status}
          className={cn('mt-1.5 size-[7px] rounded-full', busy ? 'animate-pulse bg-brand' : connected ? 'bg-ready-dot' : 'bg-red-500')}
        />
      </header>

      <div ref={listRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto bg-white px-[18px] py-4">
        {error && <p className="text-center text-xs text-red-600">Could not load chats: {error}</p>}
        {messages.map((m, i) => (
          <Message key={m.id ?? `h${i}`} m={m} isFirst={i === 0} />
        ))}
        {busy && (
          <div className="flex items-start gap-2.5">
            <AiAvatar />
            <div className={cn(bubble, aiBubble)}>
              <div className="mb-2 text-xs">Analyzing…</div>
              <div className="h-1 w-[140px] overflow-hidden rounded-full bg-line">
                <span className="block h-full w-2/3 animate-pulse rounded-full bg-brand" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line-soft px-[18px] pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-card border border-line py-1.5 pr-1.5 pl-3 transition-[border-color,box-shadow] focus-within:border-[#6366f1] focus-within:ring-3 focus-within:ring-[#6366f1]/15">
          <label
            className={cn(
              'grid cursor-pointer place-items-center text-muted transition-colors hover:text-brand',
              upload.loading && 'pointer-events-none opacity-50',
            )}
            aria-label="Attach file"
          >
            <Paperclip size={16} />
            {/* One upload at a time: starting a new call would cancel the previous one */}
            <input type="file" accept=".pdf,.eml,.txt" hidden disabled={upload.loading} onChange={onFile} />
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Type a message or paste an incident report..."
            rows={1}
            className="field-sizing-content max-h-32 flex-1 resize-none bg-transparent py-1 text-[12.5px] text-ink outline-none placeholder:text-muted-2"
          />
          <CommonButton variant="send" onClick={submit} disabled={!connected || !text.trim()} aria-label="Send">
            <Send size={14} />
          </CommonButton>
        </div>
        {status === 'Disconnected' && (
          <p className="pt-2 text-center text-[11px] text-amber-600">Connection lost. Reconnecting…</p>
        )}
        {status === 'error' && (
          <p className="pt-2 text-center text-[11px] text-red-600">Your session has expired. Please log in again.</p>
        )}
        <p className="pt-2 pb-1 text-center text-[9px] font-medium tracking-[0.1em] text-muted-2 uppercase">
          Powered by LangGraph
        </p>
      </div>
    </>
  )
}
