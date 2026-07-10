/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', 'firebase-admin'],
    // خطوط PDF العربية يجب أن تُضمَّن في حزمة دوال Vercel
    outputFileTracingIncludes: {
      '/api/cron/weekly': ['./assets/fonts/**', './node_modules/pdfkit/js/data/**'],
      '/api/reports/**': ['./assets/fonts/**', './node_modules/pdfkit/js/data/**'],
    },
  },
};

export default nextConfig;
