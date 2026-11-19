// Which Solana cluster Witiq runs on. Set SOLANA_NETWORK=mainnet (default) or devnet.
// Everything network-specific lives here so the rest of the code never hard-codes a cluster.

export const NETWORKS = {
  mainnet: {
    id: 'mainnet',
    name: 'Solana Mainnet',
    caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // x402 v2 network id (CAIP-2 genesis hash)
    walletChain: 'solana:mainnet', // Wallet Standard chain id
    deeplinkCluster: 'mainnet-beta', // Phantom / Solflare universal links
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Circle USDC
    rpcUrl: 'https://api.mainnet-beta.solana.com', // public and rate limited: use Helius in production
    facilitatorUrl: 'https://facilitator.payai.network', // settles x402 on Solana mainnet, pays the network fee
    explorerQuery: '',
    testMoney: false,
  },
  devnet: {
    id: 'devnet',
    name: 'Solana Devnet',
    caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    walletChain: 'solana:devnet',
    deeplinkCluster: 'devnet',
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    rpcUrl: 'https://api.devnet.solana.com',
    facilitatorUrl: 'https://x402.org/facilitator',
    explorerQuery: '?cluster=devnet',
    testMoney: true,
  },
};

export function getNetwork(env = process.env) {
  const raw = String(env.SOLANA_NETWORK || 'mainnet').trim().toLowerCase();
  const id = ['devnet', 'test', 'testnet'].includes(raw) ? 'devnet' : 'mainnet';
  const base = NETWORKS[id];
  return {
    ...base,
    rpcUrl: env.SOLANA_RPC_URL || base.rpcUrl,
    facilitatorUrl: env.FACILITATOR_URL || base.facilitatorUrl,
  };
}

// What the browser needs (no secrets).
export const publicNetwork = (n) => ({
  id: n.id,
  name: n.name,
  caip2: n.caip2,
  walletChain: n.walletChain,
  deeplinkCluster: n.deeplinkCluster,
  usdcMint: n.usdcMint,
  explorerQuery: n.explorerQuery,
  testMoney: n.testMoney,
});

export const explorerTx = (sig, n) => (sig ? `https://explorer.solana.com/tx/${sig}${n?.explorerQuery || ''}` : null);
