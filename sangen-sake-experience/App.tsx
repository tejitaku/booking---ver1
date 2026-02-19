
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
    if (params.get('type')?.toLowerCase() === 'group') setWidgetType(ReservationType.GROUP);
    if (params.get('embed') === 'true') setIsEmbedMode(true);

    const status = params.get('status');
    const sessionId = params.get('session_id');

    // Stripeから戻ってきた場合
    if (status === 'success' && sessionId) {
      if (!finalizeStarted.current) {
        finalizeStarted.current = true;
        handleFinalize(sessionId);
      }
    } else if (status === 'success') {
      // session_idがないがsuccessステータスの場合（基本的にはありえないが念のため）
      setRoute('success');
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleFinalize = async (sessionId: string) => {
    setIsFinalizing(true);
    setRoute('success'); // ローダーを表示するためにsuccess画面に切り替え
    
    console.log("Starting verification for session:", sessionId);
    
    try {
      const result = await BookingService.finalizeBooking(sessionId);
      console.log("Verification result:", result);
      
      if (!result.success) {
        setFinalizeError(result.error || "Payment verification failed. Please contact us.");
      }
      // success: true の場合は、finalizeErrorがnullのままなので、自動的に完了画面が表示される
    } catch (e: any) {
      console.error("Verification error:", e);
      setFinalizeError(e.message || "An unexpected error occurred. Please contact support.");
    } finally {
      setIsFinalizing(false);
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
        <div className="bg-white max-w-2xl w-full p-10 rounded-lg shadow-xl border border-gray-100">
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
                <p>If you don't hear from us, please email <a href="mailto:info@sangen-sake.jp" className="text-stone-900 font-bold underline">info@sangen-sake.jp</a>.</p>
              </div>
              <button onClick={() => window.location.href = '/'} className="mt-10 px-8 py-3 bg-stone-900 text-white rounded hover:bg-stone-800 transition font-bold">
                Back to Top
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
              <BookingWidget reservationType={widgetType} onProceed={(data) => { setBookingData(data); setRoute('form'); }} />
            </>
         )}
       </div>
    </div>
  );
};

export default App;
