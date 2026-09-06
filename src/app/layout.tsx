import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "AgentMesh — autonomous agent-to-agent payments on BNB Chain";
const DESCRIPTION =
  "A network of specialist AI agents that sell their work over HTTP. " +
  "An orchestrator discovers services, receives HTTP 402, signs an EIP-712 " +
  "Permit2 authorisation, and settles on BNB Smart Chain — no human in the loop.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "AgentMesh",
  keywords: [
    "x402",
    "B402",
    "Binance Agent OS",
    "agentic payments",
    "BNB Smart Chain",
    "Permit2",
    "AI agents",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "AgentMesh",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)]">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
