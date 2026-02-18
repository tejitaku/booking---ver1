
import { Booking, BookingStatus, ReservationType, AvailabilitySlot, SecondaryStatus } from '../types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * 外部から注入される設定（環境変数）を安全に取得します。
 * process.env への直接アクセスは、環境によっては eval() を含むポリフィルを誘発するため、
 * typeof チェックと globalThis を使用した安全なアクセスに切り替えます。
 */
const getEnvVar = (key: string): string => {
  try {
    // 1. globalThis (window) に直接定義されている可能性をチェック
    const globalVal = (globalThis as any)?.[key];
    if (typeof globalVal === 'string') return globalVal;
    
    // 2. process.env の安全なチェック
    if (typeof process !== 'undefined' && process?.env) {
      const val = process.env[key];
      if (typeof val === 'string') return val;
    }

    // 3. Viteの環境変数の可能性
    // @ts-ignore
    const viteVal = import.meta.env?.[key];
    if (typeof viteVal === 'string') return viteVal;

    return '';
  } catch (e) {
    return '';
  }
};

// API_URL の取得
export const API_URL = getEnvVar('VITE_GAS_URL') || '';

const API_CONFIG = {
  url: API_URL,
  token: getEnvVar('VITE_SECURITY_TOKEN') || ''
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

const fetchGasPost = async (action: string, payload: any = {}) => {
  if (!API_CONFIG.url) {
    console.warn("API URL (VITE_GAS_URL) is not configured in environment variables.");
    throw new Error("API URLが設定されていません。環境変数を確認してください。");
  }
  
  try {
    const res = await fetch(API_CONFIG.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
        action, 
        payload,
        token: API_CONFIG.token 
      }),
      redirect: 'follow'
    });
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const text = await res.text();
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    return data;
  } catch (error) {
    console.error("GAS API Connection Error:", error);
    throw new Error("サーバーとの通信に失敗しました。URLや合言葉を確認してください。");
  }
};

export const BookingService = {
  getAvailability: async (date: string, type: ReservationType): Promise<AvailabilitySlot[]> => {
    return await fetchGasPost('getAvailability', { date, type });
  },
  getMonthStatus: async (year: number, month: number, type: ReservationType): Promise<Record<string, boolean>> => {
    return await fetchGasPost('getMonthStatus', { year, month, type });
  },
  createBooking: async (bookingData: any): Promise<{ booking: Booking, checkoutUrl?: string }> => {
    const data = await fetchGasPost('createBooking', bookingData);
    return { 
      booking: { ...bookingData, id: data.id, status: BookingStatus.REQUESTED, createdAt: new Date().toISOString() }, 
      checkoutUrl: data.checkoutUrl 
    };
  },
  getBookings: async (): Promise<Booking[]> => {
    return await fetchGasPost('getBookings');
  },
  updateBookingStatus: async (id: string, status: BookingStatus, notes?: string): Promise<void> => {
    await fetchGasPost('updateStatus', { id, status, notes });
  },
  updateSecondaryStatus: async (id: string, status: SecondaryStatus): Promise<void> => {
    await fetchGasPost('updateStatus', { id, secondaryStatus: status });
  },
  login: async (email: string, pass: string): Promise<boolean> => {
    const data = await fetchGasPost('login', { email, password: pass });
    return data.success;
  }
};
