"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { escrowPda, reputationPda } from "@/lib/solana/pdas";
import { TRUSTCHAIN_PROGRAM_ID } from "@/lib/solana/constants";
import { getTrustchainProgram } from "@/lib/solana/program";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { copyToClipboard, shortKey, solscanAccountUrl, solscanTxUrl } from "@/lib/ui/utils";

type EscrowStatus = "Funded" | "In Progress" | "Released" | "Unknown";

type EscrowView = {
  escrowKey: string;
  client: string;
  freelancer: string;
  jobId: string;
  amountLamports: string;
  amountReleasedLamports: string;
  totalMilestones: number;
  releasedMilestones: number;
  status: EscrowStatus;
};

type ReputationView = {
  user: string;
  score: string;
  completedJobs: string;
};

type EscrowListItem = EscrowView & {
  role: "Client" | "Freelancer";
};

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "brand";
type AnchorNumber = { toString: () => string };
type AnchorEscrowStatus = {
  funded?: Record<string, never>;
  inProgress?: Record<string, never>;
  released?: Record<string, never>;
};
type AnchorEscrowAccount = {
  client: PublicKey;
  freelancer: PublicKey;
  jobId: AnchorNumber;
  amountLamports: AnchorNumber;
  amountReleasedLamports?: AnchorNumber;
  totalMilestones?: number;
  releasedMilestones?: number;
  status?: AnchorEscrowStatus;
};
type AnchorReputationAccount = {
  user: PublicKey;
  score: AnchorNumber;
  completedJobs: AnchorNumber;
};
type RpcBuilder = {
  accounts: (accounts: Record<string, unknown>) => {
    rpc: () => Promise<string>;
  };
};
type TrustchainProgramClient = {
  account: {
    escrow: {
      fetchNullable: (publicKey: PublicKey) => Promise<AnchorEscrowAccount | null>;
      all: (filters: Array<{ memcmp: { offset: number; bytes: string } }>) => Promise<
        Array<{
          publicKey: PublicKey;
          account: AnchorEscrowAccount;
        }>
      >;
    };
    reputation: {
      fetchNullable: (publicKey: PublicKey) => Promise<AnchorReputationAccount | null>;
    };
  };
  methods: {
    initializeEscrow: (jobId: BN, amountLamports: BN, totalMilestones: number) => RpcBuilder;
    approveMilestone: (jobId: BN) => RpcBuilder;
  };
};

const statusTone = (status: EscrowStatus): BadgeTone =>
  status === "Released" ? "success" : status === "Funded" || status === "In Progress" ? "brand" : "neutral";

const sol = (lamports: string | number) =>
  (Number(lamports) / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });

const percent = (released: number, total: number) => {
  if (!total) return 0;
  return Math.min(100, Math.round((released / total) * 100));
};

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  if (
    name === "WalletNotReadyError" ||
    message.includes("WalletNotReady") ||
    message.toLowerCase().includes("wallet not ready")
  ) {
    return "Wallet extension is still initializing. Wait a second, refresh if needed, then connect Phantom.";
  }
  if (message.includes("429") || message.toLowerCase().includes("too many requests")) {
    return "Solana public Devnet faucet is rate limited right now. Wait a few minutes, use the official Solana faucet, or set NEXT_PUBLIC_SOLANA_RPC_URL to a private Devnet RPC endpoint.";
  }
  if (message.toLowerCase().includes("program that does not exist")) {
    return `TrustChain program is not deployed on Devnet at ${TRUSTCHAIN_PROGRAM_ID.toBase58()}. Deploy the Anchor program first, then update the frontend program id and IDL.`;
  }

  return message;
}

function readStatus(status: AnchorEscrowStatus | undefined): EscrowStatus {
  if (!status) return "Unknown";
  if ("funded" in status) return "Funded";
  if ("inProgress" in status) return "In Progress";
  if ("released" in status) return "Released";
  return "Unknown";
}

function mapEscrow(publicKey: PublicKey, account: AnchorEscrowAccount, role?: EscrowListItem["role"]): EscrowView | EscrowListItem {
  const view: EscrowView = {
    escrowKey: publicKey.toBase58(),
    client: account.client.toBase58(),
    freelancer: account.freelancer.toBase58(),
    jobId: account.jobId.toString(),
    amountLamports: account.amountLamports.toString(),
    amountReleasedLamports: account.amountReleasedLamports?.toString() ?? "0",
    totalMilestones: Number(account.totalMilestones ?? 1),
    releasedMilestones: Number(account.releasedMilestones ?? 0),
    status: readStatus(account.status),
  };

  return role ? { ...view, role } : view;
}

