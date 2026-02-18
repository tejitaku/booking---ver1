import { Booking, BookingStatus, ReservationType, AvailabilitySlot, SecondaryStatus } from '../types';

// =============================================================================
// CONFIGURATION
// =============================================================================
// 1. Deploy your Google Apps Script (Web App).
// 2. Paste the "Current web app URL" below.
// IMPORTANT: You MUST Deploy as "Execute as: Me" and "Access: Anyone".
export const API_URL = 'https://script.google.com/macros/s/AKfycbxsZgAqLGDkdSP1R7Xr4osTd8GgU5E9vbw3fZOXJrLCev9Y_BnM2FW4dPYze3pr0-OHOA/exec'; 

// =============================================================================
// MOCK DATA (Fallback)
// =============================================================================
let MOCK_BOOKINGS: Booking[] = [
  {
    id: 'bk_mock_1',
    type: ReservationType.PRIVATE,
    date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    time: '14:00',
    adults: 2,
    adultsNonAlc: 0,
    children: 0,
    infants: 0,
    totalPrice: 48400,
    status: BookingStatus.REQUESTED,
    representative: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+1 555 0199',
      country: 'USA'
    },
    guests: [{ firstName: 'Jane', lastName: 'Doe' }],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  }
];

// Helper to handle GAS CORS quirks for POST requests with TIMEOUT
const fetchGasPost = async (action: string, payload: any = {}) => {
  if (!API_URL || !API_URL.startsWith('http')) throw new Error("Invalid API URL");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Bypass CORS preflight
      },
      body: JSON.stringify({ action, payload }),
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    
    // Try parsing JSON, handle HTML error responses from Google (e.g. login page or 404)
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse GAS response:", text);
      let errorMsg = "Server Error (Not JSON).";
      if (text.includes("You do not have permission")) errorMsg = "Error: Script cannot access Spreadsheet/Calendar. Check permissions.";
      else if (text.includes("ScriptError")) errorMsg = "Error: Script Error inside GAS.";
      else if (text.includes("<title>")) {
          const titleMatch = text.match(/<title>(.*?)<\/title>/);
          if (titleMatch) errorMsg = `GAS Error: ${titleMatch[1]}`;
      }
      throw new Error(`${errorMsg} (Check Console for details)`);
    }

    if (data.error) throw new Error(data.error);
    return data;
  } catch (e: any) {
    clearTimeout(timeoutId);
    
    // Handle Timeout
    if (e.name === 'AbortError') {
       console.warn("GAS API Timeout. Switching to fallback mode.");
       throw new Error('MOCK_FALLBACK');
    }

    // If network fails (e.g. CORS, Offline, Blocked), rethrow specially to allow fallback
    if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
      console.warn("GAS API Connection Failed (CORS/Network). Switching to fallback mode.");
      throw new Error('MOCK_FALLBACK');
    }
    throw e;
  }
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

