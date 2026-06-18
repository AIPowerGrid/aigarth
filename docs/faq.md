# Frequently Asked Questions (FAQ)

## General Questions

### What is AI Power Grid (AIPG)?

AI Power Grid is a decentralized physical infrastructure network (DePIN) that transforms idle GPUs into a permissionless, censorship-resistant AI utility. It provides an open-source alternative to corporate AI gatekeepers, allowing anyone to access powerful AI models or earn tokens by providing compute.

### When was AIPG launched?

AIPG launched on December 10, 2023, with a fair launch model - no venture capital, no pre-mine, and no pre-sales. The project migrated to Base network on November 1, 2025.

### What makes AIPG different from other AI crypto projects?

- **Actual Working Product**: Live AI inference network, not just promises
- **Fair Launch**: No VC dumps or insider allocations
- **Useful Compute**: GPU cycles serve real AI workloads, not wasteful mining
- **Capped Supply**: 150M max, minting permanently disabled
- **Base Network**: Low fees, fast transactions, Coinbase integration
- **Open Source**: All code, models, and infrastructure transparent

### Is AIPG a good investment?

We cannot provide financial advice. AIPG is a utility token designed for paying for AI services and rewarding compute providers. Like all cryptocurrencies, it carries risk. Always do your own research (DYOR) and never invest more than you can afford to lose.

## Token Questions

### What blockchain is AIPG on?

