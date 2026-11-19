import test from 'node:test';
import assert from 'node:assert/strict';
import { getNetwork, publicNetwork, explorerTx, NETWORKS } from '../src/network.js';
import { isAddress } from '../src/pda.js';

test('mainnet is the default and uses Circle USDC and a mainnet facilitator', () => {
  const n = getNetwork({});
  assert.equal(n.id, 'mainnet');
  assert.equal(n.caip2, 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
  assert.equal(n.usdcMint, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(n.facilitatorUrl, 'https://facilitator.payai.network');
  assert.equal(n.testMoney, false);
  assert.equal(explorerTx('abc', n), 'https://explorer.solana.com/tx/abc');
});

test('devnet can still be selected, and env overrides apply', () => {
  const n = getNetwork({ SOLANA_NETWORK: 'devnet', SOLANA_RPC_URL: 'https://rpc.example', FACILITATOR_URL: 'https://f.example' });
  assert.equal(n.id, 'devnet');
  assert.equal(n.usdcMint, '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  assert.equal(n.rpcUrl, 'https://rpc.example');
  assert.equal(n.facilitatorUrl, 'https://f.example');
  assert.match(explorerTx('abc', n), /cluster=devnet/);
});

test('every hard-coded mint is a valid address and nothing secret goes to the browser', () => {
  for (const n of Object.values(NETWORKS)) assert.ok(isAddress(n.usdcMint), n.id);
  const pub = publicNetwork(getNetwork({ SOLANA_RPC_URL: 'https://mainnet.helius-rpc.com/?api-key=SECRET' }));
  assert.doesNotMatch(JSON.stringify(pub), /SECRET|rpc/i);
});
