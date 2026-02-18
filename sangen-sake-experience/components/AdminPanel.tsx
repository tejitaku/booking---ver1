
import React, { useState, useEffect } from 'react';
import { Booking, BookingStatus, SecondaryStatus } from '../types';
import { BookingService } from '../services/bookingService';
import { calculateCancellationFee } from '../utils/pricing';
import { Eye, Check, X, Ban, Search, LogOut, Loader2, Clock } from 'lucide-react';

interface AdminPanelProps {
  onBack: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isProcessing, setIsProcessing] = useState(false);

  // Cancel Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refundCalculation, setRefundCalculation] = useState<{ fee: number, percentage: number } | null>(null);

  useEffect(() => {
    if (loggedIn) {
      loadBookings();
    }
  }, [loggedIn]);

  const loadBookings = async () => {
    setIsProcessing(true);
    try {
      const data = await BookingService.getBookings();
      setBookings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    const success = await BookingService.login(email, password);
    if (success) setLoggedIn(true);
    else alert('Invalid credentials.');
    setIsProcessing(false);
  };

  const handleStatusChange = async (id: string, status: BookingStatus) => {
    setIsProcessing(true);
    try {
      await BookingService.updateBookingStatus(id, status);
      await loadBookings();
      if (selectedBooking) setSelectedBooking(null);
    } catch (e) {
      alert("Error updating status");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSecondaryStatusChange = async (id: string, status: SecondaryStatus) => {
    setIsProcessing(true);
    try {
      await BookingService.updateSecondaryStatus(id, status);
      await loadBookings();
    } catch (e) {
      alert("Error updating secondary status");
    } finally {
      setIsProcessing(false);
    }
  };

  const openCancelModal = (booking: Booking) => {
    const calc = calculateCancellationFee(booking.date, booking.totalPrice);
    setRefundCalculation(calc);
    setShowCancelModal(true);
  };

  const executeCancel = async () => {
    if (!selectedBooking || !refundCalculation) return;
    setIsProcessing(true);
    try {
      const refundAmount = selectedBooking.totalPrice - refundCalculation.fee;
      // GAS側で返金処理を実行させるために金額を渡す
      await BookingService.updateBookingStatus(
        selectedBooking.id, 
        BookingStatus.CANCELLED, 
        `Refund: ¥${refundAmount.toLocaleString()}`,
        refundAmount
      );
      setShowCancelModal(false);
      setSelectedBooking(null);
      await loadBookings();
    } catch (e) {
      alert("Cancellation error");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDateJST = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Tokyo'
      }).format(date);
    } catch (e) {
      return dateStr;
    }
  };

  const filteredBookings = bookings.filter(b => {
    const matchesSearch = b.representative.lastName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.id.includes(searchQuery);
    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center flex-col">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-96">
          <h2 className="text-xl font-bold mb-6 text-center">Sangen Admin</h2>
          <input className="w-full p-2 border mb-4 rounded disabled:bg-gray-50" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} disabled={isProcessing} />
          <input className="w-full p-2 border mb-6 rounded disabled:bg-gray-50" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} disabled={isProcessing} />
          <button className="w-full bg-stone-800 text-white p-2 rounded flex justify-center items-center" disabled={isProcessing}>
            {isProcessing ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans relative">
      {isProcessing && (
        <div className="fixed inset-0 bg-white/40 z-[100] flex items-center justify-center">
           <div className="bg-white p-4 rounded-lg shadow-lg flex items-center space-x-3">
             <Loader2 className="animate-spin text-stone-600" size={24} />
             <span className="font-bold">Processing...</span>
           </div>
        </div>
      )}

      <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">予約管理システム</h1>
        <button onClick={() => setLoggedIn(false)} className="text-gray-500 hover:text-red-600 flex items-center">
          <LogOut size={18} className="mr-2" /> ログアウト
        </button>
      </header>

      <main className="p-6 max-w-[1400px] mx-auto">
        <div className="mb-6 flex space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="名前、IDで検索..." 
              className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="border rounded-lg px-4 py-2 bg-white"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">すべて表示</option>
            <option value={BookingStatus.REQUESTED}>リクエスト (未対応)</option>
            <option value={BookingStatus.CONFIRMED}>確定済み</option>
            <option value={BookingStatus.CANCELLED}>キャンセル</option>
          </select>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 text-left">Date/Time</th>
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Type / Guests</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Confirmed At</th>
                <th className="px-6 py-3 text-left">On-Site</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 text-sm">
              {filteredBookings.map((b) => (
                <tr key={b.id} className={b.status === BookingStatus.REQUESTED ? 'bg-amber-50/30' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{b.date}</div>
                    <div className="text-gray-500">{b.time}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{b.representative.lastName} {b.representative.firstName}</div>
                    <div className="text-xs text-gray-400">{b.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${b.type === 'PRIVATE' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                      {b.type}
                    </span>
                    <div className="text-gray-500 mt-1">{b.adults + b.adultsNonAlc + b.children + b.infants}名</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${b.status === BookingStatus.REQUESTED ? 'bg-yellow-100 text-yellow-800' : 
                        b.status === BookingStatus.CONFIRMED ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                    {b.confirmedAt ? (
                      <div className="flex items-center">
                        <Clock size={12} className="mr-1" />
                        {formatDateJST(b.confirmedAt)}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {b.status === BookingStatus.CONFIRMED ? (
                        <select 
                          disabled={isProcessing}
                          className="text-xs border rounded p-1 bg-white"
                          value={b.secondaryStatus || ''}
                          onChange={(e) => handleSecondaryStatusChange(b.id, e.target.value as SecondaryStatus)}
                        >
                          <option value="">-</option>
                          <option value="ARRIVED">到着</option>
                          <option value="NO_SHOW">ノーショー</option>
                        </select>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => setSelectedBooking(b)} className="text-indigo-600 hover:text-indigo-900 flex items-center ml-auto">
                      <Eye size={16} className="mr-1" /> 詳細
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Detail Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <h2 className="text-2xl font-bold">予約詳細</h2>
                <button onClick={() => setSelectedBooking(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase font-bold">Booking ID</p>
                  <p className="font-mono text-sm">{selectedBooking.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase font-bold">Status</p>
                  <p className="font-bold">{selectedBooking.status}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase font-bold">Reservation Date</p>
                  <p className="font-bold text-lg">{selectedBooking.date} {selectedBooking.time}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase font-bold">Confirmed At (JST)</p>
                  <p className="text-gray-700">{formatDateJST(selectedBooking.confirmedAt)}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                  <span className="w-1 h-4 bg-stone-800 mr-2 rounded"></span>
                  代表者情報
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">氏名</p>
                    <p>{selectedBooking.representative.firstName} {selectedBooking.representative.lastName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">国籍</p>
                    <p>{selectedBooking.representative.country || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">メールアドレス</p>
                    <p className="font-medium underline">{selectedBooking.representative.email}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">電話番号</p>
                    <p>{selectedBooking.representative.phone}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-200">
                   <p className="text-xs text-gray-400 mb-1">食事制限</p>
                   <p className="text-sm">{selectedBooking.representative.dietaryRestrictions || 'なし'}</p>
                </div>
              </div>

              <div className="mb-6">
                 <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                   <span className="w-1 h-4 bg-stone-800 mr-2 rounded"></span>
                   同伴者 ({selectedBooking.guests.length}名)
                 </h3>
                 <div className="bg-white border rounded-lg overflow-hidden">
                   {selectedBooking.guests.map((g, i) => (
                     <div key={i} className="p-3 border-b last:border-0 hover:bg-gray-50">
                       <p className="font-medium text-gray-900">{g.firstName} {g.lastName}</p>
                       <p className="text-xs text-gray-500 mt-1">食事制限: {g.dietaryRestrictions || 'なし'}</p>
                     </div>
                   ))}
                   {selectedBooking.guests.length === 0 && <div className="p-4 text-gray-400 text-sm italic text-center">同伴者なし</div>}
                 </div>
              </div>
            </div>

            <div className="border-t p-6 bg-gray-50 rounded-b-lg flex justify-end space-x-3">
              {selectedBooking.status === BookingStatus.REQUESTED && (
                <>
                  <button 
                    disabled={isProcessing}
                    onClick={() => handleStatusChange(selectedBooking.id, BookingStatus.REJECTED)}
                    className="px-6 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-bold transition disabled:opacity-50"
                  >
                    拒否 (Reject)
                  </button>
                  <button 
                    disabled={isProcessing}
                    onClick={() => handleStatusChange(selectedBooking.id, BookingStatus.CONFIRMED)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition shadow-md disabled:opacity-50 flex items-center"
                  >
                    {isProcessing ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                    承認 (Confirm)
                  </button>
                </>
              )}

              {selectedBooking.status === BookingStatus.CONFIRMED && (
                <button 
                  disabled={isProcessing}
                  onClick={() => openCancelModal(selectedBooking)}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-bold transition disabled:opacity-50 flex items-center"
                >
                  <Ban size={18} className="mr-2" />
                  キャンセル・返金処理
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && selectedBooking && refundCalculation && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-[60]">
           <div className="bg-white rounded-xl p-8 w-full max-w-md shadow-2xl">
             <div className="text-center mb-6">
               <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                 <AlertCircle size={32} />
               </div>
               <h3 className="text-2xl font-bold text-gray-900">キャンセルと返金の確認</h3>
             </div>
             
             <div className="bg-gray-100 p-4 rounded-lg mb-6 space-y-2 text-sm">
               <div className="flex justify-between">
                 <span className="text-gray-500">元の支払額:</span>
                 <span className="font-bold">¥{selectedBooking.totalPrice.toLocaleString()}</span>
               </div>
               <div className="flex justify-between text-red-600">
                 <span className="font-medium">キャンセル料率 ({refundCalculation.percentage}%):</span>
                 <span className="font-bold">¥{refundCalculation.fee.toLocaleString()}</span>
               </div>
               <div className="border-t border-gray-300 pt-2 flex justify-between text-green-700 text-lg">
                 <span className="font-bold">Stripe返金額:</span>
                 <span className="font-extrabold underline italic">¥{(selectedBooking.totalPrice - refundCalculation.fee).toLocaleString()}</span>
               </div>
             </div>

             <p className="text-xs text-gray-500 mb-8 leading-relaxed">
               ※「実行する」をクリックすると、Stripe APIを通じて返金が即座に試行され、ステータスがキャンセルに変更されます。この操作は取り消せません。
             </p>

             <div className="flex space-x-3">
               <button onClick={() => setShowCancelModal(false)} className="flex-1 py-3 text-gray-600 font-bold border rounded-lg hover:bg-gray-50 transition" disabled={isProcessing}>戻る</button>
               <button 
                 onClick={executeCancel} 
                 className="flex-1 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition shadow-lg flex justify-center items-center disabled:opacity-50"
                 disabled={isProcessing}
               >
                 {isProcessing ? <Loader2 className="animate-spin mr-2" size={20} /> : null}
                 実行する
               </button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

const AlertCircle = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
);

export default AdminPanel;
