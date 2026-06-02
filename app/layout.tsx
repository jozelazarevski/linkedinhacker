import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkedIn Growth Studio",
  description:
    "Grow your LinkedIn audience the legit way: schedule & publish your own posts via the official API, draft with AI, and manage engagement with a human-in-the-loop queue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
