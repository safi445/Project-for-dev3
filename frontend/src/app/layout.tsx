import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { SolanaProviders } from "@/components/SolanaProviders";

export const metadata: Metadata = {
  title: "TrustChain Lite",
  description: "Decentralized escrow + reputation on Solana Devnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  );
}
