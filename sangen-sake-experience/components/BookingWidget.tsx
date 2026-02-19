
// Add React to the imports to resolve namespace errors in FC and Dispatch types
import React, { useState, useEffect, useMemo } from 'react';
import { ReservationType, AvailabilitySlot } from '../types';
import { BookingService } from '../services/bookingService';
import { calculatePriceBreakdown } from '../utils/pricing';
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Plus, Minus, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';

interface BookingWidgetProps {
  reservationType: ReservationType;
  onProceed: (data: any) => void;
}

const MAX_CAPACITY = 6;

// キャッシュをコンポーネントの外で保持（タブを開いている間有効）
const monthStatusCache: Record<string, Record<string, boolean>> = {};

const BookingWidget: React.FC<BookingWidgetProps> = ({ reservationType, onProceed }) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  
  // 年月選択モードの状態
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [monthStatus, setMonthStatus] = useState<Record<string, boolean>>({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  // Guest Counts
  const [adults, setAdults] = useState(0);
  const [adultsNonAlc, setAdultsNonAlc] = useState(0);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  const [showCapacityError, setShowCapacityError] = useState(false);

  const totalPeople = adults + adultsNonAlc + children + infants;
  const priceDetails = calculatePriceBreakdown(reservationType, adults, adultsNonAlc, children, infants);

  const currentSlot = slots.find(s => s.time === selectedTime);
  const remainingCapacity = (reservationType === ReservationType.GROUP && currentSlot)
    ? Math.max(0, MAX_CAPACITY - (currentSlot.currentGroupCount || 0))
    : MAX_CAPACITY;

  // 予約枠の取得
  useEffect(() => {
    if (selectedDate) {
      setLoadingSlots(true);
      setFetchError(null);
      BookingService.getAvailability(selectedDate, reservationType)
        .then(data => {
          setSlots(data);
          setSelectedTime('');
        })
        .catch(err => {
          console.error(err);
          setFetchError(err.message || 'Failed to fetch schedule');
          setSlots([]);
        })
        .finally(() => setLoadingSlots(false));
    }
  }, [selectedDate, reservationType]);

  // 月間ステータスの取得（キャッシュ対応）
  useEffect(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth() + 1;
    const cacheKey = `${reservationType}_${year}_${month}`;

    if (monthStatusCache[cacheKey]) {
      setMonthStatus(monthStatusCache[cacheKey]);
      setLoadingMonth(false);
      return;
    }

    setLoadingMonth(true);
    BookingService.getMonthStatus(year, month, reservationType)
      .then(statusMap => {
        const result = statusMap || {};
        monthStatusCache[cacheKey] = result;
        setMonthStatus(result);
      })
      .catch(e => {
        console.error("Failed to fetch month status", e);
        setMonthStatus({});
      })
      .finally(() => setLoadingMonth(false));
  }, [viewDate, reservationType]);

  const today = new Date();
  today.setHours(0,0,0,0);

  const isPrevDisabled = 
    viewDate.getFullYear() < today.getFullYear() || 
    (viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() <= today.getMonth());

  const handlePrevMonth = () => {
    if (isPrevDisabled) return;
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleMonthYearSelect = (year: number, monthIndex: number) => {
    setViewDate(new Date(year, monthIndex, 1));
    setShowMonthPicker(false);
  };

  const handleGuestChange = (setter: React.Dispatch<React.SetStateAction<number>>, currentVal: number, delta: number) => {
    const effectiveLimit = selectedTime ? remainingCapacity : MAX_CAPACITY;

    if (delta > 0 && totalPeople >= effectiveLimit) {
      setShowCapacityError(true);
      setTimeout(() => setShowCapacityError(false), 3000);
      return;
    }
    setShowCapacityError(false);
    setter(Math.max(0, currentVal + delta));
  };

  const renderMonthPicker = () => {
    const currentYear = today.getFullYear();
    const years = [currentYear, currentYear + 1, currentYear + 2];
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    return (
      <div className="absolute inset-0 z-20 bg-white p-4 animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-700">Select Month & Year</h3>
          <button 
            onClick={() => setShowMonthPicker(false)}
            className="text-xs text-gray-400 hover:text-stone-900 font-bold"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-6">
          {years.map(year => (
            <div key={year}>
              <div className="text-xs font-bold text-stone-400 mb-2 border-b pb-1">{year}</div>
              <div className="grid grid-cols-4 gap-2">
                {months.map((m, idx) => {
                  const isMonthPast = year === currentYear && idx < today.getMonth();
                  const isCurrentView = viewDate.getFullYear() === year && viewDate.getMonth() === idx;
                  
                  return (
                    <button
                      key={m}
                      disabled={isMonthPast}
                      onClick={() => handleMonthYearSelect(year, idx)}
                      className={`py-2 text-xs rounded transition-colors ${
                        isCurrentView 
                          ? 'bg-stone-900 text-white font-bold' 
                          : isMonthPast 
                          ? 'text-gray-200 cursor-not-allowed' 
                          : 'hover:bg-stone-100 text-gray-600'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const firstDay = (firstDayIndex + 6) % 7; 
    
    const weeks = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div className="bg-white rounded border border-gray-200 p-4 relative min-h-[300px]">
        {showMonthPicker && renderMonthPicker()}

        <div className="flex justify-between items-center mb-4">
          <button 
            onClick={handlePrevMonth} 
            disabled={isPrevDisabled}
            className={`p-1 rounded text-gray-600 ${isPrevDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'}`}
          >
            <ChevronLeft size={20} />
          </button>
          
          <button 
            onClick={() => setShowMonthPicker(!showMonthPicker)}
            className="flex items-center space-x-2 px-3 py-1 rounded-full hover:bg-stone-100 transition-colors group"
          >
            <span className="font-bold text-gray-800">
              {viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <CalendarIcon size={14} className="text-stone-400 group-hover:text-stone-600" />
            {loadingMonth && <Loader2 className="animate-spin text-stone-400 ml-1" size={14} />}
          </button>

          <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600">
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {weeks.map(w => (
                <div key={w} className="text-xs font-bold text-gray-400 uppercase tracking-wide">{w}</div>
            ))}
        </div>
        <div className="grid grid-cols-7 gap-1 justify-items-center">
            {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dateObj = new Date(year, month, d);
                
                const isPast = dateObj < today;
                const isSelected = selectedDate === dateStr;
                
                // Determine if unavailable:
                const isUnavailable = !isPast && !loadingMonth && monthStatus[dateStr] !== true;

                let buttonClass = `h-9 w-9 rounded-full flex items-center justify-center text-sm transition-all duration-200 relative overflow-hidden `;
                
                if (isSelected) {
                    buttonClass += 'bg-stone-900 text-white font-bold shadow-md transform scale-105';
                } else if (isPast) {
                    buttonClass += 'text-gray-200 cursor-not-allowed';
                } else if (isUnavailable) {
                    buttonClass += 'text-gray-400 font-medium cursor-not-allowed';
                } else {
                    buttonClass += 'hover:bg-stone-100 text-gray-700 hover:scale-105';
                }

                return (
                    <button
                        key={d}
                        disabled={isPast || isUnavailable}
                        onClick={() => setSelectedDate(dateStr)}
                        className={buttonClass}
                        title={isUnavailable ? "Fully Booked / Closed" : ""}
                    >
                        <span className="relative z-10">{d}</span>
                        {isUnavailable && !isPast && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none p-[1px]" viewBox="0 0 100 100">
                                <line 
                                  x1="25" y1="25" 
                                  x2="75" y2="75" 
                                  stroke="#d1d5db" // gray-300
                                  strokeWidth="4" 
                                  strokeLinecap="round" 
                                  className="opacity-90"
                                />
                            </svg>
                        )}
                    </button>
                );
            })}
        </div>
      </div>
    );
  };

  const canRequest = 
    selectedDate && 
    selectedTime && 
    totalPeople > 0 && 
    totalPeople <= (selectedTime ? remainingCapacity : MAX_CAPACITY);

  const handleSubmit = () => {
    onProceed({
      type: reservationType,
      date: selectedDate,
      time: selectedTime,
      adults,
      adultsNonAlc,
      children,
      infants,
      totalPrice: priceDetails.total
    });
  };

  return (
    <div className="max-w-md mx-auto bg-white shadow-xl rounded-lg overflow-hidden border border-gray-100">
      <div className="p-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Select Date</label>
          {renderCalendar()}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Select Time</label>
          {loadingSlots ? (
            <div className="flex justify-center p-4">
              <Loader2 className="animate-spin text-stone-600" />
            </div>
          ) : fetchError ? (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded border border-red-200 flex flex-col items-center text-center">
              <AlertCircle size={20} className="mb-2" />
              <p>Connection Error: {fetchError}</p>
              <button 
                onClick={() => setSelectedDate(selectedDate)}
                className="mt-2 flex items-center text-xs font-bold uppercase tracking-wide bg-white px-3 py-1 rounded border border-red-300 hover:bg-red-50"
              >
                <RefreshCw size={12} className="mr-1" /> Retry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => {
                 const slotRemaining = reservationType === ReservationType.GROUP 
                    ? MAX_CAPACITY - (slot.currentGroupCount || 0)
                    : MAX_CAPACITY;
                 const isEnoughSpace = totalPeople <= slotRemaining;
                 const isDisabled = !slot.available || !isEnoughSpace;

                 return (
                  <button
                    key={slot.time}
                    disabled={isDisabled}
                    onClick={() => setSelectedTime(slot.time)}
                    className={`py-2 px-1 text-sm rounded border ${
                      selectedTime === slot.time
                        ? 'bg-stone-700 text-white border-stone-700'
                        : !isDisabled
                        ? 'bg-white text-gray-800 border-gray-300 hover:border-stone-500'
                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {slot.time}
                    {reservationType === ReservationType.GROUP && !isDisabled && slot.currentGroupCount! > 0 && (
                      <span className="block text-[10px] text-gray-500">
                        {slotRemaining} left
                      </span>
                    )}
                  </button>
                );
              })}
              {slots.length === 0 && selectedDate && !fetchError && (
                <div className="col-span-3 text-sm text-gray-500 text-center bg-gray-50 p-4 rounded">
                    No slots available for this date.
                </div>
              )}
              {slots.length === 0 && !selectedDate && (
                 <p className="col-span-3 text-sm text-gray-400 text-center">Please select a date first.</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <label className="block text-sm font-semibold text-gray-700">Guests</label>
          {[
            { label: 'Adults (20+)', val: adults, set: setAdults },
            { label: 'Alcohol-Free (13+)', val: adultsNonAlc, set: setAdultsNonAlc },
            { label: 'Children (5-12)', val: children, set: setChildren },
            { label: 'Infants (0-4)', val: infants, set: setInfants },
          ].map((g, i) => (
            <div key={i} className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">{g.label}</div>
              </div>
              <div className="flex items-center space-x-3 bg-gray-50 p-1 rounded-full border border-gray-100">
                <button 
                  onClick={() => handleGuestChange(g.set, g.val, -1)}
                  disabled={g.val === 0}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm ${
                    g.val === 0 ? 'bg-white text-gray-300 cursor-not-allowed' : 'bg-white hover:bg-gray-50 text-stone-900 border border-gray-200'
                  }`}
                >
                  <Minus size={14} strokeWidth={2.5} />
                </button>
                <span className="w-8 text-center text-sm font-bold text-gray-700">{g.val}</span>
                <button 
                  onClick={() => handleGuestChange(g.set, g.val, 1)}
                  disabled={totalPeople >= (selectedTime ? remainingCapacity : MAX_CAPACITY)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm ${
                    totalPeople >= (selectedTime ? remainingCapacity : MAX_CAPACITY) ? 'bg-white text-gray-300 cursor-not-allowed' : 'bg-white hover:bg-gray-50 text-stone-900 border border-gray-200'
                  }`}
                >
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ))}

          {showCapacityError && (
            <div className="flex items-center text-red-600 text-xs mt-2 bg-red-50 p-2 rounded animate-pulse">
              <AlertCircle size={14} className="mr-2 flex-shrink-0" />
              <span>
                {selectedTime 
                  ? `この時間の残席はあと${remainingCapacity}名です` 
                  : `定員は${MAX_CAPACITY}人です`}
              </span>
            </div>
          )}
        </div>

        <div className="border-t pt-4 mt-6">
          {totalPeople > 0 && (
            <div className="mb-4 space-y-1 text-sm text-gray-600">
               {adults > 0 && (
                 <div className="flex justify-between">
                   <span>Adults × {adults}</span>
                   <span>¥{priceDetails.adultTotal.toLocaleString()}</span>
                 </div>
               )}
               {adultsNonAlc > 0 && (
                 <div className="flex justify-between">
                   <span>Alcohol-Free × {adultsNonAlc}</span>
                   <span>¥{priceDetails.nonAlcTotal.toLocaleString()}</span>
                 </div>
               )}
               {children > 0 && (
                 <div className="flex justify-between">
                   <span>Children × {children}</span>
                   <span>¥{priceDetails.childTotal.toLocaleString()}</span>
                 </div>
               )}
               <div className="border-t border-gray-100 my-2 pt-1"></div>
               <div className="flex justify-between">
                 <span>Subtotal</span>
                 <span>¥{priceDetails.subTotal.toLocaleString()}</span>
               </div>
               <div className="flex justify-between text-xs text-gray-400">
                 <span>Booking Fee</span>
                 <span>¥{priceDetails.bookingFee.toLocaleString()}</span>
               </div>
            </div>
          )}
          <div className="flex justify-between items-end mb-4">
            <span className="font-bold text-gray-700">Total (Inc. Tax)</span>
            <span className="serif font-bold text-2xl text-stone-900">¥{priceDetails.total.toLocaleString()}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canRequest}
            className={`w-full py-3 px-4 rounded font-semibold text-white transition-colors ${
              canRequest 
                ? 'bg-stone-900 hover:bg-stone-800' 
                : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            Request Reservation
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingWidget;
