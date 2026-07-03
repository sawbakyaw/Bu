'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminLayout } from '@/components/admin-layout';
import { Operator, Bus, Trip } from '@/lib/types';
import { Search, Plus, Edit2, Trash2, Bus as BusIcon, Users, Calendar, DollarSign, Eye } from 'lucide-react';
import Link from 'next/link';

export default function OperatorsPage() {
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [search, setSearch] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [operatorStats, setOperatorStats] = useState<Record<string, any>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [newOperator, setNewOperator] = useState({ name: '', contact_phone: '', description: '' });
  const [editOperator, setEditOperator] = useState({ name: '', contact_phone: '', description: '', is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      const { data, error } = await supabase
        .from('operators')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOperators(data || []);

      // Fetch stats for each operator
      for (const op of data || []) {
        const { count: busesCount } = await supabase
          .from('buses')
          .select('*', { count: 'exact', head: true })
          .eq('operator_id', op.id);

        const { count: tripsCount } = await supabase
          .from('trips')
          .select('*', { count: 'exact', head: true })
          .eq('operator_id', op.id);

        setOperatorStats((prev) => ({
          ...prev,
          [op.id]: {
            buses: busesCount || 0,
            trips: tripsCount || 0,
          },
        }));
      }
    } catch (error) {
      console.error('Error fetching operators:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOperator = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('operators')
        .insert({ name: newOperator.name, contact_phone: newOperator.contact_phone, description: newOperator.description, is_active: true });
      if (error) throw error;
      setShowAddDialog(false);
      setNewOperator({ name: '', contact_phone: '', description: '' });
      fetchOperators();
    } catch (err) {
      console.error('Add operator failed:', err);
      alert('Failed to add operator: ' + (err as any)?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditOperator = async () => {
    if (!selectedOperator) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('operators')
        .update({ name: editOperator.name, contact_phone: editOperator.contact_phone, description: editOperator.description, is_active: editOperator.is_active })
        .eq('id', selectedOperator.id);
      if (error) throw error;
      setShowEditDialog(false);
      fetchOperators();
    } catch (err) {
      console.error('Edit operator failed:', err);
      alert('Failed to update operator: ' + (err as any)?.message);
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (op: Operator) => {
    setEditOperator({ name: op.name, contact_phone: op.contact_phone || '', description: op.description || '', is_active: op.is_active });
    setSelectedOperator(op);
    setShowEditDialog(true);
  };

  const filteredOperators = operators.filter((op) =>
    op.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Operators</h1>
            <p className="text-slate-400">Manage bus operators and their fleets</p>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Operator
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search operators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full input-dark rounded-xl pl-12 pr-4 py-3"
          />
        </div>

        {/* Operators Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900/60 rounded-xl p-6 animate-pulse">
                <div className="h-12 w-12 bg-slate-700 rounded-lg mb-4" />
                <div className="h-4 bg-slate-700 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOperators.map((operator) => (
              <div
                key={operator.id}
                className="bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden hover:border-teal-500/30 transition-all group"
              >
                {/* Header */}
                <div className="p-6 border-b border-slate-700/50">
                  <div className="flex items-center gap-4">
                    {operator.logo_url ? (
                      <img
                        src={operator.logo_url}
                        alt={operator.name}
                        className="w-14 h-14 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-teal-500 flex items-center justify-center">
                        <BusIcon className="h-7 w-7 text-white" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">{operator.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          operator.is_active
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {operator.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="p-4 grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-slate-400">
                      <BusIcon className="h-4 w-4" />
                      <span className="text-xs">Buses</span>
                    </div>
                    <p className="text-xl font-bold text-white mt-1">
                      {operatorStats[operator.id]?.buses || 0}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Calendar className="h-4 w-4" />
                      <span className="text-xs">Trips</span>
                    </div>
                    <p className="text-xl font-bold text-white mt-1">
                      {operatorStats[operator.id]?.trips || 0}
                    </p>
                  </div>
                </div>

                {/* Contact */}
                {operator.contact_phone && (
                  <div className="px-6 pb-4">
                    <p className="text-slate-400 text-sm">{operator.contact_phone}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="p-4 border-t border-slate-700/50 flex items-center gap-2">
                  <button
                    onClick={() => { setSelectedOperator(operator); setShowViewDialog(true); }}
                    className="flex-1 py-2 text-center bg-teal-500/10 text-teal-400 rounded-lg hover:bg-teal-500/20 transition-colors text-sm"
                  >
                    <Eye className="h-4 w-4 inline mr-1" />
                    View
                  </button>
                  <button
                    onClick={() => openEditDialog(operator)}
                    className="flex-1 py-2 text-center bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors text-sm"
                  >
                    <Edit2 className="h-4 w-4 inline mr-1" />
                    Edit
                  </button>
                  <button className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Operator Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAddDialog(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Add New Operator</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-300 mb-1 block">Operator Name *</label>
                <input type="text" value={newOperator.name} onChange={e => setNewOperator({ ...newOperator, name: e.target.value })} placeholder="e.g. Elite Express" className="w-full input-dark rounded-lg px-4 py-2" />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">Contact Phone</label>
                <input type="text" value={newOperator.contact_phone} onChange={e => setNewOperator({ ...newOperator, contact_phone: e.target.value })} placeholder="+95 1 234 5678" className="w-full input-dark rounded-lg px-4 py-2" />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">Description</label>
                <textarea value={newOperator.description} onChange={e => setNewOperator({ ...newOperator, description: e.target.value })} placeholder="Brief description..." className="w-full input-dark rounded-lg px-4 py-2 min-h-[80px]" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddDialog(false)} className="flex-1 btn-secondary py-2 rounded-lg">Cancel</button>
              <button onClick={handleAddOperator} disabled={saving || !newOperator.name} className="flex-1 btn-primary py-2 rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Add Operator'}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Operator Dialog */}
      {showViewDialog && selectedOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowViewDialog(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Operator Details</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-teal-500 flex items-center justify-center">
                  <BusIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-white font-semibold text-lg">{selectedOperator.name}</div>
                  <div className="text-xs text-slate-400">{selectedOperator.is_active ? 'Active' : 'Inactive'}</div>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between"><span className="text-slate-400 text-sm">Contact:</span><span className="text-white text-sm">{selectedOperator.contact_phone || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-sm">Buses:</span><span className="text-white text-sm">{operatorStats[selectedOperator.id]?.buses || 0}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-sm">Trips:</span><span className="text-white text-sm">{operatorStats[selectedOperator.id]?.trips || 0}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-sm">Joined:</span><span className="text-white text-sm">{new Date(selectedOperator.created_at).toLocaleDateString()}</span></div>
              </div>
              {selectedOperator.description && (
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="text-slate-400 text-xs mb-1">Description</div>
                  <div className="text-slate-200 text-sm">{selectedOperator.description}</div>
                </div>
              )}
            </div>
            <button onClick={() => setShowViewDialog(false)} className="w-full btn-secondary py-2 rounded-lg mt-6">Close</button>
          </div>
        </div>
      )}

      {/* Edit Operator Dialog */}
      {showEditDialog && selectedOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowEditDialog(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Edit Operator</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-300 mb-1 block">Operator Name *</label>
                <input type="text" value={editOperator.name} onChange={e => setEditOperator({ ...editOperator, name: e.target.value })} className="w-full input-dark rounded-lg px-4 py-2" />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">Contact Phone</label>
                <input type="text" value={editOperator.contact_phone} onChange={e => setEditOperator({ ...editOperator, contact_phone: e.target.value })} className="w-full input-dark rounded-lg px-4 py-2" />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">Description</label>
                <textarea value={editOperator.description} onChange={e => setEditOperator({ ...editOperator, description: e.target.value })} className="w-full input-dark rounded-lg px-4 py-2 min-h-[80px]" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditOperator({ ...editOperator, is_active: !editOperator.is_active })} className={`relative w-11 h-6 rounded-full transition-colors ${editOperator.is_active ? 'bg-teal-500' : 'bg-slate-600'}`}>
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${editOperator.is_active ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm text-slate-300">{editOperator.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEditDialog(false)} className="flex-1 btn-secondary py-2 rounded-lg">Cancel</button>
              <button onClick={handleEditOperator} disabled={saving} className="flex-1 btn-primary py-2 rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
