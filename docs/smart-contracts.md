# AI Power Grid contracts on Base

The canonical network is Base mainnet, chain ID 8453.

## Core addresses

- AIPG token: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608`
- StakingVault: `0x3ED14A6D5A48614D77f313389611410d38fd8277`
- Grid diamond: `0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609`

The Grid diamond currently exposes module implementations for ownership and
roles, ModelVault, RecipeVault, JobAnchor, WorkerRegistry, RewardPool,
DenReporter, and PaymentRouter. Calls use the diamond proxy address; facet
implementation addresses are not standalone user entry points.

## Status distinctions

- Model/recipe registry and current Grid modules are deployed infrastructure.
- RewardPool, DenReporter, and PaymentRouter are deployed, but the Merkle claim
  publisher/worker claim rail is not the live payout process.
- The passive staking product has ended even though StakingVault remains
  deployed for withdrawals and old claims.
- GridNFT is not in the current mainnet deployment inventory.
- The upgraded worker bonding/slashing path is not a current requirement.

For implementation addresses and the latest read-only verification date, use
`aipg-smart-contracts/docs/ADDRESSES.md` and verify the diamond loupe on Base.
Never infer operational product status from code or deployment alone.
