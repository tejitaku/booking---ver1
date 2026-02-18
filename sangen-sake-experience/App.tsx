
import React, { useState, useEffect } from 'react';
import BookingWidget from './components/BookingWidget';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import { Booking, ReservationType } from './types';
import { BookingService, API_URL } from './services/bookingService';
import { CheckCircle, AlertTriangle, RefreshCcw } from 'lucide-react';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('widget');
  const [bookingData, setBookingData] = useState<Partial<Booking>>({});
  const [widgetType, setWidgetType] = useState<ReservationType>(ReservationType.PRIVATE);
  const [gasConfigError, setGasConfigError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isEmbedMode, setIsEmbedMode] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') setRoute('admin');
    };
    window.addEventListener('hashchange', handleHashChange);
    if (window.location.hash === '#admin') setRoute('admin');

    const params = new URLSearchParams(window.location.search);
    if (params.get('type')?.toLowerCase() === 'group') setWidgetType(ReservationType.GROUP);
    if (params.get('status') === 'success') setRoute('success');
    if (params.get('embed') === 'true') setIsEmbedMode(true);

    checkGasConfig();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const checkGasConfig = async () => {
    if (!API_URL) return;
    setIsTesting(true);
    try {
      const res = await BookingService.testConfig();
      if (!res.success) {
        setGasConfigError(res.error);
      } else {
        setGasConfigError(null);
      }
    } catch (e: any) {
      setGasConfigError(e.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleFormSubmit = async (fullData: any) => {
    try {
      const response = await BookingService.createBooking({ ...bookingData, ...fullData });
      
      // 自動リダイレクト
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-2xl p-10 rounded-lg shadow-xl text-center">
          <CheckCircle size={64} className="mx-auto mb-6 text-green-500" />
          <h2 className="serif text-3xl font-bold text-stone-900 mb-6">We have received your request!</h2>
          <div className="text-gray-600 space-y-4 text-left md:text-center leading-relaxed">
            <p>A confirmation email regarding your booking details has been sent to your email address. Please check your inbox.</p>
            <p>Once your reservation is confirmed, a member of the facility will notify you again by email within three days.</p>
            <p>Please wait a little while.</p>
            <p>If you do not receive an email after three days, there may have been an error in the email address you entered.</p>
            <p>We apologize for the inconvenience, but please contact SANGEN at <a href="mailto:info@sangen-sake.jp" className="text-stone-900 font-bold underline">info@sangen-sake.jp</a>.</p>
          </div>
          <button onClick={() => window.location.href = '/'} className="mt-10 px-8 py-3 bg-stone-900 text-white rounded hover:bg-stone-800 transition font-bold">
            Back to Top
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isEmbedMode ? 'bg-transparent' : 'bg-stone-100'} py-10 px-4`}>
       <div className="max-w-4xl mx-auto">
         
         {(!API_URL || gasConfigError) && (
           <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm">
             <div className="flex items-start">
               <div className="bg-amber-100 p-3 rounded-full mr-4">
                 <AlertTriangle className="text-amber-600 w-6 h-6" />
               </div>
               <div className="flex-1">
                 <h3 className="font-bold text-amber-900 mb-1">System connection problem</h3>
                 <p className="text-sm text-amber-800 leading-relaxed mb-4">
                   {gasConfigError || "VITE_GAS_URL is not configured."}
                 </p>
                 <button 
                   onClick={checkGasConfig}
                   disabled={isTesting}
                   className="flex items-center text-xs font-bold bg-white border border-amber-300 px-4 py-2 rounded hover:bg-amber-100 transition disabled:opacity-50"
                 >
                   <RefreshCcw size={14} className={`mr-2 ${isTesting ? 'animate-spin' : ''}`} />
                   Test Connection
                 </button>
               </div>
             </div>
           </div>
         )}

         {route === 'form' ? (
            <BookingForm initialData={bookingData} onBack={() => setRoute('widget')} onSubmit={handleFormSubmit} />
         ) : (
            <>
              <BookingWidget reservationType={widgetType} onProceed={(data) => { setBookingData(data); setRoute('form'); }} />
              {!isEmbedMode && (
                <div className="mt-12 text-center">
                  <button onClick={() => setRoute('admin')} className="text-sm text-gray-400 hover:text-stone-600 underline">Management Login</button>
                </div>
              )}
            </>
         )}
       </div>
    </div>
  );
};

export default App;
