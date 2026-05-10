# TrustChain Lite

TrustChain Lite is a lightweight, hackathon-friendly **decentralized freelancer escrow + reputation** dApp on **Solana Devnet**.

## Repo layout

- `anchor/`: Solana program (Rust + Anchor) that holds escrow funds and stores reputation on-chain
- `frontend/`: Next.js (TypeScript + Tailwind) web dashboard that connects Phantom and calls the program

## Prerequisites

- Node.js 18+ (you have Node already)
- Solana CLI
- Anchor (to build/deploy the program)

## 1) Build + deploy the Solana program (Devnet)

**Program ID (submission / explorers):** `3AJ7pp8SVW91iFYhB5LgctFrsgaeGKVX3qRVsN48922M` — already set in `lib.rs`, `Anchor.toml`, and the frontend.

Install [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) and [Anchor](https://www.anchor-lang.com/docs/installation), then from `anchor/`:

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor build
anchor deploy
```

After `anchor build`, sync the IDL into the app:

- `anchor/target/idl/trustchain_lite.json` → `frontend/src/idl/trustchain_lite.json`

The deploy keypair is under `anchor/target/deploy/` (gitignored). If you clone without `target/`, generate a new program keypair and update the program id in `lib.rs`, `Anchor.toml`, and `frontend/src/lib/solana/constants.ts`.

## 2) Run the frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, connect Phantom, and:

- create an escrow (locks SOL into the escrow PDA)
- approve & release (pays freelancer + updates both reputation PDAs)

