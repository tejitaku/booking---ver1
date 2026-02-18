export enum ReservationType {
  PRIVATE = 'PRIVATE',
  GROUP = 'GROUP'
}

export enum BookingStatus {
  REQUESTED = 'REQUESTED',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW'
}

export type SecondaryStatus = 'ARRIVED' | 'NO_SHOW' | '';

export interface GuestInfo {
  firstName: string;
  lastName: string;
  email?: string; // Only for representative
  phone?: string; // Only for representative
  dietaryRestrictions?: string;
  country?: string;
}

export interface Booking {
  id: string;
  type: ReservationType;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  adults: number; // 20+
  adultsNonAlc: number; // 13+
  children: number; // 5-12
  infants: number; // 0-4
  totalPrice: number;
  status: BookingStatus;
  secondaryStatus?: SecondaryStatus;
  representative: GuestInfo;
  guests: GuestInfo[]; // Excluding representative
  createdAt: string; // ISO String
  adminNotes?: string;
  stripePaymentId?: string; // Mock payment ID
}

export interface CalendarEvent {
  id: string;
  start: string; // ISO
  end: string; // ISO
  title: string;
}

export interface AvailabilitySlot {
  time: string;
  available: boolean;
  reason?: 'full' | 'closed';
  currentGroupCount?: number;
}