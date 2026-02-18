
import React, { useState, useEffect } from 'react';
import BookingWidget from './components/BookingWidget';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import { Booking, ReservationType } from './types';
import { BookingService, API_URL } from './services/bookingService';
import { CheckCircle, ExternalLink, CreditCard, ArrowRight, Database, AlertTriangle, RefreshCcw } from 'lucide-react';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('widget');
  const [bookingData, setBookingData] = useState<Partial<Booking>>({});
  const [widgetType, setWidgetType] = useState<ReservationType>(ReservationType.PRIVATE);
  const [paymentUrl, setPaymentUrl] = useState<string>('');
  const [gasConfigError, setGasConfigError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') setRoute('admin');
    };
    window.addEventListener('hashchange', handleHashChange);
    if (window.location.hash === '#admin') setRoute('admin');

    const params = new URLSearchParams(window.location.search);
    if (params.get('type')?.toLowerCase() === 'group') setWidgetType(ReservationType.GROUP);
    if (params.get('status') === 'success') setRoute('success');

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
        console.log("GAS Connection OK:", res.spreadsheetName);
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
      if (response.checkoutUrl) {
        setPaymentUrl(response.checkoutUrl);
        setRoute('payment_link');
      } else {
        setRoute('success');
      }
    } catch (e: any) {
      alert(`予約送信エラー: ${e.message}`);
    }
  };

  if (route === 'admin') return <AdminPanel onBack={() => setRoute('widget')} />;

  if (route === 'payment_link') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-lg shadow-xl text-center">
          <CreditCard className="text-stone-800 w-16 h-16 mx-auto mb-6" />
          <h2 className="serif text-2xl font-bold text-stone-900 mb-4">Payment Required</h2>
          <p className="text-gray-600 mb-8">お支払いを完了させて予約を確定してください。</p>
          <a href={paymentUrl} target="_blank" rel="noreferrer" className="block w-full py-4 bg-stone-900 text-white font-bold rounded shadow hover:bg-stone-800 transition flex justify-center items-center">
            <span>Pay Now</span>
            <ExternalLink size={18} className="ml-2" />
          </a>
          <button onClick={() => setRoute('success')} className="mt-8 text-stone-700 font-bold underline hover:text-stone-900 flex items-center justify-center mx-auto">
            支払いを完了した方はこちら <ArrowRight size={14} className="ml-1" />
          </button>
        </div>
      </div>
    );
  }

  if (route === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-lg p-8 rounded-lg shadow-xl text-center">
          <CheckCircle size={64} className="mx-auto mb-6 text-green-500" />
          <h2 className="serif text-3xl font-bold text-stone-900 mb-4">予約リクエスト完了</h2>
          <p className="text-gray-600 mb-8">確認メールをお送りしました。スタッフからの確定連絡をお待ちください。</p>
          <button onClick={() => window.location.href = '/'} className="px-6 py-2 bg-stone-900 text-white rounded hover:bg-stone-800 transition">閉じる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 py-10 px-4">
       <div className="max-w-4xl mx-auto">
         
         {(!API_URL || gasConfigError) && (
           <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm">
             <div className="flex items-start">
               <div className="bg-amber-100 p-3 rounded-full mr-4">
                 <AlertTriangle className="text-amber-600 w-6 h-6" />
               </div>
               <div className="flex-1">
                 <h3 className="font-bold text-amber-900 mb-1">システム接続に問題があります</h3>
                 <p className="text-sm text-amber-800 leading-relaxed mb-4">
                   {!API_URL 
                     ? "Cloudflareに VITE_GAS_URL が設定されていません。" 
                     : `GASエラー: ${gasConfigError}`}
                 </p>
                 <button 
                   onClick={checkGasConfig}
                   disabled={isTesting}
                   className="flex items-center text-xs font-bold bg-white border border-amber-300 px-4 py-2 rounded hover:bg-amber-100 transition disabled:opacity-50"
                 >
                   <RefreshCcw size={14} className={`mr-2 ${isTesting ? 'animate-spin' : ''}`} />
                   接続を再テストする
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
              <div className="mt-12 text-center">
                <button onClick={() => setRoute('admin')} className="text-sm text-gray-400 hover:text-stone-600 underline">Management Login</button>
              </div>
            </>
         )}
       </div>
    </div>
  );
};

export default App;
