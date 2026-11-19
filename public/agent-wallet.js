// The agent's own small wallet, generated and kept in this browser.
// It signs payments by itself, so the agent can buy tools without asking for approval each time.
// Safety: it can only pay x402 USDC requests (see x402-browser.js), never more than 0.05 USDC per
// request, and never more than the per-task cap. On mainnet this is REAL money: fund it with cents only.
import { base58Encode, b64encode, b64decode } from './solana.js';

const LS = 'witiq.agent.v1';
let cached = null;

export async function agentSupported() {
  try {
    const k = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
    return Boolean(k);
  } catch {
    return false;
  }
}

async function load() {
  if (cached) return cached;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(LS) || 'null');
  } catch {
    /* ignore */
  }
  if (saved?.pkcs8 && saved?.address) {
    const key = await crypto.subtle.importKey('pkcs8', b64decode(saved.pkcs8), 'Ed25519', false, ['sign']);
    cached = { key, address: saved.address, pkcs8: saved.pkcs8 };
    return cached;
  }
  return null;
}

export async function getAgentWallet() {
  const w = await load();
  return w ? { address: w.address } : null;
}

export async function createAgentWallet() {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const pkcs8 = b64encode(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)));
  const address = base58Encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  localStorage.setItem(LS, JSON.stringify({ pkcs8, address }));
  cached = null;
  await load();
  return { address };
}

export function forgetAgentWallet() {
  try {
    localStorage.removeItem(LS);
  } catch {
    /* ignore */
  }
  cached = null;
}

// Signs the x402 payment transaction: slot 0 is the facilitator (left empty), slot 1 is the agent.
export async function agentSign(txBytes) {
  const w = await load();
  if (!w) throw new Error('The agent wallet is not set up.');
  const messageStart = 1 + 2 * 64; // compact-u16 count (1 byte for 2) + two signature slots
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', w.key, txBytes.subarray(messageStart)));
  const out = new Uint8Array(txBytes);
  out.set(sig, 1 + 64);
  return out;
}
