import type { Metadata } from "next";
import "./globals.css";

// The root layout supplies document metadata and the one global stylesheet used by both
// the main workspace and report tabs opened from it.
export const metadata: Metadata = {
  title: "Customer Intelligence Agent | Torq",
  description:
    "Research companies and turn public signals into security pain points and tailored sales talking points.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
