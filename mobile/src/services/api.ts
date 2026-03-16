import { supabase } from './supabase';
import Constants from 'expo-constants';

// Update the API URL in mobile/.env when testing on a physical device
// e.g., EXPO_PUBLIC_API_URL=http://192.168.1.x:8000
let API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// If not explicitly set in .env, automatically infer the laptop's Wi-Fi IP from Expo
if (__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    API_BASE_URL = `http://${debuggerHost.split(':')[0]}:8000`;
  }
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
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

function debugApiLog(message: string): void {
  if (__DEV__) {
    console.log(`[api-debug] ${message}`);
  }
}

async function apiGet<T = any>(endpoint: string): Promise<T> {
  debugApiLog(`network GET ${endpoint}`);
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
  debugApiLog(`network POST ${endpoint}`);
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

async function apiPut<T = any>(endpoint: string, body: any): Promise<T> {
  debugApiLog(`network PUT ${endpoint}`);
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

async function apiDelete<T = any>(endpoint: string): Promise<T> {
  debugApiLog(`network DELETE ${endpoint}`);
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'DELETE',
    headers,
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
  txn_date: number | string;
  is_flagged_fraud?: boolean;
  is_confirmed_fraud?: boolean | null;
  risk_score?: number;
}

export interface TransactionUpdate {
  merchant?: string;
  description?: string;
  category?: string;
  city?: string;
  state?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FraudTransaction extends Transaction {
  is_flagged_fraud: boolean;
  is_confirmed_fraud: boolean | null;
  risk_score: number;
  feature_breakdown: Record<string, any> | null;
}

export interface Budget {
  id?: string;
  user_id?: string;
  name: string;
  amount: number;
  category: string;
  period: string; // 'daily', 'weekly', 'biweekly', 'monthly', '3-month', '6-month', 'yearly'
  created_at?: string;
  updated_at?: string;
}

export interface WalletCard {
  id: string;
  card_name: string;
  issuer: string;
  card_image_url: string;
  reward_type: string;
  annual_fee: number;
  reward_multipliers: Record<string, number>;
}

export interface LocationEvaluationResponse {
  is_commercial: boolean;
  place_name?: string;
  category?: string;
  best_card_name?: string;
  multiplier?: number;
  matched_key?: string;
  latitude?: number;
  longitude?: number;
}

let userCardsCache: WalletCard[] | null = null;
let userCardsInFlight: Promise<WalletCard[]> | null = null;

async function getUserCardsCached(forceRefresh = false): Promise<WalletCard[]> {
  debugApiLog(`cards request forceRefresh=${String(forceRefresh)}`);

  if (!forceRefresh && userCardsCache) {
    debugApiLog(`cards cache-hit size=${userCardsCache.length}`);
    return userCardsCache;
  }

  if (!forceRefresh && userCardsInFlight) {
    debugApiLog('cards in-flight reuse');
    return userCardsInFlight;
  }

  debugApiLog('cards cache-miss, fetching');

  const fetchPromise = apiGet<WalletCard[]>('/api/user/cards')
    .then((cards) => {
      const normalized = cards || [];
      userCardsCache = normalized;
      return normalized;
    })
    .finally(() => {
      userCardsInFlight = null;
    });

  userCardsInFlight = fetchPromise;
  return fetchPromise;
}

export const api = {
  /** Check if the current user has linked SimpleFIN */
  getSimplefinStatus: () =>
    apiGet<{ linked: boolean }>('/api/simplefin/status'),

  /** Exchange a SimpleFIN setup token */
  exchangeSetupToken: (setupToken: string) =>
    apiPost<{ message: string }>('/api/exchange_setup', {
      setup_token: setupToken,
    }),

  /** Delete current authenticated account and app data */
  deleteAccount: () =>
    apiDelete<{ status: string }>('/api/account'),

  /** Trigger bank account sync */
  syncAccounts: () =>
    apiGet<{ success: string }>('/api/accounts/sync'),

  /** Get latest recorded bank sync timestamp for current user */
  getAccountSyncStatus: () =>
    apiGet<{ last_sync: number | null }>('/api/accounts/sync-status'),

  /** Get all linked accounts */
  getAccounts: () => apiGet<Account[]>('/api/accounts'),

  /** Get transactions for a specific account */
  getTransactions: (accId: string) =>
    apiGet<Transaction[]>(`/api/transactions?acc_id=${encodeURIComponent(accId)}`),

  /** Update editable transaction fields */
  updateTransaction: (txnId: string, transaction: TransactionUpdate) =>
    apiPut<any>(`/api/transactions/${encodeURIComponent(txnId)}`, transaction),

  /** Get all fraud-flagged transactions */
  getFraudulentTransactions: () =>
    apiGet<FraudTransaction[]>('/api/transactions/fraud'),

  /** Confirm or dismiss a fraud alert */
  updateFraudStatus: (txnId: string, isConfirmedFraud: boolean) =>
    apiPost<any>(
      `/api/transactions/update-fraud-status?txn_id=${encodeURIComponent(txnId)}&is_confirmed_fraud=${isConfirmedFraud}`,
      {},
    ),

  /** Ask the payments assistant */
  ask: (question: string, history?: ChatMessage[]) =>
    apiPost<{ response: string }>('/api/ask', {
      question,
      history: history || [],
    }),

  /** Get active budgets */
  getBudgets: () =>
    apiGet<Budget[]>('/api/transactions/budgets'),

  /** Create a new budget */
  createBudget: (budget: Omit<Budget, 'id' | 'user_id' | 'created_at' | 'updated_at'>) =>
    apiPost<{ status: string }>('/api/transactions/create-budget', budget),
    
  /** Update an existing budget */
  updateBudget: (budgetId: string, budget: Partial<Budget>) =>
    apiPut<{ status: string }>(`/api/transactions/budgets/${budgetId}`, budget),
    
  /** Delete a budget */
  deleteBudget: (budgetId: string) =>
    apiDelete<{ status: string }>(`/api/transactions/budgets/${budgetId}`),

  /** Save a user's selected wallet cards */
  saveUserCards: async (cards: WalletCard[]) => {
    const response = await apiPost<{ status?: string; success?: boolean; count?: number; cards?: WalletCard[] }>('/api/user/cards', { cards });
    userCardsCache = response.cards || cards;
    return response;
  },

  /** Get the user's saved wallet cards */
  getUserCards: (forceRefresh = false) =>
    getUserCardsCached(forceRefresh),

  /** Evaluate a location for the best card recommendation */
  evaluateLocation: (payload: { latitude: number; longitude: number }) =>
    apiPost<LocationEvaluationResponse>('/api/location/evaluate', payload),
};
