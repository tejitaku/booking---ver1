
import React, { useState } from 'react';
import { Booking, GuestInfo } from '../types';
import { Loader2, Lock, ArrowLeft, AlertCircle } from 'lucide-react';

interface BookingFormProps {
  initialData: Partial<Booking>;
  onBack: () => void;
  onSubmit: (data: any) => Promise<void>;
}

const COUNTRIES = [
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { code: 'TW', name: 'Taiwan', dial: '+886', flag: '🇹🇼' },
  { code: 'HK', name: 'Hong Kong', dial: '+852', flag: '🇭🇰' },
  { code: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { code: 'VN', name: 'Vietnam', dial: '+84', flag: '🇻🇳' },
  { code: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'OT', name: 'Other', dial: '', flag: '🌍' },
];

const BookingForm: React.FC<BookingFormProps> = ({ initialData, onBack, onSubmit }) => {
  const [loading, setLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  
  const totalGuests = (initialData.adults || 0) + (initialData.adultsNonAlc || 0) + (initialData.children || 0) + (initialData.infants || 0);

  // Representative State
  const [repInfo, setRepInfo] = useState<GuestInfo>({
    firstName: '', lastName: '', email: '', phone: '', country: '', dietaryRestrictions: ''
  });

  // Other Guests State
  const [guests, setGuests] = useState<GuestInfo[]>(
    Array(Math.max(0, totalGuests - 1)).fill({ firstName: '', lastName: '', dietaryRestrictions: '' })
  );

  const [agreedPolicy, setAgreedPolicy] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  const handleRepChange = (field: keyof GuestInfo, value: string) => {
    setRepInfo(prev => ({ ...prev, [field]: value }));
  };

  const handleGuestChange = (index: number, field: keyof GuestInfo, value: string) => {
    const newGuests = [...guests];
    newGuests[index] = { ...newGuests[index], [field]: value };
    setGuests(newGuests);
  };

  const validate = () => {
    const errors: Record<string, boolean> = {};
    if (!repInfo.firstName) errors['repFirstName'] = true;
    if (!repInfo.lastName) errors['repLastName'] = true;
    
    // Email Validation: Must not be empty and must look like an email
    // This regex ensures at least one character before @, an @, at least one char after @, a dot, and at least 2 chars for domain
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!repInfo.email || !emailRegex.test(repInfo.email)) {
      errors['repEmail'] = true;
    }

    if (!repInfo.country) errors['repCountry'] = true;
    if (!repInfo.phone) errors['repPhone'] = true;

    guests.forEach((g, i) => {
      if (!g.firstName) errors[`guest${i}FirstName`] = true;
      if (!g.lastName) errors[`guest${i}LastName`] = true;
    });

    if (!agreedPolicy) errors['agreedPolicy'] = true;
    if (!agreedTerms) errors['agreedTerms'] = true;

    return errors;
  };

  const errors = validate();
  const isFormValid = Object.keys(errors).length === 0;

  const handleSubmit = async () => {
    setShowErrors(true);
    if (!isFormValid) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    setLoading(true);
    try {
      // Pass returnUrl for Stripe Checkout redirect
      const returnUrl = window.location.href.split('?')[0];

      await onSubmit({
        representative: repInfo,
        guests: guests,
        paymentMethod: 'Stripe Checkout',
        returnUrl: returnUrl
      });
    } catch (e) {
      alert("Booking processing failed. Please try again.");
      console.error(e);
      setLoading(false);
    }
  };

  const getInputClass = (isError: boolean) => 
    `w-full mt-1 p-2 border rounded ${isError && showErrors ? 'border-red-500 bg-red-50' : 'border-gray-300'}`;

  return (
    <div className="max-w-2xl mx-auto bg-white min-h-screen md:min-h-0 md:my-8 md:rounded-lg border border-gray-100 overflow-hidden">
      <div className="bg-stone-900 text-white p-6 flex items-center relative">
        <button onClick={onBack} className="absolute left-4 p-2 hover:bg-stone-800 rounded">
          <ArrowLeft size={20} />
        </button>
        <h1 className="serif text-2xl mx-auto">Guest Details</h1>
      </div>

      <div className="p-8 space-y-8">
        {/* Booking Summary */}
        <div className="bg-gray-50 p-4 rounded border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center text-sm">
          <div>
            <span className="font-bold text-stone-800 block">{initialData.type === 'PRIVATE' ? 'Private Tasting' : 'Group Tasting'}</span>
            <span className="text-gray-600">{initialData.date} at {initialData.time}</span>
          </div>
          <div className="mt-2 md:mt-0 text-right">
            <span className="block">{totalGuests} Guests</span>
            <span className="font-bold text-lg text-stone-900">¥{initialData.totalPrice?.toLocaleString()}</span>
          </div>
        </div>

        {/* Representative */}
        <section>
          <h3 className="serif text-lg font-bold border-b pb-2 mb-4 text-stone-800">Guest 1 (Representative)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase flex justify-between">
                First Name *
                {showErrors && errors['repFirstName'] && <span className="text-red-500">Required</span>}
              </label>
              <input type="text" value={repInfo.firstName} onChange={e => handleRepChange('firstName', e.target.value)} className={getInputClass(!!errors['repFirstName'])} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase flex justify-between">
                Last Name *
                {showErrors && errors['repLastName'] && <span className="text-red-500">Required</span>}
              </label>
              <input type="text" value={repInfo.lastName} onChange={e => handleRepChange('lastName', e.target.value)} className={getInputClass(!!errors['repLastName'])} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase flex justify-between">
                Email Address *
                {showErrors && errors['repEmail'] && <span className="text-red-500">Invalid Format (@ required)</span>}
              </label>
              <input 
                type="email" 
                value={repInfo.email} 
                onChange={e => handleRepChange('email', e.target.value)}
                onBlur={() => handleRepChange('email', repInfo.email?.trim() || '')}
                className={getInputClass(!!errors['repEmail'])}
                placeholder="name@example.com"
                required
                pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase flex justify-between">
                Country *
                {showErrors && errors['repCountry'] && <span className="text-red-500">Required</span>}
              </label>
              <select 
                value={repInfo.country} 
                onChange={e => handleRepChange('country', e.target.value)} 
                className={`${getInputClass(!!errors['repCountry'])} appearance-none ${!repInfo.country ? 'text-gray-400' : 'text-gray-900'}`}
              >
                <option value="" disabled>Select Country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name} className="text-gray-900">
                    {c.flag} {c.name} {c.dial ? `(${c.dial})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase flex justify-between">
                Phone Number *
                {showErrors && errors['repPhone'] && <span className="text-red-500">Required</span>}
              </label>
              <input 
                type="tel" 
                placeholder={repInfo.country ? "123 4567 890" : "+1 ..."} 
                value={repInfo.phone} 
                onChange={e => handleRepChange('phone', e.target.value)} 
                className={getInputClass(!!errors['repPhone'])}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase">Dietary Restrictions</label>
              <input type="text" placeholder="Allergies, etc." value={repInfo.dietaryRestrictions} onChange={e => handleRepChange('dietaryRestrictions', e.target.value)} className="w-full mt-1 p-2 border rounded border-gray-300" />
            </div>
          </div>
        </section>

        {/* Additional Guests */}
        {guests.map((guest, idx) => (
          <section key={idx}>
            <h3 className="serif text-lg font-bold border-b pb-2 mb-4 text-stone-800">Guest {idx + 2}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase flex justify-between">
                  First Name *
                  {showErrors && errors[`guest${idx}FirstName`] && <span className="text-red-500">Required</span>}
                </label>
                <input type="text" value={guest.firstName} onChange={e => handleGuestChange(idx, 'firstName', e.target.value)} className={getInputClass(!!errors[`guest${idx}FirstName`])} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase flex justify-between">
                  Last Name *
                  {showErrors && errors[`guest${idx}LastName`] && <span className="text-red-500">Required</span>}
                </label>
                <input type="text" value={guest.lastName} onChange={e => handleGuestChange(idx, 'lastName', e.target.value)} className={getInputClass(!!errors[`guest${idx}LastName`])} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase">Dietary Restrictions</label>
                <input type="text" value={guest.dietaryRestrictions} onChange={e => handleGuestChange(idx, 'dietaryRestrictions', e.target.value)} className="w-full mt-1 p-2 border rounded border-gray-300" />
              </div>
            </div>
          </section>
        ))}

        {/* Legal */}
        <section className={`bg-gray-50 p-4 rounded text-sm text-gray-700 space-y-3 ${showErrors && (errors['agreedPolicy'] || errors['agreedTerms']) ? 'border border-red-300 bg-red-50' : ''}`}>
          <label className="flex items-start space-x-2 cursor-pointer">
            <input type="checkbox" checked={agreedPolicy} onChange={e => setAgreedPolicy(e.target.checked)} className="mt-1" />
            <span className={showErrors && errors['agreedPolicy'] ? 'text-red-600 font-bold' : ''}>I agree to the <a href="https://san-gen.jp/tc" className="underline text-stone-800">Cancellation Policy</a> *</span>
          </label>
          <label className="flex items-start space-x-2 cursor-pointer">
            <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)} className="mt-1" />
            <span className={showErrors && errors['agreedTerms'] ? 'text-red-600 font-bold' : ''}>I agree to the <a href="https://san-gen.jp/tc" className="underline text-stone-800">Terms & Conditions</a> *</span>
          </label>
        </section>

        {/* Submit */}
        <div className="pt-4 pb-8">
           {showErrors && !isFormValid && (
             <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-4 flex items-center">
               <AlertCircle className="mr-2" size={20} />
               <span>Please check the highlighted fields above.</span>
             </div>
           )}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full py-4 text-lg font-bold text-white rounded flex justify-center items-center space-x-2 ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-stone-900 hover:bg-stone-800'
            }`}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Lock size={20} />}
            <span>Checkout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingForm;
