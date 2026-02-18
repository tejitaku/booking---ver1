
import { Booking, BookingStatus, ReservationType, AvailabilitySlot, SecondaryStatus } from '../types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * 外部から注入される設定（環境変数）
 */
// Fix: Access VITE_GAS_URL from process.env to avoid TypeScript errors on ImportMeta
export const API_URL = (process.env.VITE_GAS_URL as string) || '';

const API_CONFIG = {
  url: API_URL,
  // Fix: Access VITE_SECURITY_TOKEN from process.env to avoid TypeScript errors on ImportMeta
  token: (process.env.VITE_SECURITY_TOKEN as string) || ''
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

const fetchGasPost = async (action: string, payload: any = {}) => {
  if (!API_CONFIG.url) {
    throw new Error("API URLが設定されていません。Cloudflareの環境変数 VITE_GAS_URL を確認してください。");
  }
  
  try {
    const res = await fetch(API_CONFIG.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ 
        action, 
        payload,
        token: API_CONFIG.token // 合言葉を送信
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
    console.error("GAS API Error:", error);
    throw new Error("Backend API connection failed.");
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
