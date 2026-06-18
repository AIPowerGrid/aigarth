# AIPG Smart Contracts

## Overview

AI Power Grid's smart contracts on Base network provide the foundation for token management, staking, and future ecosystem features. All contracts are verified on BaseScan, built with OpenZeppelin standards, and designed for security and transparency.

## Main Token Contract

### AIPGTokenV2

**Contract Address**: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608`

**Network**: Base (Chain ID: 8453)

**BaseScan**: https://basescan.org/token/0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608

### Contract Features

**ERC20 Standard**
- Full ERC20 compliance for exchange integration
- Standard `transfer()`, `transferFrom()`, `approve()` functions
- Boolean return values for all transfer operations
- Events emitted for all transfers and approvals

**ERC20Capped**
- Hard cap of 150,000,000 AIPG
- Cannot be increased or modified
- Immutable maximum supply
- Prevents inflation beyond cap

**ERC20Burnable**
- Tokens can be burned (permanently destroyed)
- Reduces circulating supply
- Deflationary mechanism
- Anyone can burn their own tokens

**AccessControl**
- Role-based permissions system
- `DEFAULT_ADMIN_ROLE` for admin operations
- `MINTER_ROLE` for minting (now renounced)
- `PAUSER_ROLE` for emergency pause
- Secure multi-role architecture

**Pausable**
- Emergency pause functionality
- Stops all transfers during pause
- Admin-only activation
- Safety mechanism for security incidents

### Key Functions

**Standard ERC20**
```solidity
function transfer(address to, uint256 amount) returns (bool)
function transferFrom(address from, address to, uint256 amount) returns (bool)
function approve(address spender, uint256 amount) returns (bool)
function balanceOf(address account) returns (uint256)
function allowance(address owner, address spender) returns (uint256)
function totalSupply() returns (uint256)
```

**Capped Supply**
```solidity
function cap() returns (uint256) // Returns 150,000,000 * 10^18
```

**Burn**
```solidity
function burn(uint256 amount) // Burn your own tokens
function burnFrom(address account, uint256 amount) // Burn from approved allowance
```

**Admin Functions**
```solidity
function pause() // Emergency pause (PAUSER_ROLE)
function unpause() // Resume operations (PAUSER_ROLE)
function grantRole(bytes32 role, address account) // Grant role (ADMIN_ROLE)
function revokeRole(bytes32 role, address account) // Revoke role (ADMIN_ROLE)
```

### Security Features

**OpenZeppelin Base**
- Battle-tested library contracts
- Industry-standard implementations
- Regular security audits by OpenZeppelin
- Proven track record

**Access Control**
- Role-based permissions prevent unauthorized actions
- Multi-signature admin operations possible
- Granular permission management
- Secure role transfer process

**Reentrancy Protection**
- ReentrancyGuard on sensitive functions
- Prevents reentrancy attacks
- Checks-Effects-Interactions pattern
- Safe external calls

**Supply Management**
- Minting permanently disabled (role renounced)
- Cap enforced at contract level
- No backdoors or hidden minting
- Transparent supply tracking

### Current Status

**Supply**
- Total Supply: 150,000,000 AIPG
- Circulating: ~64,100,000 AIPG
- Burned: ~15,000,000+ AIPG
- Max Cap: 150,000,000 AIPG (immutable)

**Roles**
- Minting: RENOUNCED (permanently disabled)
- Admin: Ledger hardware wallet (0x94A3951e6cC9161B753007Cf5b483d6cEEf04897)
- Pauser: Admin-controlled
- No other privileged addresses

**Verification**
- ✅ Verified on BaseScan
- ✅ Full source code published
- ✅ Constructor arguments documented
- ✅ Compiler settings disclosed

## Staking Contract

### StakingVault

**Contract Address**: `0x3ED14A6D5A48614D77f313389611410d38fd8277`

**Network**: Base (Chain ID: 8453)

**BaseScan**: https://basescan.org/address/0x3ED14A6D5A48614D77f313389611410d38fd8277#code

### Contract Features

**Synthetix-Style Staking**
- Continuous reward distribution per second
- Proportional rewards based on stake share
- No lockup period or withdrawal penalties
- Proven staking mechanism

**Reward Distribution**
- Manual funding by admin (REWARD_DISTRIBUTOR_ROLE)
- Configurable reward duration (typically 7-30 days)
- Even distribution over duration
- Automatic accrual per second

**User Functions**
- Stake AIPG tokens (minimum 100 AIPG)
- Unstake anytime (no lockup)
- Claim rewards anytime
- View pending rewards in real-time

**Security**
- AccessControl for admin functions
- ReentrancyGuard on all state-changing functions
- Pausable for emergencies
- OpenZeppelin standards

### Key Functions

**User Operations**
```solidity
function stake(uint256 amount) // Stake AIPG tokens
function withdraw(uint256 amount) // Unstake tokens
function getReward() // Claim pending rewards
function exit() // Unstake all + claim rewards
function earned(address account) returns (uint256) // View pending rewards
function balanceOf(address account) returns (uint256) // View staked balance
```

**View Functions**
```solidity
function totalSupply() returns (uint256) // Total staked globally
function rewardRate() returns (uint256) // Reward per second
function rewardsDuration() returns (uint256) // Duration in seconds
function periodFinish() returns (uint256) // When current period ends
function lastTimeRewardApplicable() returns (uint256) // Last reward timestamp
```

**Admin Functions**
```solidity
function notifyRewardAmount(uint256 reward) // Start/extend reward period
function setRewardsDuration(uint256 duration) // Set reward duration
function recoverERC20(address token, uint256 amount) // Recover stuck tokens
```

### Staking Mechanism

**How It Works**
1. Admin funds contract with AIPG tokens
2. Admin calls `notifyRewardAmount()` to start distribution
3. Rewards distributed evenly per second over duration
4. Users stake and earn proportional to their share
5. Users claim or compound rewards anytime
6. Users unstake anytime with no penalties

**Reward Calculation**
```
Your Reward Rate = (Your Stake / Total Staked) × Global Reward Rate
Your Pending Rewards = Reward Rate × Time Elapsed
```

**APY Calculation**
```
APY = (Reward Rate × Seconds Per Year × 100) / Total Staked
```

### Security Features

**OpenZeppelin Standards**
- ReentrancyGuard on all user functions
- AccessControl for admin operations
- Pausable for emergency stops
- SafeERC20 for token transfers

**Tested Pattern**
- Based on Synthetix StakingRewards
- Used by protocols with billions in TVL
- Well-audited design
- Proven security track record

**Admin Controls**
- REWARD_DISTRIBUTOR_ROLE for funding
- DEFAULT_ADMIN_ROLE for configuration
- Ledger hardware wallet for admin operations
- No user fund access by admin

### Current Status

**Deployment**
- Deployed: November 2025
- Network: Base mainnet
- Verification: Verified on BaseScan
- Status: Active and operational

**Configuration**
- Minimum Stake: 100 AIPG
- Lockup Period: None
- Reward Duration: Variable (set by admin)
- Current Funding: 3,000,000+ AIPG

**Roles**
- Admin: 0x94A3951e6cC9161B753007Cf5b483d6cEEf04897 (Ledger)
- Reward Distributor: 0xA218db26ed545f3476e6c3E827b595cf2E182533 (Treasury)
- No other privileged addresses

## Contract Addresses Summary

### Base Network (Chain ID: 8453)

| Contract | Address | Purpose |
|----------|---------|---------|
| AIPGTokenV2 | `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608` | Main ERC20 token |
| StakingVault | `0x3ED14A6D5A48614D77f313389611410d38fd8277` | Staking rewards |

### Important Addresses

| Type | Address | Purpose |
|------|---------|---------|
| Admin | `0x94A3951e6cC9161B753007Cf5b483d6cEEf04897` | Contract admin (Ledger) |
| Treasury | `0xA218db26ed545f3476e6c3E827b595cf2E182533` | Treasury and reward distributor |

### Legacy Addresses (PoW Chain - Deprecated)

| Contract | Address | Status |
|----------|---------|--------|
| Old AIPG #1 | `0x1042a2A61565a0E0D7864d742d22D5f9671F313d` | Burned/Migrated |
| Old AIPG #2 | `0xa23a6D5BBDd378313391994aC322351571266F83` | Burned/Migrated |
| Old AIPG #3 | `0xce77B1017A900C57C815E190192dC0B55d2fF0a1` | Burned/Migrated |

## Integration Guide

### Adding AIPG to Wallets

**MetaMask / Coinbase Wallet**
```javascript
// Add Base network
await ethereum.request({
  method: 'wallet_addEthereumChain',
  params: [{
    chainId: '0x2105', // 8453 in hex
    chainName: 'Base',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org']
  }]
});

