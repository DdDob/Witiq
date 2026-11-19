// The Solana network the server runs on (mainnet or devnet). Filled from /api/config at boot so the
// browser never hard-codes a cluster. Defaults to mainnet so nothing silently signs for test money.
export const NET = {
  id: 'mainnet',
  name: 'Solana Mainnet',
  caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  walletChain: 'solana:mainnet',
  deeplinkCluster: 'mainnet-beta',
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  explorerQuery: '',
  testMoney: false,
};

const LS = 'witiq.net.v1';
try {
  const saved = JSON.parse(localStorage.getItem(LS) || 'null');
  if (saved?.caip2) Object.assign(NET, saved); // so the phone wallet flow knows the cluster before /api/config returns
} catch {
  /* ignore */
}

export function setNet(cfg) {
  if (!cfg?.caip2 || !cfg?.usdcMint) return;
  Object.assign(NET, cfg);
  try {
    localStorage.setItem(LS, JSON.stringify(NET));
  } catch {
    /* private mode */
  }
}

export const explorerTxUrl = (sig) => `https://explorer.solana.com/tx/${sig}${NET.explorerQuery}`;
export const explorerAddrUrl = (a) => `https://explorer.solana.com/address/${a}${NET.explorerQuery}`;
export const usdcLabel = () => (NET.testMoney ? 'test USDC' : 'USDC');
