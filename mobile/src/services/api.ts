import { supabase } from './supabase';

// Update the API URL in mobile/.env when testing on a physical device
// e.g., EXPO_PUBLIC_API_URL=http://192.168.1.x:8000
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function apiGet<T = any>(endpoint: string): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

async function apiPost<T = any>(endpoint: string, body: any): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── API Methods ──────────────────────────────────────────

export interface Account {
  id?: number;
  acc_id: string;
  user_id: string;
  sfc_id: number;
  provider: string;
  acc_type: string;
  currency: string;
  balance: number;
  available_balance: number | null;
}

export interface Transaction {
  id: number;
  user_id: string;
  txn_id: string;
  acc_id: string;
  amount: number;
  merchant: string;
  description: string;
  category: string;
  city: string;
  state: string;
  txn_date: number; // epoch
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const api = {
  /** Exchange a SimpleFIN setup token */
  exchangeSetupToken: (setupToken: string) =>
    apiPost<{ message: string }>('/api/exchange_setup', {
      setup_token: setupToken,
    }),

  /** Trigger bank account sync */
  syncAccounts: () =>
    apiGet<{ success: string }>('/api/sync_accounts'),

  /** Get all linked accounts */
  getAccounts: () => apiGet<Account[]>('/api/accounts'),

  /** Get transactions for a specific account */
  getTransactions: (accId: string) =>
    apiGet<Transaction[]>(`/api/transactions?acc_id=${encodeURIComponent(accId)}`),

  /** Ask the financial assistant */
  ask: (question: string, history: ChatMessage[]) =>
    apiPost<{ response: string }>('/api/ask', { question, history }),
};
