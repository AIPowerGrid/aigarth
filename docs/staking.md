# AIPG Staking Guide

## Overview

AIPG token holders can stake their tokens to earn passive rewards through the StakingVault contract on Base network. The staking system uses a Synthetix-style continuous reward distribution model with no lockup periods.

**Staking Interface**: https://aipowergrid.io/staking

## Key Features

### No Lock Period
Unstake your AIPG anytime. Your tokens are never locked or subject to withdrawal delays. This provides maximum flexibility for token holders.

### Real-Time Rewards
Rewards accrue every second based on your share of the total staked pool. You can watch your rewards grow in real-time and claim whenever you want.

### High APY
Earn competitive rewards on your staked AIPG. APY is dynamic and adjusts based on total value locked (TVL) - early stakers benefit from higher APY when TVL is lower.

### Verified Smart Contract
The staking contract is verified on BaseScan and built with battle-tested OpenZeppelin libraries. Your funds are protected by industry-standard security practices.

## Staking Contract Details

### Contract Information
- **Contract Address**: `0x3ED14A6D5A48614D77f313389611410d38fd8277`
- **Network**: Base (Chain ID: 8453)
- **Verification**: Verified on BaseScan
- **Security**: OpenZeppelin standards (AccessControl, ReentrancyGuard, Pausable)

**View on BaseScan**: https://basescan.org/address/0x3ED14A6D5A48614D77f313389611410d38fd8277#code

### Technical Architecture
The StakingVault contract implements a Synthetix-style staking mechanism:
- Continuous reward distribution per second
- Proportional rewards based on stake share
- Manual funding by admin (reward distributor role)
- No lockup or withdrawal penalties
- Compound functionality (claim + restake)

## How to Stake

### Step 1: Connect Wallet
Visit https://aipowergrid.io/staking and connect your wallet using RainbowKit. Supported wallets include:
- MetaMask
- Coinbase Wallet
- WalletConnect (mobile wallets)
- Ledger hardware wallet
- Rainbow Wallet
- Trust Wallet

### Step 2: Acquire AIPG Tokens
If you don't have AIPG tokens, you can purchase them on Uniswap:

**Buy on Uniswap**: https://app.uniswap.org/swap?outputCurrency=0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608&chain=base

You'll need:
- AIPG tokens (minimum 100 AIPG)
- ETH on Base for gas fees (~$0.01 per transaction)

### Step 3: Approve and Stake
1. Enter the amount of AIPG you want to stake (minimum 100 AIPG)
2. Click "Approve" to allow the staking contract to access your tokens
3. Confirm the approval transaction in your wallet
4. Click "Stake" to deposit your tokens
5. Confirm the staking transaction in your wallet

### Step 4: Earn Rewards
Once staked, you'll immediately start earning rewards that accrue every second. You can:
- Watch your pending rewards grow in real-time
- Claim rewards at any time
- Compound rewards (claim + restake in one transaction)
- Add more to your existing stake
- Unstake partially or fully with no penalties

## Staking Requirements

### Minimum Stake
**100 AIPG minimum** - This prevents spam and ensures meaningful participation in the staking pool.

### Gas Fees
All transactions require ETH on Base for gas fees:
- Approve: ~$0.01
- Stake: ~$0.01
- Claim: ~$0.01
- Compound: ~$0.02 (two transactions)
- Unstake: ~$0.01

### Network Requirements
- Must be connected to Base network (Chain ID: 8453)
- Wallet must hold AIPG tokens on Base
- Small amount of ETH needed for gas

## Reward Mechanics

### How Rewards Work
The StakingVault distributes rewards continuously over a set duration (typically 7-30 days):

1. **Reward Pool**: Admin funds the contract with AIPG tokens
2. **Distribution Rate**: Rewards distributed evenly per second over duration
3. **Your Share**: You earn proportional to your stake vs total staked
4. **Accrual**: Rewards accrue every second automatically
5. **Claiming**: Claim anytime without affecting future rewards

### APY Calculation
APY is dynamic and calculated as:
```
APY = (Reward Rate × Seconds Per Year × 100) / Total Staked
```

**Key Factors**:
- Higher total staked = Lower APY (more competition for rewards)
- Lower total staked = Higher APY (fewer stakers splitting rewards)
- Reward rate set by admin when funding the pool

### Example Scenario
If the pool has:
- 10,000,000 AIPG total staked
- 1,000,000 AIPG reward pool for 30 days
- You stake 100,000 AIPG (1% of pool)

You would earn:
- 10,000 AIPG over 30 days (1% of rewards)
- ~333 AIPG per day
- ~40% APY

## Claiming and Compounding

### Claim Rewards
Click "Claim Rewards" to withdraw your earned AIPG to your wallet. This does not affect your staked balance or future reward accrual.

**When to Claim**:
- Claim anytime - no restrictions
- Consider gas fees vs reward amount
- Rewards continue accruing whether you claim or not

### Compound Rewards
Click "🔄 Compound" to automatically claim your rewards and restake them in one action. This requires two transactions:
1. Claim rewards from the contract
2. Stake the claimed amount

**Benefits of Compounding**:
- Increase your staked balance
- Earn rewards on your rewards
- Grow your position over time
- Maximize long-term returns

### Add to Existing Stake
You can add more AIPG to your existing stake at any time:
1. Enter additional amount to stake
2. Approve and stake as normal
3. New tokens added to your existing position
4. Rewards continue accruing on total balance

