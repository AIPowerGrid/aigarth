# Bridge and Migration Guide

## Overview

AI Power Grid maintains a bridge system that allows legacy holders from the original Proof-of-Work blockchain to migrate their tokens to the new Base network. This ensures that early adopters and long-time community members can seamlessly transition to the new infrastructure.

## Legacy Web Wallet

**Web Wallet URL**: https://webwallet.aipowergrid.io/

The legacy web wallet provides access to the original AIPG PoW blockchain and includes bridge functionality for migrating to Base.

### Migration Notice

**Important**: The AI Power Grid PoW explorer has been frozen at block 985400 as part of the migration to Base network.

**New Base Contract**: https://basescan.org/address/0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608

## How to Bridge from PoW to Base

### Step 1: Access Your Legacy Wallet

1. Visit https://webwallet.aipowergrid.io/
2. Access your wallet using one of these methods:
   - Import your seed phrase (12 or 24 words)
   - Upload your wallet file
   - Enter your private key
3. If your wallet is password-protected, unlock it

### Step 2: Initiate Bridge Request

1. Click the wallet menu icon (⋮) in the top right
2. Select "Bridge Request"
3. This will register your balance for migration to Base
4. Confirm the transaction

### Step 3: Receive Tokens on Base

Once your bridge request is processed:
- Your AIPG tokens will be minted on Base network
- Tokens sent to the same address or specified Base address
- Check your balance on BaseScan: https://basescan.org/token/0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608

## Troubleshooting for Early Adopters

### Zero Balance Issue

If you were an early adopter and entered your seed phrase but see a zero balance, try these steps:

#### Method 1: Advanced Mode Recovery

1. Go to **Settings** → **Delete Current Wallet**
2. Go to **Settings** again and enable **Advanced Mode**
3. On the main page, go to **Access My Wallet**
4. Enter your seed phrase in the first box
5. A second box will appear - try entering your seed phrase again in this box
6. If balance still shows zero, proceed to Method 2

#### Method 2: Password Recovery

1. Start over from the beginning (delete wallet, enable advanced mode)
2. Enter your seed phrase in the first box
3. In the second box, try entering common passwords you may have used when you originally set up your AIPG Core Wallet
4. Common password patterns to try:
   - Default passwords you typically use
   - Passwords from 2023-2024 timeframe
   - Variations with numbers/special characters

### Common Issues and Solutions

**Issue**: Seed phrase not recognized
- **Solution**: Ensure you're using the correct 12 or 24-word seed phrase
- Check for typos or incorrect word order
- Try enabling Advanced Mode for additional recovery options

**Issue**: Wallet shows zero balance but you know you had tokens
- **Solution**: Follow the Early Adopter recovery steps above
- Your wallet may have been encrypted with a password
- The second seed phrase box or password field may unlock your balance

**Issue**: Bridge request not processing
- **Solution**: Ensure you have a small amount of AIPG for transaction fees on PoW chain
- Wait a few minutes and try again
- Contact support on Discord if issue persists

**Issue**: Tokens not appearing on Base after bridge
- **Solution**: Check the correct Base address on BaseScan
- Bridge processing may take a few minutes to hours
- Verify your bridge request was confirmed on PoW chain

## Bridge Security

### How the Bridge Works

The AIPG bridge uses a secure, verified process:

1. **Lock on PoW Chain**: Tokens are locked or burned on the original blockchain
2. **Signature Verification**: EIP-712 cryptographic signatures verify the transaction
3. **Mint on Base**: Equivalent tokens are minted on Base network
4. **Database Tracking**: All bridge transactions are logged and auditable

### Security Features

- **EIP-712 Signatures**: Industry-standard cryptographic verification
- **Replay Protection**: Prevents duplicate transactions
- **Admin Controls**: Multi-signature admin access for security
- **Transaction Logging**: Complete audit trail of all bridge operations
- **Rate Limiting**: Protection against abuse

### Safety Tips

