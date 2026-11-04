import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Nail Note | 美甲效果预览",
  description: "保留顾客真实手部特征的美甲沟通预览",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f3ef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased" style={{ fontFamily: '"SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif' }}>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
