"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { escrowPda, reputationPda } from "@/lib/solana/pdas";
import { getTrustchainProgram } from "@/lib/solana/program";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { copyToClipboard, shortKey, solscanAccountUrl, solscanTxUrl } from "@/lib/ui/utils";

type EscrowView = {
  escrowKey: string;
  client: string;
  freelancer: string;
  jobId: string;
  amountLamports: string;
  status: "Funded" | "Released" | "Unknown";
};

type ReputationView = {
  user: string;
  score: string;
  completedJobs: string;
};

type EscrowListItem = EscrowView & {
  role: "Client" | "Freelancer";
};

export function Dashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [tab, setTab] = useState<"create" | "my-escrows">("create");
  const [freelancerAddress, setFreelancerAddress] = useState("");
  const [jobId, setJobId] = useState("1");
  const [amountSol, setAmountSol] = useState("0.1");

  const [isBusy, setIsBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [escrow, setEscrow] = useState<EscrowView | null>(null);
  const [clientRep, setClientRep] = useState<ReputationView | null>(null);
  const [freelancerRep, setFreelancerRep] = useState<ReputationView | null>(null);
  const [myEscrows, setMyEscrows] = useState<EscrowListItem[]>([]);
  const [myEscrowsLoading, setMyEscrowsLoading] = useState(false);

  const canSend = wallet.connected && wallet.publicKey;

  const parsed = useMemo(() => {
    try {
      const freelancer = new PublicKey(freelancerAddress);
      const jobIdBig = BigInt(jobId);
      const amountLamports = BigInt(Math.round(Number(amountSol) * LAMPORTS_PER_SOL));
      return { freelancer, jobIdBig, amountLamports };
    } catch {
      return null;
    }
  }, [freelancerAddress, jobId, amountSol]);

  const setErr = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    setLastTx(null);

    if (!wallet.publicKey || !parsed) return;

    const program = getTrustchainProgram(connection, wallet) as any;
    const [escrowKey] = escrowPda({
      client: wallet.publicKey,
      freelancer: parsed.freelancer,
      jobId: parsed.jobIdBig,
    });

    const [clientRepKey] = reputationPda(wallet.publicKey);
    const [freelancerRepKey] = reputationPda(parsed.freelancer);

    const escrowAccount = await program.account.escrow.fetchNullable(escrowKey);
    if (!escrowAccount) {
      setEscrow(null);
    } else {
      const status =
        "funded" in escrowAccount.status
          ? "Funded"
          : "released" in escrowAccount.status
            ? "Released"
            : "Unknown";

      setEscrow({
        escrowKey: escrowKey.toBase58(),
        client: escrowAccount.client.toBase58(),
        freelancer: escrowAccount.freelancer.toBase58(),
        jobId: escrowAccount.jobId.toString(),
        amountLamports: escrowAccount.amountLamports.toString(),
        status,
      });
    }

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
    } finally {
      setIsBusy(false);
    }
  }, [connection, wallet.publicKey]);

  const createEscrow = useCallback(async () => {
    setError(null);
    setLastTx(null);

    if (!wallet.publicKey || !parsed) return;

    setIsBusy(true);
    const program = getTrustchainProgram(connection, wallet) as any;
    const [escrowKey] = escrowPda({
      client: wallet.publicKey,
      freelancer: parsed.freelancer,
      jobId: parsed.jobIdBig,
    });

    try {
      const sig = await program.methods
        .initializeEscrow(
          new BN(parsed.jobIdBig.toString()),
          new BN(parsed.amountLamports.toString()),
        )
        .accounts({
          client: wallet.publicKey,
          freelancer: parsed.freelancer,
          escrow: escrowKey,
        })
        .rpc();

      setLastTx(sig);
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [connection, parsed, refresh, wallet]);

  const approveAndRelease = useCallback(async () => {
    setError(null);
    setLastTx(null);

    if (!wallet.publicKey || !parsed) return;

    setIsBusy(true);
    const program = getTrustchainProgram(connection, wallet) as any;
    const [escrowKey] = escrowPda({
      client: wallet.publicKey,
      freelancer: parsed.freelancer,
      jobId: parsed.jobIdBig,
    });
    const [clientRepKey] = reputationPda(wallet.publicKey);
    const [freelancerRepKey] = reputationPda(parsed.freelancer);

    try {
      const sig = await program.methods
        .approveAndRelease(new BN(parsed.jobIdBig.toString()))
        .accounts({
          client: wallet.publicKey,
          freelancer: parsed.freelancer,
          escrow: escrowKey,
          clientReputation: clientRepKey,
          freelancerReputation: freelancerRepKey,
        })
        .rpc();

      setLastTx(sig);
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [connection, parsed, refresh, wallet]);

  const loadMyEscrows = useCallback(async () => {
    if (!wallet.publicKey) return;
    setError(null);
    setLastTx(null);
    setMyEscrowsLoading(true);
    try {
      const program = getTrustchainProgram(connection, wallet) as any;

      // Account layout (after 8-byte discriminator):
      // client: 32 bytes @ offset 8
      // freelancer: 32 bytes @ offset 40
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

      const mapItem = (role: "Client" | "Freelancer") => (r: any): EscrowListItem => {
        const status =
          "funded" in r.account.status
            ? "Funded"
            : "released" in r.account.status
              ? "Released"
              : "Unknown";

        return {
          role,
          escrowKey: r.publicKey.toBase58(),
          client: r.account.client.toBase58(),
          freelancer: r.account.freelancer.toBase58(),
          jobId: r.account.jobId.toString(),
          amountLamports: r.account.amountLamports.toString(),
          status,
        };
      };

      const merged = [...asClient.map(mapItem("Client")), ...asFreelancer.map(mapItem("Freelancer"))];
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

  useEffect(() => {
    if (!wallet.publicKey) {
      setMyEscrows([]);
      setEscrow(null);
      setClientRep(null);
      setFreelancerRep(null);
      return;
    }
    // Prime the UI once connected.
    loadMyEscrows().catch(() => {});
  }, [loadMyEscrows, wallet.publicKey]);

  const statusTone = (s: EscrowView["status"]) =>
    s === "Released" ? "success" : s === "Funded" ? "brand" : "neutral";

  const errorBox = error ? (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
      <div className="text-xs font-semibold uppercase tracking-wide">Error</div>
      <div className="mt-1 break-words font-mono text-xs">{error}</div>
    </div>
  ) : null;

  const txBox = lastTx ? (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide">Last transaction</div>
        <a
          className="text-xs font-medium underline underline-offset-4"
          href={solscanTxUrl(lastTx)}
          target="_blank"
          rel="noreferrer"
        >
          View on Solscan
        </a>
      </div>
      <div className="mt-2 break-all font-mono text-xs">{lastTx}</div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white text-zinc-900">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="brand">Devnet</Badge>
              <Badge>Escrow</Badge>
              <Badge>Reputation</Badge>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              TrustChain Lite
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              Lock SOL into an on-chain escrow, approve delivery, auto-release payment, and update
              wallet-based reputation—no backend required.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
            {wallet.publicKey ? (
              <div className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur">
                <div className="text-xs font-semibold text-zinc-600">Wallet</div>
                <div className="mt-1 flex items-center gap-2">
                  <a
                    className="font-mono text-xs underline underline-offset-4"
                    href={solscanAccountUrl(wallet.publicKey.toBase58())}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortKey(wallet.publicKey.toBase58(), 6, 6)}
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copyToClipboard(wallet.publicKey!.toBase58()).catch(() => {})
                    }
                  >
                    Copy
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={!wallet.publicKey || isBusy}
                onClick={() => airdropOneSol().catch(setErr)}
              >
                Airdrop 1 SOL
              </Button>
              <WalletMultiButton />
            </div>
          </div>
        </header>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Button
            variant={tab === "create" ? "primary" : "secondary"}
            onClick={() => setTab("create")}
          >
            Create / Manage
          </Button>
          <Button
            variant={tab === "my-escrows" ? "primary" : "secondary"}
            onClick={() => setTab("my-escrows")}
            disabled={!wallet.publicKey}
          >
            My escrows
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {tab === "create" ? (
              <Card>
                <CardHeader
                  title="Create escrow"
                  subtitle="Client locks funds into a program-owned PDA."
                  right={
                    canSend ? (
                      <Badge tone="success">Wallet connected</Badge>
                    ) : (
                      <Badge tone="warning">Connect wallet</Badge>
                    )
                  }
                />

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    <div className="text-xs font-semibold text-zinc-600">Amount (SOL)</div>
                    <div className="mt-2">
                      <Input value={amountSol} onChange={setAmountSol} inputMode="decimal" />
                    </div>
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    disabled={!canSend || !parsed || isBusy}
                    onClick={() => createEscrow().catch(setErr)}
                  >
                    Lock funds
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!canSend || !parsed || isBusy}
                    onClick={() => approveAndRelease().catch(setErr)}
                  >
                    Approve & release
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!canSend || !parsed || isBusy}
                    onClick={() => refresh().catch(setErr)}
                  >
                    Refresh
                  </Button>
                </div>

                {wallet.connected ? null : (
                  <p className="mt-4 text-xs text-zinc-500">
                    Connect Phantom first. For Devnet you can use the built-in airdrop button.
                  </p>
                )}
              </Card>
            ) : (
              <Card>
                <CardHeader
                  title="My escrows"
                  subtitle="Escrows where you are the client or the freelancer."
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
                    <p className="text-sm text-zinc-600">Loading escrows…</p>
                  ) : myEscrows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6">
                      <div className="text-sm font-semibold">No escrows yet</div>
                      <p className="mt-1 text-sm text-zinc-600">
                        Create one in the “Create / Manage” tab to see it here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myEscrows.map((e) => (
                        <div
                          key={e.escrowKey}
                          className="rounded-2xl border border-zinc-200 bg-white p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Badge tone={statusTone(e.status) as any}>{e.status}</Badge>
                              <Badge>{e.role}</Badge>
                              <span className="text-sm font-semibold">Job #{e.jobId}</span>
                            </div>
                            <div className="text-sm font-semibold">
                              {(Number(e.amountLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 text-xs text-zinc-600">
                            <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                              <span>Escrow</span>
                              <div className="flex items-center gap-2">
                                <a
                                  className="font-mono underline underline-offset-4"
                                  href={solscanAccountUrl(e.escrowKey)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {shortKey(e.escrowKey, 6, 6)}
                                </a>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(e.escrowKey).catch(() => {})}
                                >
                                  Copy
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                              <span>Freelancer</span>
                              <div className="flex items-center gap-2">
                                <a
                                  className="font-mono underline underline-offset-4"
                                  href={solscanAccountUrl(e.freelancer)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {shortKey(e.freelancer, 6, 6)}
                                </a>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(e.freelancer).catch(() => {})}
                                >
                                  Copy
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {txBox}
            {errorBox}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Current contract"
                subtitle="Derived from the inputs on the left."
                right={
                  escrow ? <Badge tone={statusTone(escrow.status) as any}>{escrow.status}</Badge> : null
                }
              />

              <div className="mt-4 space-y-3 text-sm">
                {!escrow ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6">
                    <div className="text-sm font-semibold">No escrow loaded</div>
                    <p className="mt-1 text-sm text-zinc-600">
                      Enter a freelancer + job id, then click Refresh.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2">
                      <span className="text-xs font-semibold text-zinc-600">Amount</span>
                      <span className="font-semibold">
                        {(Number(escrow.amountLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2">
                      <span className="text-xs font-semibold text-zinc-600">Escrow PDA</span>
                      <div className="flex items-center gap-2">
                        <a
                          className="font-mono text-xs underline underline-offset-4"
                          href={solscanAccountUrl(escrow.escrowKey)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortKey(escrow.escrowKey, 6, 6)}
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(escrow.escrowKey).catch(() => {})}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Reputation" subtitle="On-chain score updates on release." />
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-600">Client</div>
                    {clientRep ? <Badge tone="success">Active</Badge> : <Badge>Not created</Badge>}
                  </div>
                  <div className="mt-2 text-sm">
                    Score{" "}
                    <span className="font-semibold">{clientRep ? clientRep.score : "—"}</span> • Jobs{" "}
                    <span className="font-semibold">
                      {clientRep ? clientRep.completedJobs : "—"}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-600">Freelancer</div>
                    {freelancerRep ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge>Not created</Badge>
                    )}
                  </div>
                  <div className="mt-2 text-sm">
                    Score{" "}
                    <span className="font-semibold">
                      {freelancerRep ? freelancerRep.score : "—"}
                    </span>{" "}
                    • Jobs{" "}
                    <span className="font-semibold">
                      {freelancerRep ? freelancerRep.completedJobs : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <footer className="mt-10 text-xs text-zinc-500">
          Tip: if an escrow doesn’t show up immediately, click Refresh or wait a confirmation on
          Devnet.
        </footer>
      </div>
    </div>
  );
}