function Stat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 text-white">
      <div className="text-xs font-medium text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{helper}</div>
    </div>
  );
}

function ProgressBar({ released, total }: { released: number; total: number }) {
  const width = percent(released, total);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span>
          {released} of {total} milestones
        </span>
        <span>{width}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function KeyLink({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs">
      <span className="font-medium text-zinc-500">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <a
          className="truncate font-mono text-zinc-800 underline underline-offset-4"
          href={solscanAccountUrl(value)}
          target="_blank"
          rel="noreferrer"
        >
          {shortKey(value, 6, 6)}
        </a>
        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(value).catch(() => {})}>
          Copy
        </Button>
      </div>
    </div>
  );
}

/**
 * Direct Phantom connect — avoids WalletMultiButton + WalletModalProvider, which often breaks
 * under Next.js/Turbopack (modal context / chunk issues). Single-wallet flow: select → connect.
 */
function ClientWalletButton() {
  const { wallets, wallet, connected, connecting, connect, disconnect, select, publicKey } = useWallet();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const phantomEntry = useMemo(
    () => wallets.find((w) => w.adapter.name === "Phantom"),
    [wallets],
  );

  const handleConnect = useCallback(async () => {
    setLocalError(null);
    if (!phantomEntry) {
      setLocalError("Phantom adapter is missing from the wallet list.");
      return;
    }

    const { adapter } = phantomEntry;

    if (adapter.readyState === WalletReadyState.NotDetected) {
      window.open("https://phantom.app/download", "_blank", "noopener,noreferrer");
      setLocalError("Install Phantom for your browser, refresh this page, then tap Connect again.");
      return;
    }

    try {
      if (!wallet || wallet.adapter.name !== adapter.name) {
        await select(adapter.name);
      }
      await connect();
    } catch (e) {
      setLocalError(readableError(e));
    }
  }, [phantomEntry, wallet, select, connect]);

  if (!mounted) {
    return (
      <button type="button" disabled className="wallet-adapter-button wallet-adapter-button-trigger">
        Connect Phantom
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger"
        onClick={() => void disconnect()}
      >
        Disconnect
      </button>
    );
  }

  return (
    <div className="flex max-w-xs flex-col gap-1">
      <button
        type="button"
        disabled={connecting || !phantomEntry}
        className="wallet-adapter-button wallet-adapter-button-trigger"
        onClick={() => void handleConnect()}
      >
        {connecting ? "Connecting…" : "Connect Phantom"}
      </button>
      {localError ? <p className="text-xs leading-snug text-red-300">{localError}</p> : null}
    </div>
  );
}

