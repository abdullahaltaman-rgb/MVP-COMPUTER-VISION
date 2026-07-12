import type { Metadata, Viewport } from 'next';
import { Noto_Kufi_Arabic, Noto_Sans_Arabic } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
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
  title: 'منصة رصد الامتثال البلدي',
  description:
    'منصة رصد الامتثال البلدي — رصد امتثال حي لقطاع المغاسل (أمانة منطقة الرياض): كاميرات RTSP، سلسلة عهدة رقمية، ومهل تصحيح موثّقة.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'منصة رصد الامتثال البلدي',
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
