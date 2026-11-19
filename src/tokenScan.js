// Token Safety Scanner (roadmap Phase 1). Paste a token mint address, get a 0 to 100 safety score,
// a plain verdict (Low risk / Caution / High risk) and one sentence per check.
//
// Design rules from the roadmap:
//   - One function per check, each returning a status and a one-sentence explanation.
//   - Say so when data is missing; never guess. Unknown checks are left out of the score.
//   - Show reasons, never call anything a scam. Scores are information, not financial advice.
//   - Built as a clean API from day one, so it is also a paid agent on the marketplace.
//
// Data sources: the Solana JSON-RPC (any provider; Helius recommended) and DexScreener's public API.
import { HttpError } from './errors.js';
import { base58Decode, base58Encode as encodeKey, isOnCurve, metadataAddress, isAddress } from './pda.js';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const INCINERATOR = '1nc1nerator11111111111111111111111111111111';

// Regulated stablecoin issuers keep mint and freeze authority by design (compliance). Flagging them
// as "High risk" would be a false accusation, so their authorities are reported as information.
export const KNOWN_ISSUERS = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'Circle, the regulated issuer of USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'Tether, the issuer of USDT',
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': 'Paxos, the regulated issuer of PYUSD',
};

// Points each check is worth. A "warn" costs half, a "fail" costs all of it, "unknown" is left out.
export const WEIGHTS = {
  mint_authority: 22,
  freeze_authority: 18,
  token_extensions: 12,
  holder_concentration: 14,
  dev_holdings: 6,
  liquidity: 12,
  age_activity: 8,
  metadata: 8,
  bundle_detection: 6,
};

const pct = (n) => `${n >= 10 ? Math.round(n) : Number(n.toFixed(1))}%`;
const usdFmt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const result = (id, title, status, detail, extra = {}) => ({ id, title, status, weight: WEIGHTS[id], detail, ...extra });

/* ------------------------------------------------------------------ */
/* Checks: pure functions, unit tested                                 */
/* ------------------------------------------------------------------ */

export function checkMintAuthority(mintInfo, issuer) {
  const a = mintInfo.info.mintAuthority;
  if (!a) return result('mint_authority', 'Mint authority', 'pass', 'Revoked: nobody can create new tokens, so the supply is fixed.');
  if (issuer) return result('mint_authority', 'Mint authority', 'info', `Held by ${issuer}. Normal for a stablecoin: new tokens are issued against reserves.`);
  return result('mint_authority', 'Mint authority', 'fail', `Still open (${short(a)}): that wallet can create unlimited new tokens and dilute every holder.`, { critical: true, authority: a });
}

export function checkFreezeAuthority(mintInfo, issuer) {
  const a = mintInfo.info.freezeAuthority;
  if (!a) return result('freeze_authority', 'Freeze authority', 'pass', 'Revoked: nobody can freeze holders’ tokens.');
  if (issuer) return result('freeze_authority', 'Freeze authority', 'info', `Held by ${issuer}, which can freeze accounts for compliance. Expected for a stablecoin.`);
  return result('freeze_authority', 'Freeze authority', 'fail', `Still open (${short(a)}): the developer can freeze any holder’s tokens, which can stop you from selling.`, { critical: true, authority: a });
}

export function checkExtensions(mintInfo, issuer) {
  if (mintInfo.program !== TOKEN_2022_PROGRAM) {
    return result('token_extensions', 'Hidden transfer rules', 'pass', 'Classic SPL token: no transfer fees, hooks or permanent delegate are possible.');
  }
  const ext = Object.fromEntries((mintInfo.info.extensions || []).map((e) => [e.extension, e.state || {}]));
  const bad = [];
  const warn = [];
  if (ext.permanentDelegate?.delegate) bad.push('a permanent delegate can move or burn tokens from any wallet');
  if (ext.nonTransferable) bad.push('the token cannot be transferred at all');
  if (ext.defaultAccountState && String(ext.defaultAccountState.accountState).toLowerCase() === 'frozen') bad.push('new holder accounts start frozen');
  if (ext.pausableConfig?.authority) bad.push('an authority can pause all transfers');
  const critical = bad.length > 0; // any of the above can trap or take holders' tokens
  const bps = Number(ext.transferFeeConfig?.newerTransferFee?.transferFeeBasisPoints ?? ext.transferFeeConfig?.olderTransferFee?.transferFeeBasisPoints ?? 0);
  if (bps >= 500) bad.push(`a ${bps / 100}% fee is taken on every transfer`);
  else if (bps > 0) warn.push(`a ${bps / 100}% fee is taken on every transfer`);
  if (ext.transferHook?.programId) warn.push('every transfer runs a custom program, which could block sells');
  if (ext.mintCloseAuthority?.closeAuthority) warn.push('the mint account can be closed');

  if (issuer && (bad.length || warn.length)) {
    return result('token_extensions', 'Hidden transfer rules', 'info', `Token-2022 controls held by ${issuer}: ${[...bad, ...warn].join('; ')}.`);
  }
  if (bad.length) return result('token_extensions', 'Hidden transfer rules', 'fail', `Token-2022 rules found: ${bad.join('; ')}${warn.length ? `; also ${warn.join('; ')}` : ''}.`, { critical });
  if (warn.length) return result('token_extensions', 'Hidden transfer rules', 'warn', `Token-2022 rules found: ${warn.join('; ')}.`);
  return result('token_extensions', 'Hidden transfer rules', 'pass', 'Token-2022 token with no risky extensions (no permanent delegate, fee, hook or default freeze).');
}