AIPG is now on Base network (Coinbase's Layer 2), an Ethereum L2 built on the OP Stack. The original Proof-of-Work blockchain has been deprecated in favor of Base.

**Contract Address**: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608`

### What is the total supply?

- **Max Supply**: 150,000,000 AIPG (capped, cannot be increased)
- **Circulating Supply**: ~64,100,000 AIPG
- **Minting Status**: Permanently disabled (minting role renounced)

### Can more AIPG be minted?

No. The minting capability has been permanently disabled by renouncing the MINTER_ROLE. The max supply of 150M AIPG is immutable and cannot be changed.

### Where can I buy AIPG?

**Uniswap V3 on Base**: https://app.uniswap.org/swap?outputCurrency=0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608&chain=base

You'll need:
1. ETH on Base network for gas fees
2. USDC or other tokens to swap for AIPG
3. A Web3 wallet (MetaMask, Coinbase Wallet, etc.)

### Where can I check the price?

- **Uniswap**: Real-time trading price
- **BaseScan**: Token holder stats and transfers
- **CoinGecko**: Coming soon
- **CoinMarketCap**: Coming soon

### How do I add AIPG to my wallet?

**Network**: Base (Chain ID: 8453)
**Contract**: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608`
**Symbol**: AIPG
**Decimals**: 18

Most wallets will auto-detect the token. If not, manually add using the contract address above.

## Staking Questions

### How do I stake AIPG?

1. Visit https://aipowergrid.io/staking
2. Connect your wallet (MetaMask, Coinbase Wallet, Ledger, etc.)
3. Approve the staking contract to spend your AIPG
4. Enter amount to stake (minimum 100 AIPG)
5. Confirm the transaction
6. Start earning rewards immediately!

### What is the minimum stake?

100 AIPG minimum to prevent spam and ensure meaningful participation.

### Is there a lockup period?

No! You can unstake your AIPG anytime with no penalties or waiting periods. Your tokens are never locked.

### How are staking rewards calculated?

Rewards accrue every second based on your share of the total staked pool:

```
Your Rewards = (Your Stake / Total Staked) × Total Reward Pool
```

The more AIPG staked globally, the more stable the APY becomes.

### What's the current staking APY?

APY is dynamic and changes based on:
- Total value locked (TVL)
- Reward funding amount
- Reward distribution duration

Check https://aipowergrid.io/staking for real-time APY.

### How often should I claim rewards?

You can claim anytime! Rewards continue accruing whether you claim daily, weekly, or let them accumulate. Consider gas fees (~$0.01) vs reward amount when deciding.

### Can I lose my staked tokens?

No. Your staked AIPG is always yours and can be withdrawn at any time. The contract is non-custodial, verified on BaseScan, and built with OpenZeppelin security standards.

### What is compounding?

Compounding means claiming your rewards and immediately restaking them. This increases your staked balance, allowing you to earn rewards on your rewards. The staking interface has a "Compound" button that does this in one click (two transactions).

## AI Worker Questions

### How do I become an AI worker?

Requirements:
- NVIDIA GPU (RTX 3060 or better recommended)
- 16GB+ RAM
- 100GB+ storage
- Stable internet (10+ Mbps upload)
- Linux or Windows OS

Setup:
1. Download worker software from GitHub
2. Configure settings
3. Download AI models
4. Register with network
5. Start earning AIPG!

### How much can I earn as a worker?

Earnings vary based on:
- GPU power (faster GPUs earn more)
- Uptime (24/7 operation maximizes earnings)
- Model popularity (popular models get more requests)
- Network demand

Example estimates:
- RTX 3060: 100-500 AIPG/day
- RTX 4090: 500-2000 AIPG/day
- Data center GPU: 1000-5000 AIPG/day

*Actual earnings vary based on network conditions*

### What AI models can I run?

- **LLMs**: Llama 2/3, Mistral, Mixtral, Falcon, and more
- **Image Generation**: Stable Diffusion (1.5, SDXL), custom checkpoints
- **Future**: Multi-modal, audio, video, specialized models

### Do I need specialized hardware?

No! Unlike traditional crypto mining, you don't need ASICs. Any modern NVIDIA GPU can participate. Even gaming PCs can earn AIPG while idle.

## Bridge and Migration Questions

### I have old AIPG on the PoW chain. How do I migrate?

1. Visit https://webwallet.aipowergrid.io/
2. Access your wallet (seed phrase, private key, or wallet file)
3. Click wallet menu (⋮) → Bridge Request
4. Confirm the transaction
5. Receive AIPG on Base network

### Is there a deadline to migrate?

No deadline is currently set. The bridge will remain open for the foreseeable future.

### My web wallet shows zero balance. What do I do?

If you were an early adopter:
1. Go to Settings → Delete Current Wallet
2. Enable Advanced Mode in Settings
3. Access wallet and enter seed phrase
4. A second box appears - try entering seed phrase again
5. If still zero, try common passwords you may have used

See the full guide: BRIDGE_MIGRATION.md

### Will I lose my tokens if I don't migrate?

No, your tokens remain on the PoW chain. However, you won't be able to stake, trade on DEXs, or participate in the Base ecosystem without migrating.

## Using AIPG Chat

### What is AIPG Chat?

AIPG Chat (https://aipg.chat/) is a user-friendly AI chat interface powered by the distributed AIPG worker network. It's a fork of Open WebUI that provides a ChatGPT-like experience using decentralized AI infrastructure.

### Is AIPG Chat free to use?

Pricing model is being finalized. The service is powered by community worker nodes who earn AIPG for providing inference compute.

### What models are available?

Multiple open-source LLMs including:
- Llama 2 and Llama 3 variants
- Mistral and Mixtral models
- Other open-source models
- More models added regularly

### Is my chat data private?

AIPG Chat runs on decentralized infrastructure. No single entity controls all data. However, as with any AI service, avoid sharing sensitive personal information in prompts.

### Can I use AIPG Chat for commercial purposes?

Check the terms of service. Generally, open-source models allow commercial use, but verify specific model licenses.

## Technical Questions

### What is Base network?

Base is Coinbase's Ethereum Layer 2 network, built on the OP Stack. It offers:
- Low transaction fees (~$0.01)
- Fast transactions (~2 seconds)
- Ethereum security
- Growing DeFi ecosystem
- Coinbase integration

### How do I add Base to my wallet?

**Network Name**: Base
**Chain ID**: 8453
**RPC URL**: https://mainnet.base.org
**Currency**: ETH
**Explorer**: https://basescan.org

Most wallets have Base pre-configured. If not, add manually with the above details.

### Are the smart contracts audited?

Contracts have undergone static analysis with Slither and Mythril. A comprehensive audit package is prepared for professional auditors. All contracts are verified on BaseScan and built with OpenZeppelin standards.

### Is the code open source?

Yes! All code is available on GitHub: https://github.com/halfaipg

This includes:
- Smart contracts
- Worker node software
- Frontend applications
- Documentation
- Integration examples

### What wallets are supported?

- MetaMask
- Coinbase Wallet
- Ledger hardware wallet
- WalletConnect (mobile wallets)
- Rainbow Wallet
- Trust Wallet
- Any Web3-compatible wallet

## Security Questions

### Is AIPG safe?

AIPG takes security seriously:
- OpenZeppelin smart contract standards
- Verified contracts on BaseScan
- Hardware wallet for admin operations
- Static analysis and code review
- Open-source for community audit

However, all crypto carries risk. Never invest more than you can afford to lose.

### Can the team mint more tokens?

No. The minting capability has been permanently disabled by renouncing the MINTER_ROLE. This is verifiable on-chain.

### Can the team pause transfers?

Yes, there is an emergency pause function for security incidents. This is a standard safety feature. The pause role is controlled by a Ledger hardware wallet.

### What if I lose my private key?

Unfortunately, there's no way to recover lost private keys. Always:
- Keep secure backups of seed phrases
- Use hardware wallets for large amounts
- Never share private keys with anyone
- Store backups in multiple secure locations

### How do I report a security issue?

- **Email**: half@aipowergrid.io
- **Discord**: DM a team member
- **GitHub**: Private security advisory

Please practice responsible disclosure. Don't publicly post vulnerabilities before the team can address them.

## Community Questions

### How do I get involved?

- **Discord**: https://discord.gg/aipowergrid - Main community hub
- **Telegram**: Active community discussions
- **Twitter**: https://x.com/aipowergrid - Updates and announcements
- **GitHub**: https://github.com/halfaipg - Contribute code
- **Reddit**: Community discussions

### Is there a bug bounty program?

Coming soon! Details will be announced on Discord and Twitter.

### Can I contribute to development?

Yes! AIPG is open source. Contributions welcome:
- Code contributions via GitHub
- Documentation improvements
- Bug reports and testing
- Community support
- Content creation

### Who are the team members?

See TEAM.md for full team details. Key members:
- **half**: Founder and visionary leader
- **ameliox**: Senior full stack developer and AI engineer
- **Raz**: Operations and communications manager
- **profesor**: AI art and Stable Diffusion engineer
- **1nf1n18y**: Backend systems and blockchain infrastructure
- **zach**: Core development lead
- **jm**: Social media and public relations
- **mrschmicklz**: AI development and integration wizard

### How is AIPG funded?

AIPG had a fair launch with no VC funding. The project is sustained through:
- Treasury allocation from fair launch
- Future AI service revenue
- Community support
- Ecosystem partnerships

## Roadmap Questions

### What's next for AIPG?

**Q4 2025**
- Expand staking rewards
- Additional DEX listings
- CEX listing applications
- Marketing campaigns

**Q1 2026**
- Governance functionality
- Cross-chain expansion
- Enhanced AI features
- Institutional partnerships

**Long-Term**
- L1 blockchain launch
- Interchain AI protocol
- Global AI compute network
- Leading decentralized AI infrastructure

### When will AIPG be listed on major exchanges?

Applications are in progress. No specific dates yet. Follow Twitter and Discord for announcements.

### Will there be an L1 blockchain?

Yes, it's on the long-term roadmap. The L1 will feature:
- AI-enabled blockchain
- Smart contracts
- Data contracts
- Validator nodes
- Interchain compatibility

## Troubleshooting

### Transaction failed. What do I do?

Common causes:
- Insufficient ETH for gas fees
- Slippage too low (increase to 1-3%)
- Network congestion (wait and retry)
- Wallet not connected to Base network

### Staking interface not loading

1. Check you're connected to Base network (Chain ID: 8453)
2. Clear browser cache
3. Try different browser
4. Check wallet connection
5. Contact support on Discord

### Can't see my AIPG balance

1. Verify you're on Base network
2. Add token manually: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608`
3. Check correct wallet address
4. View on BaseScan to confirm balance

### Need more help?

- **Discord #support**: https://discord.gg/aipowergrid
- **Telegram**: Community support
- **Twitter DM**: https://x.com/aipowergrid
- **Email**: half@aipowergrid.io

## Disclaimer

This FAQ is for informational purposes only and does not constitute financial, legal, or investment advice. Cryptocurrency investments carry risk. Always do your own research and never invest more than you can afford to lose. Past performance does not guarantee future results.

