'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ShieldCheck } from 'lucide-react';

export default function PrivacyPage() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      const { data } = await supabase
        .from('cms_pages')
        .select('title, content')
        .eq('slug', 'privacy')
        .eq('is_published', true)
        .maybeSingle();

      if (data?.content) {
        setContent(data.content);
      } else {
        setContent(`## 1. Information We Collect

We collect the following information when you use our platform:
- Personal information: name, email, phone number, NRC/passport number
- Booking information: travel preferences, seat selections, payment history
- Technical data: IP address, browser type, device information

## 2. How We Use Your Information

- To process bookings and issue tickets
- To send booking confirmations and travel updates
- To process payments securely
- To provide customer support
- To improve our services and platform

## 3. Data Security

- We use encryption (SSL/TLS) for all data transmissions
- Payment information is processed through PCI-compliant gateways
- Access to personal data is restricted to authorized personnel only
- We never sell your personal information to third parties

## 4. Data Retention

- Booking records are retained for 2 years for legal and reference purposes
- Payment records are retained for 7 years as required by financial regulations
- You may request deletion of your account data at any time

## 5. Cookies

We use cookies to:
- Remember your language and search preferences
- Maintain your login session
- Analyze platform usage to improve our services

You can disable cookies in your browser settings, but some features may not work properly.

## 6. Your Rights

- Right to access your personal data
- Right to correct inaccurate data
- Right to request data deletion
- Right to opt out of marketing communications

## 7. Third-Party Services

We share necessary information with:
- Bus operators (for booking fulfillment)
- Payment gateways (for transaction processing)
- SMS/email providers (for notifications)

All third parties are bound by confidentiality obligations.

## 8. Contact

For privacy concerns, contact us at privacy@mm-busticket.com`);
      }
    } catch {
      setContent('Unable to load Privacy Policy at this time.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 rounded-xl bg-teal-500/10">
              <ShieldCheck className="h-7 w-7 text-teal-400" />
            </div>
            <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          </div>
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-8">
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-700 rounded w-3/4" />
                ))}
              </div>
            ) : (
              <div className="prose prose-invert max-w-none">
                {content?.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="text-xl font-bold text-white mt-6 mb-3">{line.replace('## ', '')}</h2>;
                  }
                  if (line.startsWith('- ')) {
                    return <p key={i} className="text-slate-300 ml-4 mb-1">{line}</p>;
                  }
                  if (line.trim()) {
                    return <p key={i} className="text-slate-300 mb-2">{line}</p>;
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
