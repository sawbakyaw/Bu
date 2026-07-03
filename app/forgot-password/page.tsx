'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
            {sent ? (
              <div className="text-center">
                <div className="inline-flex p-4 rounded-full bg-teal-500/10 mb-4">
                  <CheckCircle2 className="h-10 w-10 text-teal-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Check Your Email</h1>
                <p className="text-slate-400 mb-6">
                  We've sent a password reset link to <span className="text-teal-400">{email}</span>.
                  Follow the link in the email to reset your password.
                </p>
                <Link href="/login" className="btn-secondary px-6 py-3 rounded-lg inline-block">
                  Back to Login
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="inline-flex p-3 rounded-xl bg-orange-500/10 mb-4">
                    <Mail className="h-8 w-8 text-orange-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">Forgot Password?</h1>
                  <p className="text-slate-400 text-sm">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-300 mb-1 block">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full input-dark rounded-xl px-4 py-3"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn-primary py-3 rounded-xl font-medium disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>

                <Link href="/login" className="flex items-center justify-center gap-2 mt-6 text-sm text-slate-400 hover:text-teal-400 transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