// holders: [{ owner, kind: 'wallet' | 'program' | 'burn', uiAmount }], aggregated by owner.
export function checkConcentration(holders, supplyUi) {
  if (!holders || !supplyUi) return result('holder_concentration', 'Holder concentration', 'unknown', 'Could not read the largest holders from the RPC right now, so this was not scored.');
  const wallets = holders.filter((h) => h.kind === 'wallet').sort((a, b) => b.uiAmount - a.uiAmount);
  const excluded = holders.filter((h) => h.kind !== 'wallet');
  const share = (h) => (h.uiAmount / supplyUi) * 100;
  const top10 = wallets.slice(0, 10).reduce((n, h) => n + share(h), 0);
  const top1 = wallets[0] ? share(wallets[0]) : 0;
  const note = excluded.length ? ` (${excluded.length} pool, locker or burn account${excluded.length === 1 ? '' : 's'} excluded)` : '';
  const data = { top10Pct: Number(top10.toFixed(2)), top1Pct: Number(top1.toFixed(2)), excluded: excluded.length };
  if (top10 > 50 || top1 > 20) return result('holder_concentration', 'Holder concentration', 'fail', `Top 10 wallets hold ${pct(top10)} of supply and the largest holds ${pct(top1)}${note}. A few wallets could crash the price.`, { data });
  if (top10 > 30 || top1 > 10) return result('holder_concentration', 'Holder concentration', 'warn', `Top 10 wallets hold ${pct(top10)} of supply, the largest ${pct(top1)}${note}.`, { data });
  return result('holder_concentration', 'Holder concentration', 'pass', `Spread out: top 10 wallets hold ${pct(top10)} of supply${note}.`, { data });
}

export function checkDevHoldings(candidates, holders, supplyUi) {
  const devs = [...new Set(candidates.filter(Boolean))];
  if (!devs.length) return result('dev_holdings', 'Dev wallet', 'unknown', 'All creator authorities are revoked, so the dev wallet cannot be identified from the mint. Selling history needs an indexer (planned).');
  if (!holders || !supplyUi) return result('dev_holdings', 'Dev wallet', 'unknown', 'Could not read holders, so the dev wallet balance was not checked.');
  const held = devs.map((d) => ({ d, p: (holders.filter((h) => h.owner === d).reduce((n, h) => n + h.uiAmount, 0) / supplyUi) * 100 }));
  const worst = held.sort((a, b) => b.p - a.p)[0];
  const data = { wallet: worst.d, pct: Number(worst.p.toFixed(2)) };
  if (worst.p > 10) return result('dev_holdings', 'Dev wallet', 'fail', `The creator wallet ${short(worst.d)} still holds ${pct(worst.p)} of supply and could sell it at any time.`, { data });
  if (worst.p > 5) return result('dev_holdings', 'Dev wallet', 'warn', `The creator wallet ${short(worst.d)} holds ${pct(worst.p)} of supply.`, { data });
  return result('dev_holdings', 'Dev wallet', 'pass', `The creator wallet ${short(worst.d)} is not among the largest holders. Selling history is not checked yet.`, { data });
}

