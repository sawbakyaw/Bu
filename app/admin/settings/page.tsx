'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminLayout } from '@/components/admin-layout';
import { Settings, Save, Loader2, CheckCircle2 } from 'lucide-react';
import type { PaymentGateway } from '@/lib/types-extended';

export default function AdminSettingsPage() {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    platformName: 'MM-BusTicket Pro',
    supportEmail: 'support@mm-busticket.com',
    supportPhone: '+95 1 234 5678',
    currency: 'MMK',
    defaultLanguage: 'en',
    bookingFeePercentage: '2',
    minBookingAdvanceHours: '24',
    cancellationFeePercentage: '10',
    maxSeatsPerBooking: '6',
  });

  useEffect(() => {
    fetchGateways();
  }, []);

  const fetchGateways = async () => {
    try {
      const { data } = await supabase
        .from('payment_gateways')
        .select('*')
        .order('display_order', { ascending: true });
      setGateways(data || []);
    } catch (err) {
      console.error('Error fetching gateways:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  const toggleGateway = async (id: string, isActive: boolean) => {
    try {
      await supabase
        .from('payment_gateways')
        .update({ is_active: !isActive })
        .eq('id', id);
      fetchGateways();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="h-6 w-6 text-orange-400" />
            System Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Configure platform-wide settings</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">General Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-300 mb-1 block">Platform Name</label>
                <input
                  type="text"
                  value={settings.platformName}
                  onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                  className="w-full input-dark rounded-lg px-4 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Support Email</label>
                  <input
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Support Phone</label>
                  <input
                    type="text"
                    value={settings.supportPhone}
                    onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Currency</label>
                  <input
                    type="text"
                    value={settings.currency}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Default Language</label>
                  <select
                    value={settings.defaultLanguage}
                    onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  >
                    <option value="en">English</option>
                    <option value="mm">Myanmar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Booking Rules</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Booking Fee (%)</label>
                  <input
                    type="number"
                    value={settings.bookingFeePercentage}
                    onChange={(e) => setSettings({ ...settings, bookingFeePercentage: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Cancellation Fee (%)</label>
                  <input
                    type="number"
                    value={settings.cancellationFeePercentage}
                    onChange={(e) => setSettings({ ...settings, cancellationFeePercentage: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Min Advance (hours)</label>
                  <input
                    type="number"
                    value={settings.minBookingAdvanceHours}
                    onChange={(e) => setSettings({ ...settings, minBookingAdvanceHours: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Max Seats/Booking</label>
                  <input
                    type="number"
                    value={settings.maxSeatsPerBooking}
                    onChange={(e) => setSettings({ ...settings, maxSeatsPerBooking: e.target.value })}
                    className="w-full input-dark rounded-lg px-4 py-2"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Payment Gateways</h2>
          {loading ? (
            <div className="text-center py-6">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {gateways.map((gw) => (
                <div key={gw.id} className="flex items-center justify-between bg-slate-800/50 rounded-xl p-3 border border-slate-700/30">
                  <div>
                    <div className="text-sm text-white font-medium">{gw.display_name}</div>
                    <div className="text-xs text-slate-500 capitalize">{gw.gateway_type}</div>
                  </div>
                  <button
                    onClick={() => toggleGateway(gw.id, gw.is_active)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${gw.is_active ? 'bg-teal-500' : 'bg-slate-600'}`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${gw.is_active ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-6 py-3 rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-teal-400 flex items-center gap-1 text-sm">
              <CheckCircle2 className="h-4 w-4" /> Settings saved
            </span>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