- Always verify you're on the correct website (https://webwallet.aipowergrid.io/)
- Never share your seed phrase or private keys
- Double-check the Base contract address: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608`
- Keep a backup of your seed phrase in a secure location
- Test with a small amount first if you're unsure

## Legacy Wallet Features

### Wallet Management

The legacy web wallet includes:
- **Dashboard**: View balance and transaction history
- **Send/Receive**: Transfer AIPG on PoW chain
- **Staking**: Legacy staking on PoW chain (deprecated)
- **Governance**: DAO voting for masternode operators
- **Masternode Control**: Manage masternodes on PoW chain

### Settings and Customization

- **Explorer Selection**: Choose AIPG node and explorer
- **Display Currency**: Set preferred fiat currency
- **Language Options**: Multiple language support
- **Auto-Lock**: Security feature to lock wallet automatically
- **Advanced Mode**: Unlock additional recovery and customization options
- **Debug Mode**: For troubleshooting and development

### Important Notes

- The PoW blockchain explorer is frozen at block 985400
- New transactions on PoW chain are not recommended
- All users should migrate to Base for active development and support
- Legacy staking and governance features are deprecated

## Migration Timeline

### November 1, 2025 - Base Launch
- Base network token deployed
- Bridge opened for migrations
- Legacy wallet updated with migration notice

### Ongoing Migration Period
- Legacy holders can bridge at any time
- No deadline for migration currently set
- Support available for migration issues

### Future Plans
- Legacy PoW chain maintained for historical records
- Bridge may remain open indefinitely for late migrators
- Focus shifts entirely to Base ecosystem

## After Migration

### What to Do on Base

Once you've successfully migrated to Base:

1. **Add Base Network to Wallet**
   - Network: Base
   - Chain ID: 8453
   - RPC: https://mainnet.base.org
   - Explorer: https://basescan.org

2. **Verify Your Balance**
   - Check on BaseScan: https://basescan.org/token/0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608
   - Add AIPG token to MetaMask/wallet using contract address

3. **Start Staking**
   - Visit https://aipowergrid.io/staking
   - Stake your AIPG to earn rewards
   - No lockup period, claim anytime

4. **Trade on Uniswap**
   - Buy/sell AIPG on Uniswap V3
   - Link: https://app.uniswap.org/swap?outputCurrency=0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608&chain=base

5. **Join the Community**
   - Discord: https://discord.gg/aipowergrid
   - Twitter: https://x.com/aipowergrid
   - Stay updated on developments

## Bridge Interface (Alternative)

### Main Bridge Application

In addition to the web wallet, AIPG offers a dedicated bridge interface:

**Bridge URL**: https://bridge.aipowergrid.io

### Features
- Clean, modern interface
- Bidirectional bridging (PoW ↔ Base)
- Transaction history tracking
- Real-time status updates
- Support for MetaMask and other wallets

### How to Use Main Bridge

1. Visit https://bridge.aipowergrid.io
2. Connect your wallet (MetaMask, Coinbase Wallet, etc.)
3. Select direction: PoW to Base or Base to PoW
4. Enter amount to bridge
5. Confirm transaction
6. Wait for processing (typically a few minutes)
7. Tokens appear in destination chain

## Technical Details

### Bridge Smart Contracts

**PoW Chain**: Legacy bridge contract (deprecated for new transactions)
**Base Chain**: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608` (main token contract)

### Bridge Backend

- **Database**: SQLite (development) / PostgreSQL (production)
- **API**: RESTful endpoints for transaction processing
- **Signing Server**: Secure signature generation for minting
- **Rate Limiting**: Protection against spam and abuse

### Transaction Flow

```
User Request → Signature Verification → Database Log → 
Blockchain Transaction → Confirmation → Token Mint/Burn
```

### Processing Time

- **Typical**: 2-10 minutes
- **During High Load**: Up to 30 minutes
- **Manual Review**: Complex cases may take longer

## Support and Assistance

### Get Help with Migration

If you encounter issues during migration:

1. **Discord Support**: https://discord.gg/aipowergrid
   - #support channel for migration help
   - Community members and team available

2. **Telegram**: Active community support
   - Quick responses to common issues
   - Direct communication with team

3. **Twitter/X**: https://x.com/aipowergrid
   - DM for private support issues
   - Public updates on bridge status

4. **Email**: half@aipowergrid.io
   - For complex technical issues
   - Include transaction details and wallet address

### Information to Provide

When seeking support, include:
- Your wallet address (public address only, never private keys)
- Transaction hash if available
- Screenshots of error messages
- Steps you've already tried
- Approximate date of original wallet creation

## Historical Context

### Why the Migration?

The migration from PoW to Base was driven by:
- **Scalability**: Base handles thousands of TPS vs limited PoW throughput
- **Cost**: $0.01 transactions vs expensive PoW mining
- **Ecosystem**: Access to DeFi, DEXs, and Coinbase integration
- **Sustainability**: Useful AI compute vs wasteful proof-of-work
- **Developer Tools**: Better infrastructure for building applications

### Original PoW Chain

- **Launch**: December 10, 2023
- **Fair Launch**: No pre-mine, no VC, no pre-sales
- **Consensus**: Proof-of-Work (Scrypt algorithm)
- **Block Time**: ~2.5 minutes
- **Final Block**: 985400 (frozen November 1, 2025)

### Base Network Benefits

- **Layer 2**: Built on Ethereum security
- **Low Fees**: ~$0.01 per transaction
- **Fast**: 2-second block times
- **Coinbase**: Direct integration with Coinbase ecosystem
- **DeFi Ready**: Compatible with Uniswap, Aave, and more

## Frequently Asked Questions

### Do I have to migrate?

While not mandatory, migration is strongly recommended. The PoW chain is frozen and all development, staking, and ecosystem growth happens on Base.

### Is there a deadline?

Currently, no deadline is set. The bridge will remain open for the foreseeable future to accommodate late migrators.

### Will I lose my tokens if I don't migrate?

No, your tokens remain on the PoW chain. However, you won't be able to stake, trade on DEXs, or participate in the Base ecosystem without migrating.

### Can I migrate back to PoW?

The bridge is bidirectional, but since the PoW chain is frozen, there's no practical reason to bridge back.

### Are there any fees?

Small transaction fees on the PoW chain (paid in AIPG) and gas fees on Base (paid in ETH, typically ~$0.01).

### What if I lost my seed phrase?

Unfortunately, without your seed phrase or private key, there's no way to access your tokens. Always keep secure backups.

### Can I migrate from a hardware wallet?

Yes, you can use your hardware wallet's seed phrase or connect it directly to compatible bridge interfaces.

### What happens to masternodes?

Masternodes on the PoW chain are deprecated. The Base network uses a different staking model without masternodes.

## Conclusion

The bridge system ensures that all AIPG community members, from early adopters to recent holders, can seamlessly transition to the new Base infrastructure. With comprehensive support, detailed documentation, and an active community, migrating your AIPG tokens is straightforward and secure.

For the best experience and access to all new features, migrate to Base today using the legacy web wallet at https://webwallet.aipowergrid.io/ or the main bridge at https://bridge.aipowergrid.io.