export function checkLiquidity(pairs) {
  if (pairs === null) return result('liquidity', 'Liquidity', 'unknown', 'Market data (DexScreener) was unreachable, so liquidity was not scored.');
  const total = pairs.reduce((n, p) => n + Number(p.liquidity?.usd || 0), 0);
  const data = { liquidityUsd: Math.round(total), pools: pairs.length };
  const lock = ' Whether it is locked or burned is not checked yet.';
  if (!pairs.length) return result('liquidity', 'Liquidity', 'fail', 'No trading pools found: you may not be able to sell this token.', { data });
  if (total < 5_000) return result('liquidity', 'Liquidity', 'fail', `Only ${usdFmt(total)} of liquidity across ${pairs.length} pool${pairs.length === 1 ? '' : 's'}: a small sell moves the price a lot.${lock}`, { data });
  if (total < 50_000) return result('liquidity', 'Liquidity', 'warn', `${usdFmt(total)} of liquidity across ${pairs.length} pool${pairs.length === 1 ? '' : 's'}: thin.${lock}`, { data });
  return result('liquidity', 'Liquidity', 'pass', `${usdFmt(total)} of liquidity across ${pairs.length} pool${pairs.length === 1 ? '' : 's'}.${lock}`, { data });
}

export function checkAgeActivity(pairs, nowMs) {
  if (pairs === null) return result('age_activity', 'Age and trading', 'unknown', 'Market data was unreachable, so age and trading were not scored.');
  const created = pairs.map((p) => Number(p.pairCreatedAt)).filter((n) => n > 0);
  if (!created.length) return result('age_activity', 'Age and trading', 'unknown', 'No trading history found to date this token.');
  const ageH = (nowMs - Math.min(...created)) / 3_600_000;
  const buys = pairs.reduce((n, p) => n + Number(p.txns?.h24?.buys || 0), 0);
  const sells = pairs.reduce((n, p) => n + Number(p.txns?.h24?.sells || 0), 0);
  const vol = pairs.reduce((n, p) => n + Number(p.volume?.h24 || 0), 0);
  const liq = pairs.reduce((n, p) => n + Number(p.liquidity?.usd || 0), 0);
  const age = ageH < 48 ? `${Math.max(1, Math.round(ageH))} hours` : `${Math.round(ageH / 24)} days`;
  const notes = [];
  let status = ageH < 24 ? 'fail' : ageH < 24 * 7 ? 'warn' : 'pass';
  if (buys + sells > 50 && sells > 3 * buys) {
    notes.push(`sells outnumber buys ${sells} to ${buys} in 24h`);
    if (status === 'pass') status = 'warn';
  }
  if (liq > 0 && vol / liq > 50) {
    notes.push('24h volume is over 50 times its liquidity, a sign of wash trading');
    if (status === 'pass') status = 'warn';
  }
  const lead = ageH < 24 ? `Only ${age} old: most rug pulls happen in the first hours.` : `First pool opened ${age} ago.`;
  return result('age_activity', 'Age and trading', status, `${lead}${notes.length ? ` Also, ${notes.join('; ')}.` : ''}`, { data: { ageHours: Math.round(ageH), buys24h: buys, sells24h: sells, volume24hUsd: Math.round(vol) } });
}

export function checkMetadata(meta, pairs) {
  const info = pairs?.find((p) => p.info)?.info;
  const hasSocials = Boolean(info && ((info.websites || []).length || (info.socials || []).length));
  const socials = pairs === null ? '' : hasSocials ? ' Website or socials are listed.' : ' No website or socials are listed.';
  if (meta === undefined) return result('metadata', 'Metadata', 'unknown', 'Could not read the token metadata right now.');
  if (!meta) return result('metadata', 'Metadata', 'warn', `No on-chain name or symbol found.${socials}`);
  if (meta.mutable) {
    return result('metadata', 'Metadata', hasSocials || pairs === null ? 'warn' : 'fail', `Mutable: the name, symbol and image can still be changed by ${short(meta.updateAuthority)}, which lets a token rebrand as a lookalike.${socials}`, { data: { mutable: true } });
  }
  return result('metadata', 'Metadata', hasSocials || pairs === null ? 'pass' : 'warn', `Locked: the name, symbol and image can no longer be changed.${socials}`, { data: { mutable: false } });
}

