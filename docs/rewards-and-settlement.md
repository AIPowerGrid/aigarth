# Worker rewards & on-chain settlement

How AIPG workers get paid for the inference they serve. This is live on Base
mainnet (the Grid diamond proxy at `0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609`).

## Den (work credit)

Every completed job earns **den** — a work-credit score based on output produced
(tokens / image steps), weighted by the model's size multiplier (bigger models
earn more per unit). The model multiplier is sourced on-chain (ModelVault) so
it's transparent and can't be gamed by lying about a model name. Den is recorded
in an append-only ledger, one entry per job.

## Settlement (ledger → Merkle → payout)

On a schedule, a settlement bot:
1. aggregates each worker's den for the period from the ledger,
2. builds a Merkle tree of `(wallet, den)` and pins the full list to IPFS,
3. posts the root on-chain (`DenReporter.reportPeriod`),
4. pays everyone via `PaymentRouter.claimBatch` — each worker's payout =
   `workerDen / totalDen × periodAllocation`, pulled from the reward pool.

Workers don't need to do anything to get paid — the bot settles for everyone.
Payout always goes to the wallet in the ledger leaf.

## Reward pool

A **RewardPool** holds AIPG that funds payouts. It's funded by the team (and, in
future, by usage fees). The **per-period allocation** sets how much AIPG is
released each period; pool balance and the rate are decoupled so the pool can be
pre-funded and drip out. As of go-live the pool is funded and a daily allocation
is set.

## Getting paid (worker operators)

Connect a wallet once (SIWE) to get an account + API key, then run your worker
with just that API key — no private key ever goes on the rig. Earnings accrue to
your account's wallet and are paid out automatically each period.

## Bonding & slashing (trust)

Workers can bond AIPG as collateral. Misbehavior (forged result receipts,
repeated bad output) can be **slashed**. Unbonding has a cooldown so a worker
can't pull its bond to dodge a slash; slashed funds are redistributed to honest
workers via the reward pool. Detection feeds an evidence queue an operator
reviews — slashing is deliberate, never automatic from the hot path.
