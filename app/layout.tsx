import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Toronto Civic Data",
  description: "Data about the City of Toronto, every figure linked to its original source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "32px 16px" }}>{children}</main>
      </body>
    </html>
  );
}
