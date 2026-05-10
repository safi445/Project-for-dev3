import { PublicKey } from "@solana/web3.js";
import { ESCROW_SEED, REPUTATION_SEED, TRUSTCHAIN_PROGRAM_ID } from "./constants";

export function escrowPda(params: {
  client: PublicKey;
  freelancer: PublicKey;
  jobId: bigint;
}): [PublicKey, number] {
  const jobIdLe8 = new Uint8Array(8);
  new DataView(jobIdLe8.buffer).setBigUint64(0, params.jobId, true);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(ESCROW_SEED),
      params.client.toBuffer(),
      params.freelancer.toBuffer(),
      jobIdLe8,
    ],
    TRUSTCHAIN_PROGRAM_ID,
  );
}

export function reputationPda(user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(REPUTATION_SEED), user.toBuffer()],
    TRUSTCHAIN_PROGRAM_ID,
  );
}
