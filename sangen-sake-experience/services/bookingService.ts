
import { Booking, BookingStatus, ReservationType, AvailabilitySlot, SecondaryStatus } from '../types';

const getEnv = (key: string): string => {
  // @ts-ignore
  const env = import.meta.env;
  if (env && env[key]) return env[key];
  try {
    return (globalThis as any)?.[key] || (typeof process !== 'undefined' ? process.env[key] : '') || '';
  } catch {
    return '';
  }
};

export const API_URL = getEnv('VITE_GAS_URL');
const SECURITY_TOKEN = getEnv('VITE_SECURITY_TOKEN');

const fetchGasPost = async (action: string, payload: any = {}) => {
  if (!API_URL) {
    throw new Error("VITE_GAS_URL が設定されていません。");
  }
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token: SECURITY_TOKEN }),
      redirect: 'follow'
    });
    
    if (!res.ok) throw new Error(`GAS通信エラー: ${res.status}`);

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("GASからの応答がJSONではありません。デプロイの権限設定を確認してください。");
    }

    if (data.error) throw new Error(data.error);
    return data;
  } catch (error: any) {
    console.error("GAS Connection Error:", error);
    throw error;
  }
};

export const BookingService = {
  testConfig: async () => {
    return await fetchGasPost('testConfig');
  },
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
