import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { UserResponse } from '../../services/api/contracts';

export interface AuthState {
  user: UserResponse | null;
  expiresAt: number | null;
  epoch: number;
  reason: 'expired' | 'signed-out' | null;
}
const initialState: AuthState = { user: null, expiresAt: null, epoch: 0, reason: null };
const slice = createSlice({
  name: 'auth', initialState,
  reducers: {
    sessionStarted(state, action: PayloadAction<{ user: UserResponse; expiresAt: number; epoch: number }>) {
      if (state.epoch !== action.payload.epoch) return;
      state.user = action.payload.user;
      state.expiresAt = action.payload.expiresAt;
      state.reason = null;
    },
    profileReceived(state, action: PayloadAction<UserResponse>) {
      if (state.user?.id === action.payload.id) state.user = action.payload;
    },
    sessionEnded(state, action: PayloadAction<AuthState['reason']>) {
      state.user = null;
      state.expiresAt = null;
      state.epoch++;
      state.reason = action.payload;
    },
  },
});
export const { sessionStarted, sessionEnded, profileReceived } = slice.actions;
export const authReducer = slice.reducer;
