
import React, { useState, useEffect } from 'react';
import BookingWidget from './components/BookingWidget';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import { Booking, ReservationType } from './types';
import { BookingService, API_URL } from './services/bookingService';
import { CheckCircle, AlertTriangle, RefreshCcw, Settings, ExternalLink } from 'lucide-react';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('widget');
  const [bookingData, setBookingData] = useState<Partial<Booking>>({});
  const [widgetType, setWidgetType] = useState<ReservationType>(ReservationType.PRIVATE);
  const [gasConfigError, setGasConfigError] = useState<string | null>(null);
  const [configInfo, setConfigInfo] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
    if (!API_URL) {
      setGasConfigError("VITE_GAS_URL is not configured.");
      return;
    }
    setIsTesting(true);
    try {
      const res = await BookingService.testConfig();
      if (!res.success) {
        setGasConfigError(res.error);
        setConfigInfo(null);
      } else {
        setGasConfigError(null);
        setConfigInfo(res);
      }
    } catch (e: any) {
      setGasConfigError(e.message);
      setConfigInfo(null);
    } finally {
      setIsTesting(false);
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
         
         {/* Diagnostic Panel */}
         {!isEmbedMode && (
           <div className="mb-6">
             <div className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-300 ${showDiagnostics ? 'max-h-[500px]' : 'max-h-12'}`}>
                <button 
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="w-full px-6 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Settings size={18} className={`${isTesting ? 'animate-spin' : ''} text-stone-500`} />
                    <span className="text-sm font-bold text-stone-700">Connection Diagnostics</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {gasConfigError ? (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Error</span>
                    ) : configInfo ? (
                      <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">Connected</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold">Unknown</span>
                    )}
                  </div>
                </button>
                
                <div className="p-6 border-t bg-gray-50 space-y-4">
                  {gasConfigError ? (
                    <div className="flex items-start bg-red-50 p-3 rounded-lg border border-red-100">
                      <AlertTriangle className="text-red-600 w-5 h-5 mr-3 mt-0.5" />
                      <div className="text-xs text-red-800 leading-relaxed">
                        <p className="font-bold mb-1">Error detected:</p>
                        <p className="font-mono">{gasConfigError}</p>
                      </div>
                    </div>
                  ) : configInfo ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-gray-400 mb-1 font-bold uppercase tracking-wider">Google Calendar</p>
                        <p className="font-bold text-stone-800">{configInfo.calendarName}</p>
                        <p className="text-[10px] text-gray-400 truncate mt-1">ID: {configInfo.calendarIdUsed}</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-gray-400 mb-1 font-bold uppercase tracking-wider">Spreadsheet</p>
                        <p className="font-bold text-stone-800">{configInfo.spreadsheetName}</p>
                        <p className="text-[10px] text-gray-400 mt-1">Timezone: {configInfo.timeZone}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button 
                      onClick={checkGasConfig}
                      disabled={isTesting}
                      className="flex items-center text-[10px] font-bold bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-100 transition disabled:opacity-50"
                    >
                      <RefreshCcw size={12} className={`mr-2 ${isTesting ? 'animate-spin' : ''}`} />
                      Check Again
                    </button>
                    <a 
                      href={API_URL + "?action=testConfig"} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center text-[10px] font-bold bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-100 transition"
                    >
                      <ExternalLink size={12} className="mr-2" />
                      Open GAS Debug Link
                    </a>
                  </div>
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
