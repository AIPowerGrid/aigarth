# AIPG staking status

The passive StakingVault rewards program has ended. New stakes are disabled and
rewards no longer accrue. Existing stakers can withdraw their AIPG and claim any
rewards earned before the program ended; there is no published withdrawal
deadline or lockup.

Use `https://aipowergrid.io/staking` for the withdrawal interface. The deployed
StakingVault remains on Base at:
`0x3ED14A6D5A48614D77f313389611410d38fd8277`.

The project is shifting rewards toward active network work: GPU workers are live,
while validator rewards and validator staking are not live. Worker bonding is
also not currently required.

Do not quote an APY, minimum new stake, active reward rate, or claim that passive
rewards continue. For a contract-level withdrawal, users should verify the
address on BaseScan and use the documented `withdraw`, `getReward`, or `exit`
functions with care.
