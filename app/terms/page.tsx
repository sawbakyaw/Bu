'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { FileText } from 'lucide-react';

export default function TermsPage() {
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
        .eq('slug', 'terms')
        .eq('is_published', true)
        .maybeSingle();

      if (data?.content) {
        setContent(data.content);
      } else {
        setContent(`## 1. Acceptance of Terms

By accessing and using MM-BusTicket Pro, you accept and agree to be bound by these Terms of Service. If you do not agree, please do not use our platform.

## 2. Booking and Tickets

- All bookings are subject to availability and confirmation.
- Tickets purchased through our platform are non-transferable unless stated otherwise.
- Passengers must carry valid identification (NRC or Passport) during travel.
- Foreign passengers must use their passport number for booking.

## 3. Cancellation and Refunds

- Cancellation requests must be made at least 24 hours before departure for a full refund.
- Cancellations within 24 hours of departure are subject to operator policies.
- Refunds are processed within 5-7 business days to the original payment method.
- Platform fees are non-refundable.

## 4. Payment

- We support KBZ Pay, Wave Pay, AYA Pay, CB Pay, MPU, and bank transfers.
- All payments are processed securely through our payment gateway partners.
- Prices are displayed in Myanmar Kyat (MMK) unless otherwise specified.

## 5. Liability

- MM-BusTicket Pro acts as a booking platform and is not responsible for delays, cancellations, or service quality provided by bus operators.
- We are not liable for any indirect, incidental, or consequential damages arising from the use of our services.

## 6. Privacy

Your privacy is important to us. Please review our Privacy Policy to understand how we collect and use your information.

## 7. Changes to Terms

We reserve the right to modify these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.

## 8. Contact

For questions about these Terms, contact us at support@mm-busticket.com`);
      }
    } catch {
      setContent('Unable to load Terms of Service at this time.');
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
            <div className="p-3 rounded-xl bg-orange-500/10">
              <FileText className="h-7 w-7 text-orange-400" />
            </div>
            <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
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