export const BookingService = {
  
  // 1. Get Availability
  getAvailability: async (date: string, type: ReservationType): Promise<AvailabilitySlot[]> => {
    // Check if API_URL is set; if not, immediately use mock
    if (!API_URL || !API_URL.startsWith('http')) {
      return BookingService._getMockAvailability(date);
    }

    try {
      return await fetchGasPost('getAvailability', { date, type });
    } catch (e: any) {
      if (e.message === 'MOCK_FALLBACK') {
        return BookingService._getMockAvailability(date);
      }
      console.error("API Error (getAvailability)", e);
      throw e; 
    }
  },

  // 1.5 Get Month Status (New)
  getMonthStatus: async (year: number, month: number, type: ReservationType): Promise<Record<string, boolean>> => {
    if (!API_URL || !API_URL.startsWith('http')) {
        return BookingService._getMockMonthStatus(year, month);
    }

    try {
      return await fetchGasPost('getMonthStatus', { year, month, type });
    } catch (e: any) {
      if (e.message === 'MOCK_FALLBACK') {
          return BookingService._getMockMonthStatus(year, month);
      }
      console.warn("API Error (getMonthStatus). Falling back to assuming all open.", e);
      return {}; // Return empty means don't block any dates
    }
  },

  // 2. Create Booking (Updated to return Checkout URL)
  createBooking: async (bookingData: Omit<Booking, 'id' | 'status' | 'createdAt'>): Promise<{ booking: Booking, checkoutUrl?: string }> => {
    if (API_URL && API_URL.startsWith('http')) {
      try {
        const data = await fetchGasPost('createBooking', bookingData);
        const booking = { ...bookingData, id: data.id, status: BookingStatus.REQUESTED, createdAt: new Date().toISOString() };
        return { booking, checkoutUrl: data.checkoutUrl };
      } catch (e: any) {
         if (e.message === 'MOCK_FALLBACK') {
             const b = await BookingService._createMockBooking(bookingData);
             return { booking: b };
         }
         throw e;
      }
    } else {
      const b = await BookingService._createMockBooking(bookingData);
      return { booking: b };
    }
  },

  // 3. Admin: Get All Bookings
  getBookings: async (): Promise<Booking[]> => {
    if (API_URL && API_URL.startsWith('http')) {
      try {
        return await fetchGasPost('getBookings');
      } catch (e: any) {
        if (e.message === 'MOCK_FALLBACK') return [...MOCK_BOOKINGS];
        throw e;
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 600));
      return [...MOCK_BOOKINGS];
    }
  },

  // 4. Admin: Update Status
  updateBookingStatus: async (id: string, status: BookingStatus, notes?: string): Promise<void> => {
    if (API_URL && API_URL.startsWith('http')) {
      try {
        await fetchGasPost('updateStatus', { id, status, notes });
        return;
      } catch (e: any) {
        if (e.message !== 'MOCK_FALLBACK') throw e;
      }
    }
    const booking = MOCK_BOOKINGS.find(b => b.id === id);
    if(booking) booking.status = status;
  },

  // 5. Admin: Update Secondary Status
  updateSecondaryStatus: async (id: string, status: SecondaryStatus): Promise<void> => {
     if (API_URL && API_URL.startsWith('http')) {
       try {
         // Ideally implement 'updateSecondary' in GAS
         return; 
       } catch (e: any) {
         if (e.message !== 'MOCK_FALLBACK') console.error(e);
       }
    }
  },

  // 6. Admin: Login
  login: async (email: string, pass: string): Promise<boolean> => {
    if (API_URL && API_URL.startsWith('http')) {
      try {
        const data = await fetchGasPost('login', { email, password: pass });
        return data.success;
      } catch (e: any) {
         if (e.message === 'MOCK_FALLBACK') return (email === 'admin@sangen.com' && pass === 'sake');
         return false;
      }
    } else {
      return (email === 'admin@sangen.com' && pass === 'sake');
    }
  },

  // --- INTERNAL MOCK HELPERS ---
  _getMockAvailability: async (date: string) => {
      console.warn(`[Mock] Generating availability for ${date}`);
      await new Promise(resolve => setTimeout(resolve, 500));
      return ['10:00', '12:00', '14:00', '16:00', '18:00'].map(time => ({
          time, 
          available: true,
          currentGroupCount: 0
      }));
  },
  
  _getMockMonthStatus: async (year: number, month: number) => {
      // Mock: Randomly mark some days as full to demonstrate the UI
      const status: Record<string, boolean> = {};
      const days = new Date(year, month, 0).getDate();
      
      const today = new Date();
      // Only "Open" for current month and next month. Everything else is closed.
      const isAvailableMonth = 
        year === today.getFullYear() && 
        (month === today.getMonth() + 1 || month === today.getMonth() + 2);

      for(let d=1; d<=days; d++) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          
          if (!isAvailableMonth) {
            // Far future or past -> Closed
            status[dateStr] = false;
          } else {
             // Current or Next Month
             // Make 26-28 full for demo
             if (d === 26 || d === 27 || d === 28) {
               status[dateStr] = false;
             } else {
               status[dateStr] = true;
             }
          }
      }
      return status;
  },

  _createMockBooking: async (bookingData: any) => {
      console.warn(`[Mock] Creating booking`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newBooking: Booking = {
        ...bookingData,
        id: `bk_${Date.now()}`,
        status: BookingStatus.REQUESTED,
        createdAt: new Date().toISOString(),
      };
      MOCK_BOOKINGS.push(newBooking);
      return newBooking;
  }
};