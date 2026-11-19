import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import rcaReducer from '../features/rca/rcaSlice'
import copilotReducer from '../features/copilot/copilotSlice'

export const store = configureStore({
  reducer: {
    rca: rcaReducer,         // RCA form values (only the AI writes here)
    copilot: copilotReducer, // chat messages + loading state
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Typed hooks: use these instead of plain useDispatch/useSelector
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
