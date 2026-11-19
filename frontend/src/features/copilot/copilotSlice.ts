import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { sendChat, uploadDocument, type RcaFormData } from '../../api/client'
import { applyAiUpdate } from '../rca/rcaSlice'

export interface ChatMessage {
  role: 'ai' | 'user'
  text: string
  file?: boolean
}

interface CopilotState {
  messages: ChatMessage[]
  loading: boolean
}

// Typed by hand (not RootState) to avoid a circular import with app/store.ts
type ThunkState = { rca: { form: RcaFormData } }

export const sendMessage = createAsyncThunk<string, string, { state: ThunkState }>(
  'copilot/send',
  async (message, { getState, dispatch }) => {
    const data = await sendChat(message, getState().rca.form)
    dispatch(applyAiUpdate(data))
    return data.reply
  },
)

export const sendFile = createAsyncThunk<string, File>('copilot/upload', async (file, { dispatch }) => {
  const data = await uploadDocument(file)
  dispatch(applyAiUpdate(data))
  return data.reply
})

const initialState: CopilotState = { messages: [], loading: false }

const copilotSlice = createSlice({
  name: 'copilot',
  initialState,
  reducers: {
    addUserMessage(state, action: PayloadAction<Omit<ChatMessage, 'role'>>) {
      state.messages.push({ role: 'user', ...action.payload })
    },
  },
  extraReducers: (b) => {
    const pending = (s: CopilotState) => { s.loading = true }
    const done = (s: CopilotState, a: PayloadAction<string>) => {
      s.loading = false
      s.messages.push({ role: 'ai', text: a.payload })
    }
    const failed = (s: CopilotState, a: { error: { message?: string } }) => {
      s.loading = false
      s.messages.push({ role: 'ai', text: `Error: ${a.error.message ?? 'Unknown error'}` })
    }
    b.addCase(sendMessage.pending, pending).addCase(sendMessage.fulfilled, done).addCase(sendMessage.rejected, failed)
    b.addCase(sendFile.pending, pending).addCase(sendFile.fulfilled, done).addCase(sendFile.rejected, failed)
  },
})

export const { addUserMessage } = copilotSlice.actions
export default copilotSlice.reducer
