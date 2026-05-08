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

From `anchor/`:

```bash
solana config set --url https://api.devnet.solana.com
anchor build
anchor deploy
```

After deploy, update **all 3** of these to the deployed program id:

- `anchor/programs/trustchain_lite/src/lib.rs` (`declare_id!(...)`)
- `anchor/Anchor.toml` (`[programs.devnet].trustchain_lite`)
- `frontend/src/lib/solana/constants.ts` (`TRUSTCHAIN_PROGRAM_ID`)

Then copy the generated IDL:

- `anchor/target/idl/trustchain_lite.json` → `frontend/src/idl/trustchain_lite.json`

## 2) Run the frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, connect Phantom, and:

- create an escrow (locks SOL into the escrow PDA)
- approve & release (pays freelancer + updates both reputation PDAs)