## Unstaking

### How to Unstake
1. Navigate to the "Unstake" section
2. Enter amount to unstake (or click "Max" for full balance)
3. Click "Unstake" button
4. Confirm transaction in wallet
5. Tokens returned to your wallet immediately

### No Penalties
- No lockup period or withdrawal delays
- No unstaking fees or penalties
- Claim any pending rewards before or after unstaking
- Partial unstaking allowed

### After Unstaking
- Tokens return to your wallet immediately
- Any unclaimed rewards remain claimable
- You can restake at any time
- No cooldown period required

## Security and Safety

### Smart Contract Security
- **OpenZeppelin Libraries**: Industry-standard security components
- **Access Control**: Role-based permissions for admin functions
- **ReentrancyGuard**: Protection against reentrancy attacks
- **Pausable**: Emergency pause capability if needed
- **Non-Custodial**: You always control your tokens

### Audit Status
- Static analysis performed with Slither and Mythril
- Comprehensive audit documentation prepared
- Full source code verified on BaseScan
- Built on battle-tested Synthetix staking model

### Best Practices
- Always verify you're on the correct website (https://aipowergrid.io/staking)
- Check contract address matches: `0x3ED14A6D5A48614D77f313389611410d38fd8277`
- Use hardware wallets (Ledger) for large amounts
- Never share your private keys or seed phrase
- Verify transactions in your wallet before confirming

### Risk Considerations
- **Smart Contract Risk**: While audited, all smart contracts carry inherent risk
- **APY Volatility**: APY changes based on total staked and reward funding
- **Impermanent Loss**: Not applicable - staking is single-sided (AIPG only)
- **No Guarantees**: Rewards depend on admin funding the pool

## Frequently Asked Questions

### How are rewards calculated?
Rewards accrue every second based on your share of the total staked pool. The more AIPG staked globally, the more stable the APY becomes. Your exact reward rate = (Your Stake / Total Staked) × Reward Rate Per Second.

### Is there a minimum stake?
Yes, the minimum stake is 100 AIPG to prevent spam and ensure meaningful participation.

### Can I lose my staked tokens?
No. Your staked AIPG is always yours and can be withdrawn at any time. The contract is non-custodial and verified on BaseScan. You maintain full control of your tokens.

### How often should I claim rewards?
You can claim anytime! Rewards continue accruing whether you claim daily, weekly, or let them accumulate. Gas fees are the only consideration - claiming more frequently costs more in gas.

### What happens if I don't claim rewards?
Nothing bad! Rewards continue accruing and remain claimable indefinitely. There's no expiration or penalty for not claiming.

### Can I stake from a hardware wallet?
Yes! The staking interface fully supports Ledger hardware wallets for maximum security.

### What if the staking contract runs out of rewards?
If the reward pool depletes, no new rewards accrue until the admin funds the contract again. Your staked tokens remain safe and withdrawable at all times.

### Is there a maximum stake amount?
No maximum - stake as much as you want. Larger stakes earn proportionally larger rewards.

### Can I stake from multiple wallets?
Yes, each wallet address stakes independently. You can stake from as many wallets as you want.

### What's the difference between claiming and compounding?
- **Claiming**: Withdraws rewards to your wallet
- **Compounding**: Claims rewards and immediately restakes them to grow your position

## Staking Statistics

### Global Metrics (Real-Time)
View live statistics on the staking page:
- **Global APY**: Current annual percentage yield
- **Total Value Staked**: Total AIPG locked in staking
- **Total Stakers**: Number of unique staking addresses
- **Reward Rate**: AIPG distributed per second

### Your Personal Stats
When wallet is connected:
- **Your Staked Balance**: Total AIPG you have staked
- **Pending Rewards**: Unclaimed rewards accrued
- **Your APY**: Same as global APY (proportional distribution)
- **Wallet Balance**: Available AIPG in your wallet

## Technical Integration

### For Developers
Integrate AIPG staking into your application:

```javascript
// Contract addresses
const AIPG_TOKEN = '0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608';
const STAKING_VAULT = '0x3ED14A6D5A48614D77f313389611410d38fd8277';

// Key functions
- stake(uint256 amount) - Stake AIPG tokens
- withdraw(uint256 amount) - Unstake AIPG tokens
- getReward() - Claim pending rewards
- earned(address account) - View pending rewards
- balanceOf(address account) - View staked balance
- totalSupply() - View total staked globally
```

### ABI and Documentation
Full contract ABI and integration examples available in the audit package and GitHub repository.

## Support and Resources

### Get Help
- **Discord**: https://discord.gg/aipowergrid - Community support
- **Telegram**: Active community for questions
- **Twitter**: https://x.com/aipowergrid - Updates and announcements
- **Documentation**: https://docs.aipowergrid.io

### Additional Resources
- **Contract Code**: https://basescan.org/address/0x3ED14A6D5A48614D77f313389611410d38fd8277#code
- **Audit Package**: Available on GitHub
- **Video Tutorials**: Coming soon on YouTube
- **Integration Guide**: For developers building on AIPG

## Conclusion

Staking AIPG is a simple, secure way to earn passive rewards on your token holdings. With no lockup periods, real-time reward accrual, and a user-friendly interface, anyone can participate in securing the AIPG network while earning competitive yields.

Start staking today at https://aipowergrid.io/staking

