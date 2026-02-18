import { ReservationType } from '../types';

export const calculatePriceBreakdown = (
  type: ReservationType,
  adults: number, // 20+
  adultsNonAlc: number, // 13+
  children: number, // 5-12
  infants: number // 0-4
) => {
  let adultTotal = 0;
  let nonAlcTotal = 0;
  let childTotal = 0;

  if (type === ReservationType.PRIVATE) {
    // Private Tasting Logic
    // Adult [Age 20+] Tiered Pricing
    if (adults === 1) adultTotal = 36300;
    else if (adults === 2) adultTotal = 48400;
    else if (adults === 3) adultTotal = 66000;
    else if (adults === 4) adultTotal = 79200;
    else if (adults >= 5) {
      adultTotal = 79200 + ((adults - 4) * 19800);
    }
    
    nonAlcTotal = adultsNonAlc * 13200;
    childTotal = children * 5500;
  } else {
    // Group Tasting Logic
    adultTotal = adults * 11000;
    nonAlcTotal = adultsNonAlc * 8800;
    childTotal = children * 3300;
  }

  const subTotal = adultTotal + nonAlcTotal + childTotal;
  const bookingFee = Math.floor(subTotal * 0.015);
  const total = subTotal + bookingFee;

  return {
    adultTotal,
    nonAlcTotal,
    childTotal,
    subTotal,
    bookingFee,
    total
  };
};

export const calculatePrice = (
  type: ReservationType,
  adults: number, // 20+
  adultsNonAlc: number, // 13+
  children: number, // 5-12
  infants: number // 0-4
): number => {
  return calculatePriceBreakdown(type, adults, adultsNonAlc, children, infants).total;
};

export const calculateCancellationFee = (
  bookingDateStr: string,
  totalAmount: number
): { fee: number; percentage: number } => {
  const bookingDate = new Date(bookingDateStr);
  const today = new Date();
  
  // Reset time for accurate day calculation
  bookingDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffTime = bookingDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let percentage = 0;

  if (diffDays >= 14 && diffDays <= 31) {
    percentage = 25;
  } else if (diffDays >= 7 && diffDays <= 13) {
    percentage = 50;
  } else if (diffDays >= 3 && diffDays <= 6) {
    percentage = 75;
  } else if (diffDays >= 0 && diffDays <= 2) {
    percentage = 100;
  }
  // If > 31 days, 0%

  return {
    fee: Math.floor(totalAmount * (percentage / 100)),
    percentage
  };
};