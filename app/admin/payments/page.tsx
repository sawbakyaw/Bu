'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { AdminLayout } from '@/components/admin-layout';
import { supabase } from '@/lib/supabase';

type Payment = { id: string; booking_id: string; payment_method: string; transaction_ref: string | null; payment_status: string; created_at: string; bookings?: { booking_reference: string; passenger_name: string; passenger_phone: string; total_amount: number; seat_numbers: string[] } | null };

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadPayments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('payments').select('id, booking_id, payment_method, transaction_ref, payment_status, created_at, bookings(booking_reference, passenger_name, passenger_phone, total_amount, seat_numbers)').eq('payment_status', 'pending').order('created_at', { ascending: false });
    if (error) setMessage('Unable to load payment queue. Check your admin role.');
    setPayments((data as Payment[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const review = async (paymentId: string, status: 'approved' | 'rejected') => {
    setBusy(paymentId);
    setMessage('');
    const { error } = await supabase.rpc('review_guest_payment', { p_payment_id: paymentId, p_status: status, p_notes: null });
    if (error) setMessage(error.message.includes('Admin') ? 'Only platform admins can review payments.' : 'Review failed. Please try again.');
    else await loadPayments();
    setBusy(null);
  };

  return <AdminLayout><div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal-400" /><h1 className="text-2xl font-bold text-white">Payment verification</h1></div><p className="text-slate-400">Review guest payment references before confirming seats.</p></div><button onClick={() => void loadPayments()} className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    {message && <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">{message}</div>}
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b border-slate-800 text-sm text-slate-400"><tr>{['Reference','Passenger','Method / transaction','Seats','Amount','Actions'].map(h => <th key={h} className="px-5 py-4 font-medium">{h}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Loading queue…</td></tr> : payments.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">No pending payments.</td></tr> : payments.map(payment => <tr key={payment.id} className="border-b border-slate-800/80 align-top"><td className="px-5 py-4 font-mono text-orange-300">{payment.bookings?.booking_reference || '—'}<span className="mt-1 block text-xs text-slate-500">{new Date(payment.created_at).toLocaleString()}</span></td><td className="px-5 py-4"><p className="font-medium text-white">{payment.bookings?.passenger_name || '—'}</p><p className="text-sm text-slate-400">{payment.bookings?.passenger_phone || '—'}</p></td><td className="px-5 py-4"><p className="capitalize text-slate-200">{payment.payment_method}</p><p className="text-sm text-teal-300">{payment.transaction_ref || 'No reference'}</p></td><td className="px-5 py-4 text-slate-300">{payment.bookings?.seat_numbers?.join(', ') || '—'}</td><td className="px-5 py-4 font-medium text-white">MMK {Number(payment.bookings?.total_amount || 0).toLocaleString()}</td><td className="px-5 py-4"><div className="flex gap-2"><button aria-label="View payment reference" className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><Eye className="h-4 w-4" /></button><button disabled={busy === payment.id} onClick={() => void review(payment.id, 'approved')} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm text-white hover:bg-teal-500 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Approve</button><button disabled={busy === payment.id} onClick={() => void review(payment.id, 'rejected')} className="flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"><XCircle className="h-4 w-4" />Reject</button></div></td></tr>)}</tbody></table></div></div>
  </div></AdminLayout>;
}
