'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminLayout } from '@/components/admin-layout';
import { UserCheck, Search, Plus, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { Agent } from '@/lib/types-extended';

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAgents(data || []);
    } catch (err) {
      console.error('Error fetching agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (agentId: string) => {
    setVerifying(agentId);
    try {
      const { error } = await supabase
        .from('agents')
        .update({ is_verified: true, verified_at: new Date().toISOString() })
        .eq('id', agentId);
      if (error) throw error;
      await fetchAgents();
    } catch (err) {
      console.error('Verify failed:', err);
    } finally {
      setVerifying(null);
    }
  };

  const filtered = agents.filter(a =>
    a.company_name.toLowerCase().includes(search.toLowerCase()) ||
    a.agent_code.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: agents.length,
    verified: agents.filter(a => a.is_verified).length,
    active: agents.filter(a => a.is_active).length,
    pending: agents.filter(a => !a.is_verified).length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <UserCheck className="h-6 w-6 text-orange-400" />
              Agent Management
            </h1>
            <p className="text-slate-400 text-sm mt-1">Manage travel agents and verification</p>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Agent
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Agents" value={stats.total} color="orange" />
          <StatCard label="Verified" value={stats.verified} color="teal" />
          <StatCard label="Active" value={stats.active} color="blue" />
          <StatCard label="Pending Verification" value={stats.pending} color="yellow" />
        </div>

        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-700/50">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                className="w-full input-dark rounded-lg pl-10 pr-4 py-2"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              Loading agents...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <UserCheck className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 mb-2">No agents found</p>
              <p className="text-slate-500 text-sm">Agents will appear here once they register.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">Agent Code</th>
                    <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">Company</th>
                    <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">Contact</th>
                    <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">Commission</th>
                    <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((agent) => (
                    <tr key={agent.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-sm text-slate-300 font-mono">{agent.agent_code}</td>
                      <td className="px-4 py-3 text-sm text-white font-medium">{agent.company_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div>{agent.contact_person}</div>
                        <div className="text-xs text-slate-500">{agent.email} · {agent.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{agent.commission_rate}%</td>
                      <td className="px-4 py-3">
                        {agent.is_verified ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-teal-500/10 text-teal-400 px-2 py-1 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded-full">
                            <XCircle className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!agent.is_verified && (
                          <button
                            onClick={() => handleVerify(agent.id)}
                            disabled={verifying === agent.id}
                            className="text-xs bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {verifying === agent.id ? 'Verifying...' : 'Verify'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    teal: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-80">{label}</div>
    </div>
  );
}