export function Dashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const rpcHost = useMemo(() => {
    try {
      return new URL(connection.rpcEndpoint).host;
    } catch {
      return "devnet";
    }
  }, [connection.rpcEndpoint]);

  const [tab, setTab] = useState<"workbench" | "my-escrows">("workbench");
  const [freelancerAddress, setFreelancerAddress] = useState("");
  const [jobId, setJobId] = useState("1");
  const [amountSol, setAmountSol] = useState("0.25");
  const [totalMilestones, setTotalMilestones] = useState("3");

  const [isBusy, setIsBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [escrow, setEscrow] = useState<EscrowView | null>(null);
  const [clientRep, setClientRep] = useState<ReputationView | null>(null);
  const [freelancerRep, setFreelancerRep] = useState<ReputationView | null>(null);
  const [myEscrows, setMyEscrows] = useState<EscrowListItem[]>([]);
  const [myEscrowsLoading, setMyEscrowsLoading] = useState(false);
  const [walletBalanceLamports, setWalletBalanceLamports] = useState<number | null>(null);

  const canSend = Boolean(wallet.connected && wallet.publicKey);

  const parsed = useMemo(() => {
    try {
      const freelancer = new PublicKey(freelancerAddress.trim());
      const jobIdBig = BigInt(jobId);
      const amount = Number(amountSol);
      const milestones = Number(totalMilestones);

      if (!Number.isFinite(amount) || amount <= 0) return null;
      if (!Number.isInteger(milestones) || milestones < 1 || milestones > 20) return null;
      if (jobIdBig < BigInt(0)) return null;

      const amountLamports = BigInt(Math.round(amount * LAMPORTS_PER_SOL));
      if (amountLamports <= BigInt(0)) return null;

      return { freelancer, jobIdBig, amountLamports, milestones };
    } catch {
      return null;
    }
  }, [amountSol, freelancerAddress, jobId, totalMilestones]);

  const projectedEscrowKey = useMemo(() => {
    if (!wallet.publicKey || !parsed) return null;

    const [key] = escrowPda({
      client: wallet.publicKey,
      freelancer: parsed.freelancer,
      jobId: parsed.jobIdBig,
    });

    return key.toBase58();
  }, [parsed, wallet.publicKey]);

  const setErr = useCallback((e: unknown) => {
    setError(readableError(e));
  }, []);

  const refreshWalletBalance = useCallback(async () => {
    if (!wallet.publicKey) {
      setWalletBalanceLamports(null);
      return;
    }

    const balance = await connection.getBalance(wallet.publicKey, "confirmed");
    setWalletBalanceLamports(balance);
  }, [connection, wallet.publicKey]);

  const assertProgramDeployed = useCallback(async () => {
    const programAccount = await connection.getAccountInfo(TRUSTCHAIN_PROGRAM_ID, "confirmed");
    if (!programAccount?.executable) {
      throw new Error(`TrustChain program is not deployed on Devnet at ${TRUSTCHAIN_PROGRAM_ID.toBase58()}. Deploy the Anchor program first, then update the frontend program id and IDL.`);
    }
  }, [connection]);

  const refresh = useCallback(async () => {
    setError(null);

    if (!wallet.publicKey || !parsed) return;

    const program = getTrustchainProgram(connection, wallet) as unknown as TrustchainProgramClient;
    const [escrowKey] = escrowPda({
      client: wallet.publicKey,
      freelancer: parsed.freelancer,
      jobId: parsed.jobIdBig,
    });

    const [clientRepKey] = reputationPda(wallet.publicKey);
    const [freelancerRepKey] = reputationPda(parsed.freelancer);

    const escrowAccount = await program.account.escrow.fetchNullable(escrowKey);
    setEscrow(escrowAccount ? (mapEscrow(escrowKey, escrowAccount) as EscrowView) : null);

    const c = await program.account.reputation.fetchNullable(clientRepKey);
    setClientRep(
      c
        ? {
            user: c.user.toBase58(),
            score: c.score.toString(),
            completedJobs: c.completedJobs.toString(),
          }
        : null,
    );

    const f = await program.account.reputation.fetchNullable(freelancerRepKey);
    setFreelancerRep(
      f
        ? {
            user: f.user.toBase58(),
            score: f.score.toString(),
            completedJobs: f.completedJobs.toString(),
          }
        : null,
    );
  }, [connection, parsed, wallet]);

  const airdropOneSol = useCallback(async () => {
    if (!wallet.publicKey) return;
    setError(null);
    setLastTx(null);
    setIsBusy(true);
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      setLastTx(sig);
      await refreshWalletBalance();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setIsBusy(false);
    }
  }, [connection, refreshWalletBalance, wallet.publicKey]);

  const loadMyEscrows = useCallback(async () => {
    if (!wallet.publicKey) return;
    setError(null);
    setMyEscrowsLoading(true);
    try {
      const program = getTrustchainProgram(connection, wallet) as unknown as TrustchainProgramClient;

      const clientFilter = {
        memcmp: { offset: 8, bytes: wallet.publicKey.toBase58() },
      };
      const freelancerFilter = {
        memcmp: { offset: 40, bytes: wallet.publicKey.toBase58() },
      };

      const [asClient, asFreelancer] = await Promise.all([
        program.account.escrow.all([clientFilter]),
        program.account.escrow.all([freelancerFilter]),
      ]);

      const merged = [
        ...asClient.map((r) => mapEscrow(r.publicKey, r.account, "Client") as EscrowListItem),
        ...asFreelancer.map((r) => mapEscrow(r.publicKey, r.account, "Freelancer") as EscrowListItem),
      ];
      const unique = new Map<string, EscrowListItem>();
      for (const e of merged) unique.set(e.escrowKey, e);

      const sorted = [...unique.values()].sort((a, b) => {
        const aj = Number(a.jobId);
        const bj = Number(b.jobId);
        if (Number.isFinite(aj) && Number.isFinite(bj) && aj !== bj) return bj - aj;
        return a.escrowKey.localeCompare(b.escrowKey);
      });

      setMyEscrows(sorted);
    } finally {
      setMyEscrowsLoading(false);
    }
  }, [connection, wallet]);

  const createEscrow = useCallback(async () => {
    setError(null);
    setLastTx(null);

    if (!wallet.publicKey || !parsed) return;

    setIsBusy(true);
    const program = getTrustchainProgram(connection, wallet) as unknown as TrustchainProgramClient;
    const [escrowKey] = escrowPda({
      client: wallet.publicKey,
      freelancer: parsed.freelancer,
      jobId: parsed.jobIdBig,
    });

    try {
      await assertProgramDeployed();
      const sig = await program.methods
        .initializeEscrow(
          new BN(parsed.jobIdBig.toString()),
          new BN(parsed.amountLamports.toString()),
          parsed.milestones,
        )
        .accounts({
          client: wallet.publicKey,
          freelancer: parsed.freelancer,
          escrow: escrowKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setLastTx(sig);
      await refresh();
      await loadMyEscrows();
      await refreshWalletBalance();
    } finally {
      setIsBusy(false);
    }
  }, [assertProgramDeployed, connection, loadMyEscrows, parsed, refresh, refreshWalletBalance, wallet]);

  const approveMilestone = useCallback(async () => {
    setError(null);
    setLastTx(null);

    if (!wallet.publicKey || !parsed) return;

    setIsBusy(true);
    const program = getTrustchainProgram(connection, wallet) as unknown as TrustchainProgramClient;
    const [escrowKey] = escrowPda({
      client: wallet.publicKey,
      freelancer: parsed.freelancer,
      jobId: parsed.jobIdBig,
    });
    const [clientRepKey] = reputationPda(wallet.publicKey);
    const [freelancerRepKey] = reputationPda(parsed.freelancer);

    try {
      await assertProgramDeployed();
      const sig = await program.methods
        .approveMilestone(new BN(parsed.jobIdBig.toString()))
        .accounts({
          client: wallet.publicKey,
          freelancer: parsed.freelancer,
          escrow: escrowKey,
          clientReputation: clientRepKey,
          freelancerReputation: freelancerRepKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setLastTx(sig);
      await refresh();
      await loadMyEscrows();
      await refreshWalletBalance();
    } finally {
      setIsBusy(false);
    }
  }, [assertProgramDeployed, connection, loadMyEscrows, parsed, refresh, refreshWalletBalance, wallet]);

  useEffect(() => {
    if (!wallet.publicKey) return;
    const timer = window.setTimeout(() => {
      loadMyEscrows().catch(() => {});
      refreshWalletBalance().catch(() => {});
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMyEscrows, refreshWalletBalance, wallet.publicKey]);

  const useWalletAsFreelancer = () => {
    if (!wallet.publicKey) return;
    setFreelancerAddress(wallet.publicKey.toBase58());
    setJobId(String(Date.now()).slice(-6));
    setAmountSol("0.25");
    setTotalMilestones("3");
  };

  const hydrateFromEscrow = (item: EscrowListItem) => {
    setFreelancerAddress(item.freelancer);
    setJobId(item.jobId);
    setAmountSol((Number(item.amountLamports) / LAMPORTS_PER_SOL).toString());
    setTotalMilestones(String(item.totalMilestones));
    setTab("workbench");
  };

  const fundedEscrows = myEscrows.filter((e) => e.status !== "Released").length;
  const releasedEscrows = myEscrows.filter((e) => e.status === "Released").length;
  const totalLocked = myEscrows.reduce((sum, e) => {
    if (e.status === "Released") return sum;
    return sum + Number(e.amountLamports) - Number(e.amountReleasedLamports);
  }, 0);

  const nextMilestoneSol =
    escrow && escrow.status !== "Released"
      ? sol(
          escrow.releasedMilestones + 1 === escrow.totalMilestones
            ? Number(escrow.amountLamports) - Number(escrow.amountReleasedLamports)
            : Math.floor(Number(escrow.amountLamports) / escrow.totalMilestones),
        )
      : "0";

  const formIsReady = canSend && parsed && !isBusy;
  const walletBalance = walletBalanceLamports === null ? "--" : `${sol(walletBalanceLamports)} SOL`;

  return (
    <main className="min-h-screen bg-[#f7faf8] text-zinc-950">
      <section className="border-b border-zinc-200 bg-zinc-950 text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">Solana Devnet</Badge>
              <Badge tone="neutral">RPC · {rpcHost}</Badge>
              <Badge>Milestone escrow</Badge>
              <Badge>On-chain reputation</Badge>
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Trustless freelance payments, released one milestone at a time.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
              Create a job, lock SOL in a program-owned escrow PDA, approve completed work, and let the contract release funds while reputation updates on-chain.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ClientWalletButton />
              <Button variant="secondary" disabled={!wallet.publicKey || isBusy} onClick={() => airdropOneSol().catch(setErr)}>
                Airdrop 1 SOL
              </Button>
              {wallet.publicKey ? (
                <a
                  className="font-mono text-xs text-cyan-200 underline underline-offset-4"
                  href={solscanAccountUrl(wallet.publicKey.toBase58())}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortKey(wallet.publicKey.toBase58(), 7, 7)}
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Stat label="Wallet balance" value={walletBalance} helper="Connected Phantom on Devnet" />
            <Stat label="Active escrows" value={String(fundedEscrows)} helper="Funded or in progress" />
            <Stat label="Locked balance" value={`${sol(totalLocked)} SOL`} helper="Across your visible escrows" />
            <Stat label="Completed jobs" value={String(releasedEscrows)} helper="Released on-chain" />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
            <Button
              variant={tab === "workbench" ? "primary" : "ghost"}
              onClick={() => setTab("workbench")}
              className="shadow-none"
            >
              Workbench
            </Button>
            <Button
              variant={tab === "my-escrows" ? "primary" : "ghost"}
              disabled={!wallet.publicKey}
              onClick={() => setTab("my-escrows")}
              className="shadow-none"
            >
              My escrows
            </Button>
          </div>
          <div className="text-xs text-zinc-500">
            {wallet.connected ? "Connected to Devnet through Phantom." : "Connect Phantom to create and release escrows."}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            {tab === "workbench" ? (
              <Card>
                <CardHeader
                  title="Create and manage a contract"
                  subtitle="The client signs every funding and milestone approval transaction."
                  right={canSend ? <Badge tone="success">Wallet ready</Badge> : <Badge tone="warning">Wallet required</Badge>}
                />

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="md:col-span-2">
                    <div className="text-xs font-semibold text-zinc-600">Freelancer wallet</div>
                    <div className="mt-2">
                      <Input
                        value={freelancerAddress}
                        onChange={setFreelancerAddress}
                        placeholder="Freelancer public key (base58)"
                      />
                    </div>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-zinc-600">Job ID</div>
                    <div className="mt-2">
                      <Input value={jobId} onChange={setJobId} inputMode="numeric" />
                    </div>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-zinc-600">Total amount (SOL)</div>
                    <div className="mt-2">
                      <Input value={amountSol} onChange={setAmountSol} inputMode="decimal" />
                    </div>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-zinc-600">Milestones</div>
                    <div className="mt-2">
                      <Input value={totalMilestones} onChange={setTotalMilestones} inputMode="numeric" />
                    </div>
                  </label>

                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-xs font-semibold text-zinc-500">Next milestone release</div>
                    <div className="mt-2 text-2xl font-semibold">{escrow ? `${nextMilestoneSol} SOL` : "Pending"}</div>
                    <p className="mt-1 text-xs text-zinc-500">Final milestone includes any lamport remainder.</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button disabled={!formIsReady} onClick={() => createEscrow().catch(setErr)}>
                    Lock funds
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!formIsReady || !escrow || escrow.status === "Released"}
                    onClick={() => approveMilestone().catch(setErr)}
                  >
                    Approve next milestone
                  </Button>
                  <Button variant="secondary" disabled={!formIsReady} onClick={() => refresh().catch(setErr)}>
                    Refresh
                  </Button>
                  <Button variant="ghost" disabled={!wallet.publicKey || isBusy} onClick={useWalletAsFreelancer}>
                    Use demo values
                  </Button>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-500">Validation</div>
                    <div className="mt-1 text-sm font-medium">{parsed ? "Ready to sign" : "Check form inputs"}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-500">Program account</div>
                    <div className="mt-1 truncate font-mono text-xs">{projectedEscrowKey ? shortKey(projectedEscrowKey, 8, 8) : "Derived after valid inputs"}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-500">Network</div>
                    <div className="mt-1 text-sm font-medium">Devnet confirmed</div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader
                  title="My escrows"
                  subtitle="Contracts where the connected wallet is client or freelancer."
                  right={
                    <Button
                      variant="secondary"
                      disabled={!wallet.publicKey || myEscrowsLoading}
                      onClick={() => loadMyEscrows().catch(setErr)}
                    >
                      Refresh list
                    </Button>
                  }
                />

                <div className="mt-5">
                  {myEscrowsLoading ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">Loading escrows...</div>
                  ) : myEscrows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6">
                      <div className="text-sm font-semibold">No escrows found</div>
                      <p className="mt-1 text-sm text-zinc-600">Create a contract from the workbench to populate your on-chain history.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {myEscrows.map((item) => (
                        <article key={item.escrowKey} className="rounded-lg border border-zinc-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                                <Badge>{item.role}</Badge>
                                <span className="text-sm font-semibold">Job #{item.jobId}</span>
                              </div>
                              <div className="mt-2 text-xs text-zinc-500">
                                {sol(item.amountReleasedLamports)} of {sol(item.amountLamports)} SOL released
                              </div>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => hydrateFromEscrow(item)}>
                              Manage
                            </Button>
                          </div>

                          <div className="mt-4">
                            <ProgressBar released={item.releasedMilestones} total={item.totalMilestones} />
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                            <KeyLink label="Escrow" value={item.escrowKey} />
                            <KeyLink label="Client" value={item.client} />
                            <KeyLink label="Freelancer" value={item.freelancer} />
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {lastTx ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wide">Transaction confirmed</div>
                  <a className="text-xs font-medium underline underline-offset-4" href={solscanTxUrl(lastTx)} target="_blank" rel="noreferrer">
                    View on Solscan
                  </a>
                </div>
                <div className="mt-2 break-all font-mono text-xs">{lastTx}</div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wide">Error</div>
                  {error.includes("rate limited") ? (
                    <a
                      className="text-xs font-semibold underline underline-offset-4"
                      href="https://faucet.solana.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Solana faucet
                    </a>
                  ) : null}
                </div>
                <div className="mt-1 break-words font-mono text-xs">{error}</div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader
                title="Current contract"
                subtitle="Derived from the form values."
                right={escrow ? <Badge tone={statusTone(escrow.status)}>{escrow.status}</Badge> : null}
              />
              <div className="mt-4 space-y-4">
                {!escrow ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-5">
                    <div className="text-sm font-semibold">No contract loaded</div>
                    <p className="mt-1 text-sm text-zinc-600">Enter a freelancer and job ID, then refresh or create a contract.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-xs font-semibold text-zinc-500">Escrowed</div>
                        <div className="mt-1 text-lg font-semibold">{sol(escrow.amountLamports)} SOL</div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-xs font-semibold text-zinc-500">Released</div>
                        <div className="mt-1 text-lg font-semibold">{sol(escrow.amountReleasedLamports)} SOL</div>
                      </div>
                    </div>
                    <ProgressBar released={escrow.releasedMilestones} total={escrow.totalMilestones} />
                    <KeyLink label="Escrow PDA" value={escrow.escrowKey} />
                    <KeyLink label="Freelancer" value={escrow.freelancer} />
                  </>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Reputation" subtitle="Score updates after final milestone." />
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-600">Client</div>
                    {clientRep ? <Badge tone="success">Active</Badge> : <Badge>Not created</Badge>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Score</div>
                      <div className="font-semibold">{clientRep ? clientRep.score : "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Jobs</div>
                      <div className="font-semibold">{clientRep ? clientRep.completedJobs : "-"}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-600">Freelancer</div>
                    {freelancerRep ? <Badge tone="success">Active</Badge> : <Badge>Not created</Badge>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Score</div>
                      <div className="font-semibold">{freelancerRep ? freelancerRep.score : "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Jobs</div>
                      <div className="font-semibold">{freelancerRep ? freelancerRep.completedJobs : "-"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}