// Add AIPG token
await ethereum.request({
  method: 'wallet_watchAsset',
  params: {
    type: 'ERC20',
    options: {
      address: '0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608',
      symbol: 'AIPG',
      decimals: 18,
      image: 'https://aipowergrid.io/logo.png'
    }
  }
});
```

### Interacting with Contracts

**Using ethers.js v6**
```javascript
import { ethers } from 'ethers';

// Connect to Base
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');

// Token contract
const AIPG_ADDRESS = '0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608';
const AIPG_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

const aipgToken = new ethers.Contract(AIPG_ADDRESS, AIPG_ABI, provider);

// Check balance
const balance = await aipgToken.balanceOf('0x...');
console.log('Balance:', ethers.formatEther(balance), 'AIPG');

// Staking contract
const STAKING_ADDRESS = '0x3ED14A6D5A48614D77f313389611410d38fd8277';
const STAKING_ABI = [
  'function stake(uint256 amount)',
  'function withdraw(uint256 amount)',
  'function getReward()',
  'function earned(address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)'
];

const stakingVault = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, provider);

// Check staking info
const staked = await stakingVault.balanceOf('0x...');
const rewards = await stakingVault.earned('0x...');
console.log('Staked:', ethers.formatEther(staked), 'AIPG');
console.log('Rewards:', ethers.formatEther(rewards), 'AIPG');
```

### Exchange Integration

**For Centralized Exchanges**

1. **Network Configuration**
   - Network: Base (Ethereum L2)
   - Chain ID: 8453
   - RPC: https://mainnet.base.org
   - Explorer: https://basescan.org

2. **Token Details**
   - Contract: `0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608`
   - Symbol: AIPG
   - Decimals: 18
   - Standard: ERC20

3. **Deposit/Withdrawal**
   - Standard ERC20 transfer functions
   - Recommended confirmations: 10-20 blocks
   - Block time: ~2 seconds
   - Gas: ~$0.01 per transaction

4. **Compliance**
   - ✅ Standard ERC20 interface
   - ✅ Boolean return values
   - ✅ No transfer fees
   - ✅ No special logic
   - ✅ Verified source code

## Security and Audits

### Security Measures

**Smart Contract Security**
- OpenZeppelin library contracts
- Static analysis (Slither, Mythril)
- Manual code review
- Audit-ready documentation

**Operational Security**
- Admin operations via Ledger hardware wallet
- Multi-signature capability
- Role-based access control
- Emergency pause functionality

**Transparency**
- All contracts verified on BaseScan
- Full source code published
- Constructor arguments documented
- Compiler settings disclosed

### Audit Status

**Current Status**
- Static analysis completed
- Audit package prepared
- Professional audit pending
- Community review ongoing

**Audit Package Contents**
- Contract source code
- Security analysis reports
- Architecture documentation
- Test coverage
- Deployment scripts

### Bug Bounty

**Program Details**
- Coming soon
- Rewards for critical vulnerabilities
- Responsible disclosure policy
- Community security participation

## Future Contracts

### Planned Deployments

**Q4 2025**
- Enhanced staking features
- Governance contracts
- NFT marketplace integration

**Q1 2026**
- Cross-chain bridge contracts
- DAO treasury management
- Advanced DeFi integrations

**Long-Term**
- L1 blockchain smart contracts
- Interchain protocol contracts
- Enterprise integration contracts

## Developer Resources

### Documentation
- Contract ABIs: Available on BaseScan
- Integration examples: GitHub repository
- API documentation: https://docs.aipowergrid.io
- SDK support: JavaScript, Python, Go, Rust

### Testing
- Testnet deployments: Available on request
- Faucet: For testnet AIPG
- Example scripts: GitHub repository
- Support: Discord #developers channel

### Community
- GitHub: https://github.com/halfaipg
- Discord: https://discord.gg/aipowergrid
- Telegram: Developer group
- Twitter: https://x.com/aipowergrid

## Conclusion

AIPG's smart contracts provide a secure, transparent foundation for the decentralized AI ecosystem. Built on industry-standard OpenZeppelin libraries and deployed to Base network, these contracts enable token management, staking rewards, and future ecosystem features while maintaining the highest security standards.

All contracts are verified, auditable, and designed with user safety as the top priority. As the ecosystem grows, additional contracts will be deployed to support new features while maintaining the same commitment to security and transparency.

**Explore Contracts**:
- **Token**: https://basescan.org/token/0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608
- **Staking**: https://basescan.org/address/0x3ED14A6D5A48614D77f313389611410d38fd8277#code
- **GitHub**: https://github.com/halfaipg

