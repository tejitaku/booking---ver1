import React, { useState, useEffect } from 'react';
import BookingWidget from './components/BookingWidget';
import BookingForm from './components/BookingForm';
import AdminPanel from './components/AdminPanel';
import { Booking, ReservationType } from './types';
import { BookingService } from './services/bookingService';
import { CheckCircle, ExternalLink, CreditCard, ArrowRight } from 'lucide-react';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('widget'); // widget, form, success, admin, payment_link
  const [bookingData, setBookingData] = useState<Partial<Booking>>({});
  const [widgetType, setWidgetType] = useState<ReservationType>(ReservationType.PRIVATE);
  const [paymentUrl, setPaymentUrl] = useState<string>('');

  useEffect(() => {
    // Simple Hash Router simulation (Optional fallback)
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'admin') setRoute('admin');
    };

    // Query Param for Type: ?type=group or ?type=private (default)
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('type');
    if (typeParam && typeParam.toLowerCase() === 'group') {
      setWidgetType(ReservationType.GROUP);
    } else {
      setWidgetType(ReservationType.PRIVATE);
    }

    // Check for success or return from Stripe
    const statusParam = params.get('status');
    if (statusParam === 'success') {
      setRoute('success');
    }

    window.addEventListener('hashchange', handleHashChange);
    // Initial check handled by state default, but we can check hash too if needed
    if (window.location.hash === '#admin') setRoute('admin');

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleWidgetProceed = (data: Partial<Booking>) => {
    setBookingData(data);
    setRoute('form');
  };

  const handleFormSubmit = async (fullData: any) => {
    const finalData = { ...bookingData, ...fullData };
    const response = await BookingService.createBooking(finalData);
    
    if (response.checkoutUrl) {
      // Instead of window.location.href, we show a button to open in new tab
      // This is necessary because Stripe Checkout forbids being displayed in an iframe (which this preview likely is)
      setPaymentUrl(response.checkoutUrl);
      setRoute('payment_link');
    } else {
      setRoute('success');
    }
  };

  const handleBackToWidget = () => {
    setRoute('widget');
  };

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
          <p className="text-gray-600 mb-8">
            Please proceed to payment to finalize your booking.
            <br />
            <span className="text-xs text-gray-400">(Opens in a new tab)</span>
          </p>
          
          <a 
            href={paymentUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full py-4 bg-stone-900 text-white font-bold rounded shadow hover:bg-stone-800 transition flex justify-center items-center"
          >
            <span>Pay Now</span>
            <ExternalLink size={18} className="ml-2" />
          </a>

          <div className="mt-8 border-t pt-6">
             <p className="text-sm text-gray-500 mb-2">Have you completed payment?</p>
             <button 
                onClick={() => setRoute('success')}
                className="text-stone-700 font-bold underline hover:text-stone-900 flex items-center justify-center mx-auto"
             >
                Yes, view confirmation <ArrowRight size={14} className="ml-1" />
             </button>
          </div>
          
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-6 text-sm text-gray-400 underline hover:text-stone-600 block mx-auto"
          >
            Cancel / Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (route === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-lg p-8 rounded-lg shadow-xl text-center">
          <div className="flex justify-center mb-6">
            <CheckCircle className="text-green-500 w-16 h-16" />
          </div>
          <h2 className="serif text-3xl font-bold text-stone-900 mb-4">We have received your request!</h2>
          <div className="text-left text-gray-600 space-y-4 text-sm leading-relaxed">
            <p>
              A confirmation email regarding your booking details has been sent to your email address. Please check your inbox.
            </p>
            <p>
              Once your reservation is confirmed, a member of the facility will notify you again by email within three days. 
              <strong>Please wait a little while.</strong>
            </p>
            <p className="bg-yellow-50 p-3 rounded border border-yellow-100">
              If you do not receive an email after three days, there may have been an error in the email address you entered.
              We apologize for the inconvenience, but please contact SANGEN at <a href="mailto:info@sangen.jp" className="underline text-stone-800">info@sangen.jp</a>.
            </p>
          </div>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-8 px-6 py-2 bg-stone-900 text-white rounded hover:bg-stone-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (route === 'form') {
    return (
      <BookingForm 
        initialData={bookingData} 
        onBack={handleBackToWidget} 
        onSubmit={handleFormSubmit} 
      />
    );
  }

  // Default: Widget
  return (
    <div className="min-h-screen bg-stone-100 py-10 px-4">
       {/* Widget Container simulating Studio iframe context */}
       <div className="max-w-4xl mx-auto">
         <BookingWidget reservationType={widgetType} onProceed={handleWidgetProceed} />
         
         <div className="mt-12 text-center">
            <button 
              onClick={() => setRoute('admin')} 
              className="text-sm text-gray-400 hover:text-stone-600 transition-colors underline bg-transparent border-none cursor-pointer"
            >
              Management Login
            </button>
         </div>
       </div>
    </div>
  );
};

export default App;