export function checkBundles() {
  return result('bundle_detection', 'Bundled launch', 'unknown', 'Not checked yet: spotting linked wallets buying in the first block needs launch transaction history (planned with Helius).');
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export function scoreChecks(checks) {
  const known = checks.filter((c) => c.status !== 'unknown');
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const knownW = known.reduce((n, c) => n + c.weight, 0);
  const lost = known.reduce((n, c) => n + c.weight * (c.status === 'fail' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  let score = knownW ? Math.round(100 * (1 - lost / knownW)) : 0;
  const critical = checks.some((c) => c.status === 'fail' && c.critical);
  if (critical) score = Math.min(score, 39); // an open mint, freeze or drain power is high risk on its own
  const level = score >= 70 ? 'low' : score >= 40 ? 'caution' : 'high';
  const coverage = total ? knownW / total : 0;
  return {
    score,
    level,
    verdict: level === 'low' ? 'Low risk' : level === 'caution' ? 'Caution' : 'High risk',
    confidence: coverage >= 0.85 ? 'high' : coverage >= 0.6 ? 'medium' : 'low',
    coveragePct: Math.round(coverage * 100),
  };
}

/* ------------------------------------------------------------------ */
/* On-chain readers                                                    */
/* ------------------------------------------------------------------ */

// Metaplex Token Metadata account (v1 layout): name, symbol, update authority, isMutable.
export function parseMetaplexMetadata(bytes, expectedMint) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  if (bytes[o] !== 4) return null; // Key::MetadataV1
  o += 1;
  const updateAuthority = encodeKey(bytes.subarray(o, o + 32));
  o += 32;
  const mint = encodeKey(bytes.subarray(o, o + 32));
  o += 32;
  if (expectedMint && mint !== expectedMint) return null;
  const str = () => {
    const len = dv.getUint32(o, true);
    o += 4;
    const s = new TextDecoder().decode(bytes.subarray(o, o + len)).replace(/\0/g, '').trim();
    o += len;
    return s;
  };
  const name = str();
  const symbol = str();
  str(); // uri: never fetched (untrusted, off-chain)
  o += 2; // seller fee basis points
  if (bytes[o++] === 1) o += 4 + dv.getUint32(o, true) * 34; // creators
  o += 1; // primary sale happened
  const mutable = bytes[o] === 1;
  return { name, symbol, updateAuthority, mutable, source: 'metaplex' };
}


async function classifyOwners(call, owners) {
  const unique = [...new Set(owners)];
  const res = await call('getMultipleAccounts', [unique, { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' }]);
  const kind = {};
  unique.forEach((o, i) => {
    const acct = res?.value?.[i];
    if (o === INCINERATOR) kind[o] = 'burn';
    else if (!isOnCurve(base58Decode(o))) kind[o] = 'program'; // PDA: a pool, bonding curve or locker
    else if (!acct || acct.owner === SYSTEM_PROGRAM) kind[o] = 'wallet';
    else kind[o] = 'program';
  });
  return kind;
}

export async function readHolders(call, mint) {
  const largest = await call('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
  const rows = (largest?.value || []).filter((r) => Number(r.uiAmount || r.uiAmountString || 0) > 0);
  if (!rows.length) return [];
  const accts = await call('getMultipleAccounts', [rows.map((r) => r.address), { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  const withOwner = rows
    .map((r, i) => ({ owner: accts?.value?.[i]?.data?.parsed?.info?.owner, uiAmount: Number(r.uiAmountString ?? r.uiAmount ?? 0) }))
    .filter((r) => r.owner);
  const kinds = await classifyOwners(call, withOwner.map((r) => r.owner));
  const byOwner = new Map();
  for (const r of withOwner) {
    const prev = byOwner.get(r.owner);
    byOwner.set(r.owner, { owner: r.owner, kind: kinds[r.owner] || 'wallet', uiAmount: (prev?.uiAmount || 0) + r.uiAmount });
  }
  return [...byOwner.values()];
}

// Minimal JSON-RPC caller (no dependencies), so the scanner runs anywhere.
export function jsonRpc(url, fetchImpl = fetch) {
  return async (method, params) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'RPC error');
    return json.result;
  };
}

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

export function createTokenScanner({ call, fetchImpl = fetch, now = Date.now, ttlMs = 5 * 60_000, dexBase = 'https://api.dexscreener.com' } = {}) {
  const cache = new Map();
  const remember = (key, ttl, fn) => {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.value;
    const value = fn();
    cache.set(key, { at: now(), value });
    Promise.resolve(value).catch(() => cache.delete(key)); // never cache failures
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return value;
  };

  // Runs BEFORE the paywall: is this a real token mint? If not, the caller is never charged.
  function inspectMint(mint) {
    return remember(`mint:${mint}`, 60_000, async () => {
      if (!isAddress(mint)) throw new HttpError(400, 'That is not a valid Solana address.');
      let acct;
      try {
        acct = (await call('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]))?.value;
      } catch {
        throw new HttpError(502, 'Could not reach the Solana RPC to look up this token. Try again shortly. You were not charged.');
      }
      if (!acct) throw new HttpError(404, 'Nothing exists at this address on this Solana network. Check the mint address. You were not charged.');
      if (![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(acct.owner)) throw new HttpError(400, 'This address is not a token mint (it looks like a wallet or a program). Paste the token’s mint address.');
      const parsed = acct.data?.parsed;
      if (parsed?.type === 'account') throw new HttpError(400, 'This is a token account, not the token itself. Paste the token’s mint address.');
      if (parsed?.type !== 'mint') throw new HttpError(400, 'This address is not a token mint.');
      return { program: acct.owner, info: parsed.info };
    });
  }

  async function readMetadata(mint, mintInfo) {
    const tm = (mintInfo.info.extensions || []).find((e) => e.extension === 'tokenMetadata')?.state;
    if (tm) return { name: tm.name, symbol: tm.symbol, updateAuthority: tm.updateAuthority || null, mutable: Boolean(tm.updateAuthority), source: 'token-2022' };
    const res = await call('getAccountInfo', [metadataAddress(mint), { encoding: 'base64', commitment: 'confirmed' }]);
    const b64 = res?.value?.data?.[0];
    if (!b64) return null;
    try {
      return parseMetaplexMetadata(new Uint8Array(Buffer.from(b64, 'base64')), mint);
    } catch {
      return null;
    }
  }

  async function readPairs(mint) {
    const res = await fetchImpl(`${dexBase}/tokens/v1/solana/${mint}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`DexScreener ${res.status}`);
    const body = await res.json();
    const list = Array.isArray(body) ? body : body?.pairs || [];
    return list.filter((p) => p?.chainId === 'solana' && (p.baseToken?.address === mint || p.quoteToken?.address === mint));
  }

  async function runScan(mint, mintInfo) {
    const issuer = KNOWN_ISSUERS[mint] || null;
    const settle = (p) => p.then((v) => v, () => undefined);
    const [holdersR, metaR, pairsR] = await Promise.all([settle(readHolders(call, mint)), settle(readMetadata(mint, mintInfo)), settle(readPairs(mint))]);
    const holders = holdersR ?? null;
    const pairs = pairsR ?? null;
    const decimals = Number(mintInfo.info.decimals || 0);
    const supplyUi = Number(mintInfo.info.supply || 0) / 10 ** decimals;

    const checks = [
      checkMintAuthority(mintInfo, issuer),
      checkFreezeAuthority(mintInfo, issuer),
      checkExtensions(mintInfo, issuer),
      checkConcentration(holders, supplyUi),
      issuer
        ? result('dev_holdings', 'Dev wallet', 'info', `Issued by ${issuer}; there is no anonymous dev wallet to track.`)
        : checkDevHoldings([mintInfo.info.mintAuthority, mintInfo.info.freezeAuthority, metaR?.updateAuthority], holders, supplyUi),
      checkLiquidity(pairs),
      checkAgeActivity(pairs, now()),
      checkMetadata(metaR, pairs),
      checkBundles(),
    ];
    const s = scoreChecks(checks);
    const best = pairs?.slice().sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];
    const side = best && (best.baseToken?.address === mint ? best.baseToken : best.quoteToken);
    const flags = checks.filter((c) => c.status === 'fail' || c.status === 'warn');
    return {
      mint,
      token: {
        name: metaR?.name || side?.name || null,
        symbol: metaR?.symbol || side?.symbol || null,
        program: mintInfo.program === TOKEN_2022_PROGRAM ? 'Token-2022' : 'SPL Token',
        decimals,
        supply: supplyUi,
        priceUsd: best && best.baseToken?.address === mint && best.priceUsd ? Number(best.priceUsd) : null,
        marketCapUsd: best && best.baseToken?.address === mint ? (best.marketCap ?? best.fdv ?? null) : null,
        issuer,
      },
      ...s,
      summary:
        s.level === 'low'
          ? `No major risk signals in ${checks.length - checks.filter((c) => c.status === 'unknown').length} checks.`
          : `${flags.length} risk signal${flags.length === 1 ? '' : 's'}: ${flags.slice(0, 3).map((f) => f.title.toLowerCase()).join(', ')}.`,
      checks,
      checkedAt: new Date(now()).toISOString(),
      sources: ['Solana RPC', pairs === null ? 'DexScreener (unreachable)' : 'DexScreener'],
      disclaimer: 'Risk signals from public on-chain and market data. Information, not financial advice, and not an accusation against any project.',
    };
  }

  return {
    inspectMint,
    scan: (mint, mintInfo) => remember(`scan:${mint}`, ttlMs, async () => runScan(mint, mintInfo || (await inspectMint(mint)))),
  };
}

// Small version for the agent's report and for the Claude prompt.
export const compactScan = (r) =>
  r && {
    mint: r.mint,
    token: r.token?.symbol || r.token?.name || null,
    score: r.score,
    verdict: r.verdict,
    confidence: r.confidence,
    flags: (r.checks || []).filter((c) => c.status === 'fail' || c.status === 'warn').map((c) => `${c.title}: ${c.detail}`),
  };
