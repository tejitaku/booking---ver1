
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
  email?: string;
  phone?: string;
  dietaryRestrictions?: string;
  country?: string;
}

export interface Booking {
  id: string;
  type: ReservationType;
  date: string;
  time: string;
  adults: number;
  adultsNonAlc: number;
  children: number;
  infants: number;
  totalPrice: number;
  status: BookingStatus;
  secondaryStatus?: SecondaryStatus;
  representative: GuestInfo;
  guests: GuestInfo[];
  createdAt: string;
  confirmedAt?: string; // 追加
  adminNotes?: string;
  stripeSessionId?: string; // セッションIDを保存
}

export interface CalendarEvent {
  id: string;
  start: string;
  end: string;
  title: string;
}

export interface AvailabilitySlot {
  time: string;
  available: boolean;
  reason?: 'full' | 'closed';
  currentGroupCount?: number;
}
