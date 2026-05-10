"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";

export function SolanaProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet"),
    [],
  );
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* autoConnect off: connect explicitly from UI after Phantom is ready. */}
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(err) => {
          if (err instanceof Error && err.name === "WalletNotReadyError") return;
          console.error(err);
        }}
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
