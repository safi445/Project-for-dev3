import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { Connection } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { TRUSTCHAIN_PROGRAM_ID } from "./constants";
import idl from "@/idl/trustchain_lite.json";

export function getAnchorProvider(connection: Connection, wallet: WalletContextState) {
  // WalletContextState is compatible with Anchor's Wallet interface at runtime.
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
}

export function getTrustchainProgram(connection: Connection, wallet: WalletContextState) {
  const provider = getAnchorProvider(connection, wallet);
  // Keep the client hackathon-friendly: typed IDL can be added later by
  // generating it via `anchor build` and using `anchor client gen`.
  return new (Program as any)(idl, TRUSTCHAIN_PROGRAM_ID, provider) as Program<any>;
}

