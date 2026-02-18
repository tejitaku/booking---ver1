import React, { useState, useEffect } from 'react';
import BookingWidget from './components/BookingWidget';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import { Booking, ReservationType } from './types';
import { BookingService, API_URL } from './services/bookingService';
import { CheckCircle, ExternalLink, CreditCard, ArrowRight, Settings, AlertTriangle } from 'lucide-react';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('widget');
  const [bookingData, setBookingData] = useState<Partial<Booking>>({});
  const [widgetType, setWidgetType] = useState<ReservationType>(ReservationType.PRIVATE);
  const [paymentUrl, setPaymentUrl] = useState<string>('');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'admin') setRoute('admin');
    };

    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('type');
    if (typeParam && typeParam.toLowerCase() === 'group') {
      setWidgetType(ReservationType.GROUP);
    }

    const statusParam = params.get('status');
    if (statusParam === 'success') {
      setRoute('success');
    }

    window.addEventListener('hashchange', handleHashChange);
    if (window.location.hash === '#admin') setRoute('admin');

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleWidgetProceed = (data: Partial<Booking>) => {
    setBookingData(data);
    setRoute('form');
  };

  const handleFormSubmit = async (fullData: any) => {
    const finalData = { ...bookingData, ...fullData };
    try {
      const response = await BookingService.createBooking(finalData);
      if (response.checkoutUrl) {
        setPaymentUrl(response.checkoutUrl);
        setRoute('payment_link');
      } else {
        setRoute('success');
      }
    } catch (e) {
      alert("予約の送信に失敗しました。API設定を確認してください。");
    }
  };

  const handleBackToWidget = () => {
    setRoute('widget');
  };

  // ---------------------------------------------------------------------------
  // UI RENDERERS
  // ---------------------------------------------------------------------------

  if (route === 'admin') {
    return <AdminPanel onBack={handleBackToWidget} />;
  }

  if (route === 'payment_link') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-lg shadow-xl text-center">
          <div className="flex justify-center mb-6">
            <CreditCard className="text-stone-800 w-16 h-16" />
          </div>
          <h2 className="serif text-2xl font-bold text-stone-900 mb-4">Reservation Created</h2>
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
          <div className="flex justify-center mb-6 text-green-500"><CheckCircle size={64} /></div>
          <h2 className="serif text-3xl font-bold text-stone-900 mb-4">予約リクエストを受け付けました</h2>
          <div className="text-left text-gray-600 space-y-4 text-sm leading-relaxed">
            <p>確認メールを送信しました。内容をご確認ください。</p>
            <p>施設スタッフが確認後、3日以内に確定の連絡を差し上げます。そのまま少々お待ちください。</p>
          </div>
          <button onClick={() => window.location.href = '/'} className="mt-8 px-6 py-2 bg-stone-900 text-white rounded hover:bg-stone-800 transition">閉じる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 py-10 px-4">
       <div className="max-w-4xl mx-auto">
         
         {/* API_URL未設定時の警告バナー */}
         {!API_URL && (
           <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6 flex flex-col md:flex-row items-center shadow-sm">
             <div className="bg-amber-100 p-3 rounded-full mb-4 md:mb-0 md:mr-6">
               <Settings className="text-amber-600 w-8 h-8 animate-spin-slow" />
             </div>
             <div className="flex-1 text-center md:text-left">
               <h3 className="font-bold text-amber-900 mb-1">API設定が必要です（重要）</h3>
               <p className="text-sm text-amber-800 leading-relaxed">
                 Google Apps Script (GAS) のURLが設定されていません。UIは確認できますが、実際の予約は行えません。<br/>
                 <span className="font-semibold text-amber-900">services/bookingService.ts</span> の <span className="font-semibold text-amber-900">API_URL</span> にURLを貼り付けてください。
               </p>
             </div>
           </div>
         )}

         {route === 'form' ? (
            <BookingForm initialData={bookingData} onBack={handleBackToWidget} onSubmit={handleFormSubmit} />
         ) : (
            <>
              <BookingWidget reservationType={widgetType} onProceed={handleWidgetProceed} />
              <div className="mt-12 text-center">
                <button onClick={() => setRoute('admin')} className="text-sm text-gray-400 hover:text-stone-600 transition-colors underline">
                  Management Login
                </button>
              </div>
            </>
         )}
       </div>
    </div>
  );
};

export default App;