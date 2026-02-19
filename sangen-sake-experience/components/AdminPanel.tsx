
// Add React to the imports to resolve namespace errors in FC and FormEvent types
import React, { useState, useEffect } from 'react';
import { Booking, BookingStatus, SecondaryStatus } from '../types';
import { BookingService } from '../services/bookingService';
import { calculateCancellationFee } from '../utils/pricing';
import { Eye, Check, X, Ban, Search, LogOut, Loader2, Clock, Calendar, Trash2, Mail, Settings, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';

interface AdminPanelProps {
  onBack: () => void;
}

type AdminView = 'BOOKINGS' | 'EMAIL_SETTINGS';

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<AdminView>('BOOKINGS');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isProcessing, setIsProcessing] = useState(false);

  // Email Settings State
  const [emailTemplates, setEmailTemplates] = useState<Record<string, string>>({});
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('RECEIVED');

  // Cancel Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refundCalculation, setRefundCalculation] = useState<{ fee: number, percentage: number } | null>(null);

  // Manual Stripe Notice Modal
  const [showStripeNotice, setShowStripeNotice] = useState(false);
  const [lastRefundAmount, setLastRefundAmount] = useState(0);

  useEffect(() => {
    if (loggedIn) {
      loadBookings();
      loadEmailTemplates();
    }
  }, [loggedIn]);

  const loadBookings = async () => {
    setIsProcessing(true);
    try {
      const data = await BookingService.getBookings();
      const sorted = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBookings(sorted);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const loadEmailTemplates = async () => {
    try {
      const templates = await BookingService.getEmailTemplates();
      setEmailTemplates(templates);
    } catch (e) {
      console.error("Failed to load templates", e);
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
      alert("Error updating status: " + e);
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

  const handleDelete = async (id: string) => {
    if (!confirm("予約データを完全に削除しますか？\n（この操作は取り消せません）")) return;
    setIsProcessing(true);
    try {
      await BookingService.deleteBooking(id);
      await loadBookings();
    } catch (e) {
      alert("削除に失敗しました");
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
      await BookingService.updateBookingStatus(
        selectedBooking.id, 
        BookingStatus.CANCELLED, 
        `Manual Refund Req: ¥${refundAmount.toLocaleString()}`,
        refundAmount
      );
      setLastRefundAmount(refundAmount);
      setShowCancelModal(false);
      setSelectedBooking(null);
      await loadBookings();
      setShowStripeNotice(true);
    } catch (e) {
      alert("Cancellation error: " + e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveTemplate = async (key: string, value: string) => {
    setIsSavingTemplate(true);
    setIsProcessing(true); 
    try {
      await BookingService.updateEmailTemplate(key, value);
      await loadEmailTemplates();
    } catch (e) {
      alert("保存に失敗しました: " + e);
    } finally {
      setIsSavingTemplate(false);
      setIsProcessing(false); 
    }
  };

  const formatDateJST = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Asia/Tokyo'
      }).format(date);
    } catch (e) { return dateStr; }
  };

  const filteredBookings = bookings.filter(b => {
    const matchesSearch = b.representative.lastName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.id.includes(searchQuery);
    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const templateTypes = [
    { key: 'RECEIVED', label: 'リクエスト受付時' },
    { key: 'CONFIRMED', label: '承認（確定）時' },
    { key: 'REJECTED', label: '拒否（満席等）時' },
    { key: 'CANCELLED', label: 'キャンセル完了時' },
  ];

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
             <span className="font-bold text-stone-800">Processing...</span>
           </div>
        </div>
      )}

      <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <h1 className="text-xl font-bold tracking-tight">予約管理システム</h1>
          <nav className="flex space-x-4">
            <button 
              onClick={() => setView('BOOKINGS')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${view === 'BOOKINGS' ? 'bg-stone-100 text-stone-900' : 'text-gray-500 hover:text-stone-700'}`}
            >
              予約一覧
            </button>
            <button 
              onClick={() => setView('EMAIL_SETTINGS')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${view === 'EMAIL_SETTINGS' ? 'bg-stone-100 text-stone-900' : 'text-gray-500 hover:text-stone-700'}`}
            >
              メール設定
            </button>
          </nav>
        </div>
        <button onClick={() => setLoggedIn(false)} className="text-gray-400 hover:text-red-600 flex items-center text-sm">
          <LogOut size={16} className="mr-1.5" /> ログアウト
        </button>
      </header>

      <main className="p-6 max-w-[1400px] mx-auto">
        {view === 'BOOKINGS' ? (
          <>
            <div className="mb-6 flex space-x-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input 
                  type="text" placeholder="名前、IDで検索..." 
                  className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <select 
                className="border rounded-lg px-4 py-2 bg-white text-sm"
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">すべて表示</option>
                <option value={BookingStatus.REQUESTED}>リクエスト (未対応)</option>
                <option value={BookingStatus.CONFIRMED}>確定済み</option>
                <option value={BookingStatus.CANCELLED}>キャンセル</option>
              </select>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4 text-left">Requested At</th>
                    <th className="px-6 py-4 text-left">Reservation Date/Time</th>
                    <th className="px-6 py-4 text-left">Name</th>
                    <th className="px-6 py-4 text-left">Type / Guests</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-left">Arrival (Status 2)</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {filteredBookings.map((b) => (
                    <tr key={b.id} className={`${b.status === BookingStatus.REQUESTED ? 'bg-amber-50/40' : ''} hover:bg-gray-50 transition-colors`}>
                      <td className="px-6 py-4 whitespace-nowrap text-[11px] text-gray-500 font-medium">
                        <div className="flex items-center">
                          <Clock size={12} className="mr-1 text-gray-400" />
                          {formatDateJST(b.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-gray-900">{b.date}</div>
                        <div className="text-gray-500">{b.time}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{b.representative.lastName} {b.representative.firstName}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{b.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-[10px] font-bold rounded-full ${b.type === 'PRIVATE' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                          {b.type}
                        </span>
                        <div className="text-gray-500 mt-1">{b.adults + b.adultsNonAlc + b.children + b.infants}名</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-[10px] font-bold rounded-full 
                          ${b.status === BookingStatus.REQUESTED ? 'bg-yellow-100 text-yellow-700' : 
                            b.status === BookingStatus.CONFIRMED ? 'bg-blue-100 text-blue-700' : 
                            'bg-gray-100 text-gray-700'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {b.status === BookingStatus.CONFIRMED ? (
                          <select 
                            className={`text-xs p-1 rounded border ${b.secondaryStatus === 'ARRIVED' ? 'bg-green-50 text-green-700 border-green-200' : b.secondaryStatus === 'NO_SHOW' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500'}`}
                            value={b.secondaryStatus || ''}
                            onChange={(e) => handleSecondaryStatusChange(b.id, e.target.value as SecondaryStatus)}
                          >
                            <option value="">-</option>
                            <option value="ARRIVED">到着 (Arrived)</option>
                            <option value="NO_SHOW">欠席 (No-Show)</option>
                          </select>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 flex justify-end items-center">
                        <button onClick={() => setSelectedBooking(b)} className="bg-stone-100 hover:bg-stone-200 text-stone-700 p-2 rounded-lg transition" title="詳細">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => handleDelete(b.id)} className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition" title="削除">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Admin Notification Setting */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h2 className="text-xl font-bold flex items-center text-stone-800 mb-6">
                <Settings className="mr-2 text-stone-700" size={20} />
                管理者通知設定
              </h2>
              <div className="space-y-3">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">通知先メールアドレス</label>
                <div className="flex space-x-2">
                  <input 
                    type="email" 
                    placeholder="example@admin.com"
                    className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none bg-gray-50 font-medium"
                    value={emailTemplates['ADMIN_NOTIFY_EMAIL'] || ''}
                    onChange={(e) => setEmailTemplates({...emailTemplates, 'ADMIN_NOTIFY_EMAIL': e.target.value})}
                  />
                  <button 
                    onClick={() => handleSaveTemplate('ADMIN_NOTIFY_EMAIL', emailTemplates['ADMIN_NOTIFY_EMAIL'])}
                    disabled={isProcessing}
                    className="bg-stone-800 text-white px-6 py-3 rounded-lg hover:bg-stone-900 transition disabled:opacity-50 font-bold text-sm"
                  >
                    保存
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 italic">予約リクエストが入った際、このアドレスに通知メールが届きます。空欄の場合は送信されません。</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center text-stone-800">
                  <Mail className="mr-2 text-stone-700" size={20} />
                  自動メール テンプレート設定
                </h2>
              </div>

              <div className="flex border-b mb-6">
                {templateTypes.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 -mb-px ${activeTab === t.key ? 'border-stone-800 text-stone-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">メール件名 (Subject)</label>
                  <input 
                    type="text" 
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none bg-gray-50 font-medium"
                    value={emailTemplates[`${activeTab}_SUBJECT`] || ''}
                    onChange={(e) => setEmailTemplates({...emailTemplates, [`${activeTab}_SUBJECT`]: e.target.value})}
                  />
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[10px] text-gray-400 italic">利用可能な変数: {"{{name}}"}, {"{{date}}"}, {"{{time}}"}, {"{{type}}"}</p>
                    <button 
                      onClick={() => handleSaveTemplate(`${activeTab}_SUBJECT`, emailTemplates[`${activeTab}_SUBJECT`])}
                      disabled={isProcessing}
                      className="text-xs bg-stone-700 text-white px-4 py-1.5 rounded-lg hover:bg-stone-800 transition disabled:opacity-50"
                    >
                      件名を保存
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">メール本文 (Body)</label>
                  <textarea 
                    className="w-full h-80 p-4 border rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none font-mono text-sm bg-gray-50 leading-relaxed"
                    value={emailTemplates[`${activeTab}_BODY`] || ''}
                    onChange={(e) => setEmailTemplates({...emailTemplates, [`${activeTab}_BODY`]: e.target.value})}
                  />
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[10px] text-gray-400 italic">
                      利用可能な変数: {"{{name}}"}, {"{{date}}"}, {"{{time}}"}, {"{{type}}"} 
                      {activeTab === 'CANCELLED' && (", {{refund_amount}}")}
                    </p>
                    <button 
                      onClick={() => handleSaveTemplate(`${activeTab}_BODY`, emailTemplates[`${activeTab}_BODY`])}
                      disabled={isProcessing}
                      className="text-xs bg-stone-700 text-white px-4 py-1.5 rounded-lg hover:bg-stone-800 transition disabled:opacity-50"
                    >
                      本文を保存
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <h2 className="text-2xl font-bold text-stone-900">予約詳細</h2>
                <button onClick={() => setSelectedBooking(null)} className="text-gray-400 hover:text-gray-600 transition p-1">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Requested At (JST)</p>
                  <p className="font-bold text-stone-700 text-sm flex items-center">
                    <Clock size={12} className="mr-1.5 text-gray-400" />
                    {formatDateJST(selectedBooking.createdAt)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Current Status</p>
                  <p className="font-bold text-blue-600 text-sm">{selectedBooking.status}</p>
                </div>
                {selectedBooking.confirmedAt && (
                   <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Confirmed At (JST)</p>
                    <p className="font-bold text-blue-800 text-sm">{formatDateJST(selectedBooking.confirmedAt)}</p>
                  </div>
                )}
                {selectedBooking.cancelledAt && (
                   <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest text-red-400">Cancelled At (JST)</p>
                    <p className="font-bold text-red-600 text-sm">{formatDateJST(selectedBooking.cancelledAt)}</p>
                    {selectedBooking.refundAmount !== undefined && (
                      <p className="text-[10px] text-red-500 font-bold">返金予定額: ¥{selectedBooking.refundAmount.toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 p-5 rounded-xl mb-6 border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center text-sm">
                  <span className="w-1 h-4 bg-stone-800 mr-2 rounded"></span>
                  代表者情報
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">氏名</p>
                    <p className="font-medium text-stone-900">{selectedBooking.representative.firstName} {selectedBooking.representative.lastName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">国籍</p>
                    <p className="font-medium text-stone-900">{selectedBooking.representative.country || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-400 mb-0.5">メールアドレス</p>
                    <p className="font-medium text-stone-900 underline underline-offset-2">{selectedBooking.representative.email}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-400 mb-0.5">電話番号</p>
                    <p className="font-medium text-stone-900">{selectedBooking.representative.phone}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-400 mb-0.5">食事制限 (Dietary Restrictions)</p>
                    <p className="font-medium text-stone-900">{selectedBooking.representative.dietaryRestrictions || 'なし'}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                 <h3 className="font-bold text-gray-800 mb-3 flex items-center text-sm">
                   <span className="w-1 h-4 bg-stone-800 mr-2 rounded"></span>
                   同伴者 ({selectedBooking.guests.length}名)
                 </h3>
                 <div className="bg-white border rounded-xl overflow-hidden divide-y divide-gray-100">
                   {selectedBooking.guests.map((g, i) => (
                     <div key={i} className="p-3 hover:bg-gray-50 transition text-sm">
                       <p className="font-medium text-stone-900">{g.firstName} {g.lastName}</p>
                       <p className="text-[11px] text-gray-500 mt-1 italic">食事制限: {g.dietaryRestrictions || 'なし'}</p>
                     </div>
                   ))}
                   {selectedBooking.guests.length === 0 && <div className="p-6 text-gray-400 text-sm italic text-center">同伴者なし</div>}
                 </div>
              </div>
            </div>

            <div className="border-t p-6 bg-gray-50 rounded-b-lg flex justify-end space-x-3">
              {selectedBooking.status === BookingStatus.REQUESTED && (
                <>
                  <button onClick={() => handleStatusChange(selectedBooking.id, BookingStatus.REJECTED)} className="px-6 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-bold transition text-sm">
                    拒否 (Reject)
                  </button>
                  <button onClick={() => handleStatusChange(selectedBooking.id, BookingStatus.CONFIRMED)} className="px-6 py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-bold transition shadow-md flex items-center text-sm">
                    承認 (Confirm)
                  </button>
                </>
              )}

              {selectedBooking.status === BookingStatus.CONFIRMED && (
                <button onClick={() => openCancelModal(selectedBooking)} className="px-6 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-bold transition flex items-center text-sm">
                  <Ban size={16} className="mr-2" />
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
           <div className="bg-white rounded-xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
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
               <div className="flex justify-between text-red-600 font-bold">
                 <span>キャンセル料 ({refundCalculation.percentage}%):</span>
                 <span>¥{refundCalculation.fee.toLocaleString()}</span>
               </div>
               <div className="border-t border-gray-300 pt-2 flex justify-between text-green-700 text-lg">
                 <span className="font-bold">返金予定額:</span>
                 <span className="font-extrabold underline italic">¥{(selectedBooking.totalPrice - refundCalculation.fee).toLocaleString()}</span>
               </div>
             </div>

             <div className="bg-amber-50 border border-amber-200 p-3 rounded mb-6 flex items-start">
                <Settings size={16} className="text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  ※ ステータスを「キャンセル」に更新し、自動返信メールを送信します。この操作ではStripeの自動返金は行われません。実行後、Stripe管理画面から手動で返金を行ってください。
                </p>
             </div>

             <div className="flex space-x-3">
               <button onClick={() => setShowCancelModal(false)} className="flex-1 py-3 text-gray-600 font-bold border rounded-lg hover:bg-gray-50 transition text-sm">戻る</button>
               <button onClick={executeCancel} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition shadow-lg text-sm">実行する</button>
             </div>
           </div>
        </div>
      )}

      {/* Manual Stripe Instruction Modal */}
      {showStripeNotice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl p-8 w-full max-w-md shadow-2xl text-center">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
               <Check size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">ステータスを更新しました</h3>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              予約を「キャンセル」に変更し、顧客へメールを送信しました。<br />
              <strong className="text-red-600 text-lg block mt-2">Stripeで ¥{lastRefundAmount.toLocaleString()} を返金してください。</strong>
            </p>
            <button 
              onClick={() => setShowStripeNotice(false)} 
              className="w-full py-3 bg-stone-900 text-white font-bold rounded-lg hover:bg-stone-800 transition"
            >
              閉じる
            </button>
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
