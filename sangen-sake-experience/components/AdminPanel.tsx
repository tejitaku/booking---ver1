import React, { useState, useEffect } from 'react';
import { Booking, BookingStatus, ReservationType, SecondaryStatus } from '../types';
import { BookingService } from '../services/bookingService';
import { calculateCancellationFee } from '../utils/pricing';
import { Eye, Check, X, Ban, Search, LogOut } from 'lucide-react';

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

  // Cancel Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refundCalculation, setRefundCalculation] = useState<{ fee: number, percentage: number } | null>(null);

  useEffect(() => {
    if (loggedIn) {
      loadBookings();
    }
  }, [loggedIn]);

  const loadBookings = async () => {
    const data = await BookingService.getBookings();
    setBookings(data);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await BookingService.login(email, password);
    if (success) setLoggedIn(true);
    else alert('Invalid credentials. Try: admin@sangen.com / sake');
  };

  const handleStatusChange = async (id: string, status: BookingStatus) => {
    await BookingService.updateBookingStatus(id, status);
    loadBookings();
    if (selectedBooking) setSelectedBooking(null);
  };

  const handleSecondaryStatusChange = async (id: string, status: SecondaryStatus) => {
    await BookingService.updateSecondaryStatus(id, status);
    loadBookings();
    // if selectedBooking is open, update it locally to reflect change immediately in modal if we were using it there
    if (selectedBooking && selectedBooking.id === id) {
        setSelectedBooking(prev => prev ? { ...prev, secondaryStatus: status } : null);
    }
  };

  const openCancelModal = (booking: Booking) => {
    const calc = calculateCancellationFee(booking.date, booking.totalPrice);
    setRefundCalculation(calc);
    setShowCancelModal(true);
  };

  const executeCancel = async () => {
    if (!selectedBooking) return;
    await BookingService.updateBookingStatus(selectedBooking.id, BookingStatus.CANCELLED, `Cancel Fee: ${refundCalculation?.percentage}%`);
    setShowCancelModal(false);
    setSelectedBooking(null);
    loadBookings();
  };

  const filteredBookings = bookings.filter(b => {
    const matchesSearch = b.representative.lastName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.id.includes(searchQuery);
    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const isUrgent = (booking: Booking) => {
    const diff = Date.now() - new Date(booking.createdAt).getTime();
    return booking.status === BookingStatus.REQUESTED && diff > 48 * 60 * 60 * 1000;
  };

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center flex-col">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-96">
          <h2 className="text-xl font-bold mb-6 text-center">Sangen Admin</h2>
          <input className="w-full p-2 border mb-4 rounded" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="w-full p-2 border mb-6 rounded" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="w-full bg-stone-800 text-white p-2 rounded">Login</button>
          
          <div className="mt-6 text-center text-xs text-gray-400 bg-gray-50 p-2 rounded border border-gray-200">
            <p className="font-bold text-gray-500 mb-1">Demo Credentials</p>
            <p>ID: admin@sangen.com</p>
            <p>Pass: sake</p>
          </div>
        </form>
        <button 
          onClick={onBack} 
          className="mt-6 text-sm text-gray-500 hover:text-stone-800 bg-transparent border-none cursor-pointer underline"
        >
          ← Back to Booking Site
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      {/* Header */}
      <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">予約管理システム</h1>
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="text-gray-500 hover:text-stone-800 text-sm">
            サイトへ戻る
          </button>
          <button onClick={() => setLoggedIn(false)} className="text-gray-500 hover:text-red-600 flex items-center">
            <LogOut size={18} className="mr-2" /> ログアウト
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1400px] mx-auto">
        {/* Filters */}
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

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type / Guests</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status 2 (On-Site)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBookings.map((b) => (
                <tr key={b.id} className={isUrgent(b) ? 'bg-red-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{b.date}</div>
                    <div className="text-sm text-gray-500">{b.time}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{b.representative.lastName} {b.representative.firstName}</div>
                    <div className="text-xs text-gray-500">{b.representative.country}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${b.type === 'PRIVATE' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                      {b.type}
                    </span>
                    <div className="text-sm text-gray-500 mt-1">
                      {b.adults + b.adultsNonAlc + b.children + b.infants}名 (¥{b.totalPrice.toLocaleString()})
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {isUrgent(b) && <span className="text-xs text-red-600 font-bold block mb-1">⚠️ 48h超</span>}
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${b.status === BookingStatus.REQUESTED ? 'bg-yellow-100 text-yellow-800' : 
                        b.status === BookingStatus.CONFIRMED ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {b.status === BookingStatus.CONFIRMED ? (
                        <select 
                          className={`text-sm border rounded p-1 ${
                            b.secondaryStatus === 'ARRIVED' ? 'text-green-700 font-bold bg-green-50 border-green-200' :
                            b.secondaryStatus === 'NO_SHOW' ? 'text-gray-500 font-bold bg-gray-100 border-gray-200' :
                            'text-gray-700 bg-white'
                          }`}
                          value={b.secondaryStatus || ''}
                          onChange={(e) => handleSecondaryStatusChange(b.id, e.target.value as SecondaryStatus)}
                        >
                          <option value="">-</option>
                          <option value="ARRIVED">到着 (Arrived)</option>
                          <option value="NO_SHOW">ノーショー (No Show)</option>
                        </select>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
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

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500">Booking ID</p>
                  <p className="font-mono">{selectedBooking.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="font-bold">{selectedBooking.status}</p>
                  {selectedBooking.secondaryStatus && (
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded mt-1 inline-block">{selectedBooking.secondaryStatus}</span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500">日程</p>
                  <p className="font-bold text-lg">{selectedBooking.date} {selectedBooking.time}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">合計金額 (税込)</p>
                  <p className="font-bold text-lg">¥{selectedBooking.totalPrice.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded mb-6">
                <h3 className="font-bold mb-2">代表者情報</h3>
                <p>Name: {selectedBooking.representative.firstName} {selectedBooking.representative.lastName}</p>
                <p>Email: {selectedBooking.representative.email}</p>
                <p>Phone: {selectedBooking.representative.phone}</p>
                <p className="mt-2 text-sm text-stone-600 font-bold">Dietary Restrictions:</p>
                <p>{selectedBooking.representative.dietaryRestrictions || 'None'}</p>
              </div>

              <div className="mb-6">
                 <h3 className="font-bold mb-2">同伴者</h3>
                 <div className="bg-white border rounded">
                   {selectedBooking.guests.map((g, i) => (
                     <div key={i} className="p-3 border-b last:border-0">
                       <p className="font-medium text-gray-900">{g.firstName} {g.lastName}</p>
                       <p className="text-xs text-gray-500 mt-1">
                         Dietary Restrictions: <span className="text-gray-800">{g.dietaryRestrictions || 'None'}</span>
                       </p>
                     </div>
                   ))}
                   {selectedBooking.guests.length === 0 && <div className="p-3 text-gray-400 text-sm">No other guests</div>}
                 </div>
              </div>
            </div>

            {/* Action Buttons - Sticky at bottom */}
            <div className="border-t p-6 bg-white rounded-b-lg flex justify-end space-x-3">
              {selectedBooking.status === BookingStatus.REQUESTED && (
                <>
                  <button 
                    onClick={() => handleStatusChange(selectedBooking.id, BookingStatus.REJECTED)}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50 flex items-center"
                  >
                    <X size={16} className="mr-2" /> 拒否 (Release)
                  </button>
                  <button 
                    onClick={() => handleStatusChange(selectedBooking.id, BookingStatus.CONFIRMED)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                  >
                    <Check size={16} className="mr-2" /> 承認 (Capture)
                  </button>
                </>
              )}

              {selectedBooking.status === BookingStatus.CONFIRMED && (
                <button 
                  onClick={() => openCancelModal(selectedBooking)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center"
                >
                  <Ban size={16} className="mr-2" /> キャンセル処理
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && selectedBooking && refundCalculation && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]">
           <div className="bg-white rounded-lg p-6 w-96 shadow-2xl">
             <h3 className="text-xl font-bold text-red-600 mb-4">キャンセル処理</h3>
             <p className="mb-4">キャンセルポリシーに基づき、以下のキャンセル料が発生します。</p>
             
             <div className="bg-gray-100 p-3 rounded mb-4">
               <div className="flex justify-between mb-1">
                 <span>予約日:</span>
                 <span>{selectedBooking.date}</span>
               </div>
               <div className="flex justify-between mb-1">
                 <span>キャンセル料率:</span>
                 <span className="font-bold">{refundCalculation.percentage}%</span>
               </div>
               <div className="flex justify-between border-t pt-2 mt-2">
                 <span>徴収額:</span>
                 <span className="font-bold text-red-600">¥{refundCalculation.fee.toLocaleString()}</span>
               </div>
               <div className="flex justify-between">
                 <span>返金額:</span>
                 <span className="font-bold text-green-600">¥{(selectedBooking.totalPrice - refundCalculation.fee).toLocaleString()}</span>
               </div>
             </div>

             <div className="text-xs text-gray-500 mb-6">
               ※Stripeへの返金APIが実行され、自動通知メールが送信されます。
             </div>

             <div className="flex justify-end space-x-2">
               <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">戻る</button>
               <button onClick={executeCancel} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">キャンセル実行</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;