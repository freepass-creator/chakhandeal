import "./globals.css";
import PWARegister from "@/components/PWARegister";
import DeviceShell from "@/components/DeviceShell";

export const metadata = {
  metadataBase: process.env.VERCEL_URL ? new URL(`https://${process.env.VERCEL_URL}`) : undefined,
  title: "착한딜",
  description: "신뢰를 바탕으로 더 좋은 거래 문화를 만드는 착한딜",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "착한딜" },
  openGraph: {
    title: "착한딜",
    description: "신뢰를 바탕으로 더 좋은 거래 문화를 만드는 착한딜",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "착한딜",
    description: "신뢰를 바탕으로 더 좋은 거래 문화를 만드는 착한딜",
  },
};

export const viewport = {
  themeColor: "#16314d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>
        <PWARegister />
        <DeviceShell>
          {children}
        </DeviceShell>
      </body>
    </html>
  );
}
