import "./globals.css";
import type { Metadata } from "next";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "AQUAS Dashboard",
  description: "A dashboard to view all AQUAS data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
