
import React, { useState, useEffect, useRef } from 'react';
import BookingWidget from './components/BookingWidget';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import { Booking, ReservationType } from './types';
import { BookingService } from './services/bookingService';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('widget');
  const [bookingData, setBookingData] = useState<Partial<Booking>>({});
  const [widgetType, setWidgetType] = useState<ReservationType>(ReservationType.PRIVATE);
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const finalizeStarted = useRef(false);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') setRoute('admin');
    };
    window.addEventListener('hashchange', handleHashChange);
    if (window.location.hash === '#admin') setRoute('admin');

    const params = new URLSearchParams(window.location.search);
    
    // 埋め込みモードの判定
    const embed = params.get('embed') === 'true';
    setIsEmbedMode(embed);

    // URLパラメータからルートを判定
    const urlRoute = params.get('route');
    if (urlRoute) setRoute(urlRoute);

    // 予約タイプの判定
    if (params.get('type')?.toUpperCase() === 'GROUP') setWidgetType(ReservationType.GROUP);
    else if (params.get('type')?.toUpperCase() === 'PRIVATE') setWidgetType(ReservationType.PRIVATE);

    // フォーム表示用にURLからデータをパース
    if (urlRoute === 'form') {
      const initial: Partial<Booking> = {
        type: (params.get('type')?.toUpperCase() as ReservationType) || ReservationType.PRIVATE,
        date: params.get('date') || '',
        time: params.get('time') || '',
        adults: parseInt(params.get('adults') || '0'),
        adultsNonAlc: parseInt(params.get('adultsNonAlc') || '0'),
        children: parseInt(params.get('children') || '0'),
        infants: parseInt(params.get('infants') || '0'),
        totalPrice: parseInt(params.get('totalPrice') || '0'),
      };
      setBookingData(initial);
    }

    const status = params.get('status');
    const sessionId = params.get('session_id');

    // Stripeから戻ってきた場合
    if (status === 'success' && sessionId) {
      if (!finalizeStarted.current) {
        finalizeStarted.current = true;
        handleFinalize(sessionId);
      }
    } else if (status === 'success') {
      setRoute('success');
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleFinalize = async (sessionId: string) => {
    setIsFinalizing(true);
    setRoute('success');
    
    try {
      const result = await BookingService.finalizeBooking(sessionId);
      if (!result.success) {
        setFinalizeError(result.error || "Payment verification failed. Please contact us.");
      }
    } catch (e: any) {
      setFinalizeError(e.message || "An unexpected error occurred. Please contact support.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleProceed = (data: any) => {
    if (isEmbedMode) {
      // 埋め込みモードの場合は新規ウィンドウでフォームを開く
      const baseUrl = window.location.origin + window.location.pathname;
      const params = new URLSearchParams({
        route: 'form',
        type: data.type,
        date: data.date,
        time: data.time,
        adults: data.adults.toString(),
        adultsNonAlc: data.adultsNonAlc.toString(),
        children: data.children.toString(),
        infants: data.infants.toString(),
        totalPrice: data.totalPrice.toString(),
      });
      window.open(`${baseUrl}?${params.toString()}`, '_blank');
    } else {
      // 通常モードはそのまま遷移
      setBookingData(data);
      setRoute('form');
    }
  };

  const handleFormSubmit = async (fullData: any) => {
    try {
      const response = await BookingService.createBooking({ ...bookingData, ...fullData });
      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      } else {
        setRoute('success');
      }
    } catch (e: any) {
      alert(`Reservation Error: ${e.message}`);
    }
  };

  if (route === 'admin') return <AdminPanel onBack={() => setRoute('widget')} />;

  if (route === 'success') {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4 text-center">
        <div className="bg-white max-w-2xl w-full p-10 rounded-lg border border-gray-100">
          {isFinalizing ? (
            <div className="py-10 animate-pulse">
              <Loader2 size={48} className="mx-auto mb-6 text-stone-600 animate-spin" />
              <h2 className="serif text-2xl font-bold text-stone-900 mb-4">Verifying your payment...</h2>
              <p className="text-gray-500">Processing your reservation. Please wait a moment.</p>
            </div>
          ) : finalizeError ? (
            <div className="py-10">
              <AlertTriangle size={64} className="mx-auto mb-6 text-amber-500" />
              <h2 className="serif text-3xl font-bold text-stone-900 mb-6">Verification Issue</h2>
              <p className="text-red-600 mb-8 bg-red-50 p-4 rounded border border-red-100">{finalizeError}</p>
              <button onClick={() => window.location.href = '/'} className="px-8 py-3 bg-stone-900 text-white rounded hover:bg-stone-800 transition font-bold">
                Return to Home
              </button>
            </div>
          ) : (
            <>
              <CheckCircle size={64} className="mx-auto mb-6 text-green-500" />
              <h2 className="serif text-3xl font-bold text-stone-900 mb-6">We have received your request!</h2>
              <div className="text-gray-600 space-y-4 text-left md:text-center leading-relaxed">
                <p>A confirmation email has been sent to your address. Please check your inbox.</p>
                <p>Our staff will review your request and contact you within 3 days to finalize the booking.</p>
                <p>If you don't hear from us, please email <a href="mailto:info@sangen-sake.jp" className="text-stone-900 font-bold underline">info@san-gen.jp</a>.</p>
              </div>
              <button onClick={() => window.close()} className="mt-10 px-8 py-3 bg-stone-900 text-white rounded hover:bg-stone-800 transition font-bold">
                Close
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent pt-2 pb-2 px-4">
       <div className="max-w-4xl mx-auto">
         {route === 'form' ? (
            <BookingForm initialData={bookingData} onBack={() => setRoute('widget')} onSubmit={handleFormSubmit} />
         ) : (
            <>
              <BookingWidget reservationType={widgetType} onProceed={handleProceed} />
            </>
         )}
       </div>
    </div>
  );
};

export default App;
