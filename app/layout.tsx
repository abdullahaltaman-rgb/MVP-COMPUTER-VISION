import type { Metadata, Viewport } from 'next';
import { Noto_Kufi_Arabic, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import SiteChrome from '@/components/SiteChrome';

const kufi = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-kufi',
  display: 'swap',
});

const naskh = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-naskh',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'منظومة أبيض للرصد الآلي للامتثال البلدي',
  description:
    'نموذج تجريبي لمنظومة رصد آلي بالذكاء الاصطناعي لامتثال المغاسل — أمانة منطقة الرياض.',
};

export const viewport: Viewport = {
  themeColor: '#16294A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${kufi.variable} ${naskh.variable}`}>
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
