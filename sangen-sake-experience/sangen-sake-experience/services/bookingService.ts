import { Booking, BookingStatus, ReservationType, AvailabilitySlot, SecondaryStatus } from '../types';

// =============================================================================
// CONFIGURATION
// =============================================================================
/**
 * GASの「ウェブアプリURL」
 * 提供されたURLをデフォルトとして設定しました。
 */
export const API_URL = (import.meta.env?.VITE_GAS_URL as string) || 'https://script.google.com/macros/s/AKfycbwc3T-cqgKYlPvedc8cvrheq3Ww-f36pkxshDQWeRpmMB3DVtzg2ZofSnO31EPUHa0t1w/exec'; 

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

const fetchGasPost = async (action: string, payload: any = {}) => {
  if (!API_URL) {
    throw new Error("API_URLが設定されていません。GASのURLを確認してください。");
  }
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
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
    throw new Error("Backend API connection failed. GASのURLが正しいか、公開設定が「全員(Anyone)」になっているか確認してください。");
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
