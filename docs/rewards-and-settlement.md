# Worker rewards and settlement

## What is live

Grid core records one append-only ledger row per terminal worker job. Work is
measured as **den**, based on server-observed useful output and model policy.
The live bootstrap payout process runs on a schedule, groups den by earning
account, splits a fixed AIPG period budget pro-rata, and sends AIPG from a
dedicated hot wallet to each account's configured Base payout wallet.

The sender is designed to be idempotent and nonce-bound. A payout is marked sent
only after a successful receipt contains the expected ERC-20 Transfer. Unproven
or ambiguous transfers go to manual review. Public payout rows and BaseScan links
are available at `https://console.aipowergrid.io/transparency`.

## What is built but dark

The multi-asset pass-through design can distribute a revenue basket such as
USDC, ETH, and AIPG without conversion. It is gated on live charging, funded
treasury balances, and operational rollout. Do not tell workers it is their
current payout rail.

## What is deployed but not operational

RewardPool, DenReporter, and PaymentRouter facets are deployed behind the Grid
diamond on Base. They support a future Merkle-root claim flow. The core publisher
and worker claim operation are not live; current workers are paid by the
custodial bootstrap sender.

## Worker setup

Workers authenticate with an account API key. The operator configures a Base
payout wallet in the console. The payout wallet can differ from the login wallet;
it is a payment destination, not proof of worker ownership.

Rates, period budgets, asset mix, and den multipliers can change. Use live
console/transparency data rather than static earnings estimates.
