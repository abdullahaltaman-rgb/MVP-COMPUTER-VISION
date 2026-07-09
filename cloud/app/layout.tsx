import type { Metadata, Viewport } from 'next';
import { Noto_Kufi_Arabic, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';

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
  title: 'أبيض فيجن — الرصد الآلي للامتثال',
  description:
    'منظومة أبيض فيجن v1.0 — رصد امتثال حي لفرع المغسلة (أمانة منطقة الرياض): كاميرات RTSP، سلسلة عهدة رقمية، ومهل تصحيح موثّقة.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'أبيض فيجن',
  },
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
      <body>{children}</body>
    </html>
  );
}
