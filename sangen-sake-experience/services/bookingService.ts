
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
  if (!API_URL) throw new Error("VITE_GAS_URL is not configured.");
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token: SECURITY_TOKEN }),
      redirect: 'follow'
    });
    
    if (!res.ok) throw new Error(`GAS Error: ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    return data;
  } catch (error: any) {
    console.error("GAS Connection Error:", error);
    throw error;
  }
};

export const BookingService = {
  testConfig: async () => fetchGasPost('testConfig'),
  getAvailability: async (date: string, type: ReservationType): Promise<AvailabilitySlot[]> => {
    const year = parseInt(date.split('-')[0]);
    const month = parseInt(date.split('-')[1]);
    const monthData = await fetchGasPost('getMonthStatus', { year, month, type });
    return monthData[date] || [];
  },
  getMonthStatus: async (year: number, month: number, type: ReservationType, force: boolean = false): Promise<Record<string, AvailabilitySlot[]>> => 
    fetchGasPost('getMonthStatus', { year, month, type, force }),
    
  createBooking: async (bookingData: any): Promise<{ booking: Booking, checkoutUrl?: string }> => {
    const data = await fetchGasPost('createBooking', bookingData);
    return { 
      booking: { ...bookingData, id: data.id, status: BookingStatus.REQUESTED, createdAt: new Date().toISOString() }, 
      checkoutUrl: data.checkoutUrl 
    };
  },
  getBookings: async (): Promise<Booking[]> => fetchGasPost('getBookings'),
  updateBookingStatus: async (id: string, status: BookingStatus, notes?: string, refundAmount?: number): Promise<void> => {
    await fetchGasPost('updateStatus', { id, status, notes, refundAmount });
  },
  updateSecondaryStatus: async (id: string, status: SecondaryStatus): Promise<void> => {
    await fetchGasPost('updateStatus', { id, secondaryStatus: status });
  },
  deleteBooking: async (id: string): Promise<void> => {
    await fetchGasPost('deleteBooking', { id });
  },
  getEmailTemplates: async (): Promise<Record<string, string>> => fetchGasPost('getEmailTemplate'),
  updateEmailTemplate: async (key: string, value: string): Promise<void> => {
    await fetchGasPost('updateEmailTemplate', { key, value });
  },
  sendTestEmail: async (type: string): Promise<any> => fetchGasPost('sendTestEmail', { type }),
  login: async (email: string, pass: string): Promise<boolean> => {
    const data = await fetchGasPost('login', { email, password: pass });
    return data.success;
  }
};
