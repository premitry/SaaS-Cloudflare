import type { Metadata } from "next";
import "./globals.css";
import { ToastBinder, ToastProvider } from "../components/Toast";

export const metadata: Metadata = {
  title: "Cloudflare Domain Panel",
  description: "Multi-account Cloudflare domain management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ink-950 text-ink-200 min-h-screen antialiased">
        <ToastProvider>
          <ToastBinder />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
