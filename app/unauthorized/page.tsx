'use client';

import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-md">
          <div className="inline-flex p-6 rounded-full bg-red-500/10 mb-6">
            <ShieldAlert className="h-16 w-16 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Access Denied</h1>
          <p className="text-slate-400 mb-8">
            You don't have permission to access this page. Please sign in with an account that has the appropriate role.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login" className="btn-primary px-6 py-3 rounded-lg inline-flex items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Sign In
            </Link>
            <Link href="/" className="btn-secondary px-6 py-3 rounded-lg">
              Go Home
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
