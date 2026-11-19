import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  createTokenScanner, parseMetaplexMetadata, scoreChecks, checkExtensions, compactScan,
  TOKEN_PROGRAM, TOKEN_2022_PROGRAM,
} from '../src/tokenScan.js';
import { base58Encode, base58Decode, isOnCurve, metadataAddress, isAddress } from '../src/pda.js';

const SYSTEM = '11111111111111111111111111111111';
const RAYDIUM_AUTHORITY = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'; // a PDA: off the curve
const wallet = () => base58Encode(Buffer.from(generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' }).x, 'base64url'));
const NOW = Date.parse('2026-11-18T12:00:00Z');
const HOUR = 3_600_000;

function metaplexBytes({ updateAuthority, mint, name, symbol, mutable, creators = 0 }) {
  const parts = [Buffer.from([4]), Buffer.from(base58Decode(updateAuthority)), Buffer.from(base58Decode(mint))];
  const str = (s, pad) => {
    const b = Buffer.alloc(pad);
    b.write(s);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(pad);
    return Buffer.concat([len, b]);
  };
  parts.push(str(name, 32), str(symbol, 10), str('https://example.com/meta.json', 200), Buffer.from([0, 0]));
  if (creators) {
    const n = Buffer.alloc(4);
    n.writeUInt32LE(creators);
    parts.push(Buffer.from([1]), n, Buffer.alloc(34 * creators));
  } else parts.push(Buffer.from([0]));
  parts.push(Buffer.from([1]), Buffer.from([mutable ? 1 : 0]), Buffer.alloc(40));
  return Buffer.concat(parts);
}

// A fake Solana RPC + DexScreener for one token.
function world({ mint = wallet(), program = TOKEN_PROGRAM, info, holders = [], meta = null, pairs = [], rpcDown = false, dexDown = false }) {
  const tokenAccounts = holders.map(() => wallet());
  const call = async (method, params) => {
    if (rpcDown && method !== 'getAccountInfo') throw new Error('rate limited');
    if (method === 'getAccountInfo' && params[1].encoding === 'jsonParsed') {
      return { value: params[0] === mint ? { owner: program, data: { parsed: { type: 'mint', info } } } : null };
    }
    if (method === 'getAccountInfo') {
      if (rpcDown) throw new Error('rate limited');
      if (params[0] !== metadataAddress(mint) || !meta) return { value: null };
      return { value: { data: [metaplexBytes({ mint, ...meta }).toString('base64'), 'base64'] } };
    }
    if (method === 'getTokenLargestAccounts') return { value: holders.map((h, i) => ({ address: tokenAccounts[i], uiAmountString: String(h.amount) })) };
    if (method === 'getMultipleAccounts' && params[1].encoding === 'jsonParsed') {
      return { value: params[0].map((a) => ({ data: { parsed: { info: { owner: holders[tokenAccounts.indexOf(a)].owner } } } })) };
    }
    if (method === 'getMultipleAccounts') {
      return { value: params[0].map((o) => { const h = holders.find((x) => x.owner === o); return h?.programOwned ? { owner: 'SomeAmmProgram1111111111111111111111111111' } : { owner: SYSTEM }; }) };
    }
    throw new Error(`unexpected ${method}`);
  };
  const fetchImpl = async () => {
    if (dexDown) throw new Error('down');
    return { ok: true, json: async () => pairs.map((p) => ({ chainId: 'solana', baseToken: { address: mint, name: 'Test', symbol: 'TST' }, quoteToken: { address: 'So11111111111111111111111111111111111111112' }, ...p })) };
  };
  return { mint, scanner: createTokenScanner({ call, fetchImpl, now: () => NOW }) };
}

test('address helpers: base58 round trip, curve check, PDAs are off the curve', () => {
  const w = wallet();
  assert.equal(base58Encode(base58Decode(w)), w);
  assert.equal(isOnCurve(base58Decode(w)), true);
  assert.equal(isOnCurve(base58Decode(RAYDIUM_AUTHORITY)), false);
  assert.equal(isOnCurve(base58Decode(metadataAddress(w))), false);
  assert.equal(isAddress('not-an-address'), false);
  assert.equal(isAddress(w), true);
});

test('parses Metaplex metadata, with and without creators', () => {
  const mint = wallet();
  const ua = wallet();
  for (const creators of [0, 2]) {
    const m = parseMetaplexMetadata(new Uint8Array(metaplexBytes({ updateAuthority: ua, mint, name: 'Bonk', symbol: 'BONK', mutable: true, creators })), mint);
    assert.deepEqual([m.name, m.symbol, m.updateAuthority, m.mutable], ['Bonk', 'BONK', ua, true]);
  }
  assert.equal(parseMetaplexMetadata(new Uint8Array(metaplexBytes({ updateAuthority: ua, mint, name: 'x', symbol: 'x', mutable: false })), wallet()), null, 'rejects metadata for another mint');
});

test('a rug-shaped token scores High risk with reasons', async () => {
  const dev = wallet();
  const { mint, scanner } = world({
    info: { mintAuthority: dev, freezeAuthority: dev, supply: '1000000000000', decimals: 6 },
    holders: [{ owner: dev, amount: 600000 }, { owner: wallet(), amount: 50000 }, { owner: RAYDIUM_AUTHORITY, amount: 300000 }],
    meta: { updateAuthority: dev, name: 'Moon', symbol: 'MOON', mutable: true },
    pairs: [{ liquidity: { usd: 2100 }, pairCreatedAt: NOW - 3 * HOUR, txns: { h24: { buys: 20, sells: 90 } }, volume: { h24: 9000 } }],
  });
  const r = await scanner.scan(mint);
  assert.equal(r.verdict, 'High risk');
  assert.ok(r.score <= 39);
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by.mint_authority.status, 'fail');
  assert.equal(by.freeze_authority.status, 'fail');
  assert.equal(by.holder_concentration.status, 'fail');
  assert.equal(by.holder_concentration.data.excluded, 1, 'the pool PDA is excluded');
  assert.equal(by.dev_holdings.status, 'fail');
  assert.equal(by.liquidity.status, 'fail');
  assert.equal(by.age_activity.status, 'fail');
  assert.equal(by.metadata.status, 'fail', 'mutable with no socials');
  assert.equal(by.bundle_detection.status, 'unknown', 'never guesses');
  assert.equal(r.token.symbol, 'MOON');
  assert.doesNotMatch(JSON.stringify(r), /scam/i, 'never calls anything a scam');
  for (const c of r.checks) assert.ok(c.detail.length > 10 && c.detail.length < 260, `${c.id} has a one-sentence explanation`);
});

test('a healthy token scores Low risk', async () => {
  const holders = Array.from({ length: 15 }, () => ({ owner: wallet(), amount: 10000 }));
  holders.push({ owner: RAYDIUM_AUTHORITY, amount: 400000 });
  const { mint, scanner } = world({
    info: { mintAuthority: null, freezeAuthority: null, supply: '10000000000000', decimals: 6 },
    holders,
    meta: { updateAuthority: wallet(), name: 'Good', symbol: 'GOOD', mutable: false },
    pairs: [{ liquidity: { usd: 2_500_000 }, pairCreatedAt: NOW - 400 * 24 * HOUR, txns: { h24: { buys: 900, sells: 800 } }, volume: { h24: 3_000_000 }, priceUsd: '0.42', info: { websites: [{ url: 'https://good.xyz' }], socials: [] } }],
  });
  const r = await scanner.scan(mint);
  assert.equal(r.verdict, 'Low risk');
  assert.ok(r.score >= 90, `score ${r.score}`);
  assert.equal(r.confidence, 'high');
  assert.equal(r.token.priceUsd, 0.42);
});

test('regulated stablecoins are not falsely flagged for holding authorities', async () => {
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const circle = wallet();
  const { scanner } = world({
    mint: USDC,
    info: { mintAuthority: circle, freezeAuthority: circle, supply: '9000000000000000', decimals: 6 },
    holders: Array.from({ length: 12 }, () => ({ owner: wallet(), amount: 100000 })),
    meta: { updateAuthority: circle, name: 'USD Coin', symbol: 'USDC', mutable: true },
    pairs: [{ liquidity: { usd: 90_000_000 }, pairCreatedAt: NOW - 1500 * 24 * HOUR, info: { websites: [{ url: 'https://circle.com' }] } }],
  });
  const r = await scanner.scan(USDC);
  assert.notEqual(r.verdict, 'High risk');
  assert.equal(r.checks.find((c) => c.id === 'mint_authority').status, 'info');
  assert.match(r.checks.find((c) => c.id === 'freeze_authority').detail, /Circle/);
});

test('Token-2022 permanent delegate is a critical flag; small fees only warn', () => {
  const mk = (extensions) => ({ program: TOKEN_2022_PROGRAM, info: { extensions } });
  const pd = checkExtensions(mk([{ extension: 'permanentDelegate', state: { delegate: wallet() } }]));
  assert.equal(pd.status, 'fail');
  assert.equal(pd.critical, true);
  const fee = checkExtensions(mk([{ extension: 'transferFeeConfig', state: { newerTransferFee: { transferFeeBasisPoints: 100 } } }]));
  assert.equal(fee.status, 'warn');
  assert.match(fee.detail, /1% fee/);
  assert.equal(checkExtensions(mk([{ extension: 'metadataPointer', state: {} }])).status, 'pass');
  assert.equal(scoreChecks([{ ...pd, weight: 12 }, { id: 'x', status: 'pass', weight: 88 }]).verdict, 'High risk');
});

test('missing data is reported as unknown, never guessed, and the scan still completes', async () => {
  const { mint, scanner } = world({ info: { mintAuthority: null, freezeAuthority: null, supply: '100', decimals: 0 }, rpcDown: true, dexDown: true });
  const r = await scanner.scan(mint);
  const unknown = r.checks.filter((c) => c.status === 'unknown').map((c) => c.id);
  for (const id of ['holder_concentration', 'liquidity', 'age_activity', 'metadata', 'bundle_detection']) assert.ok(unknown.includes(id), id);
  assert.equal(r.confidence, 'low');
  assert.ok(r.sources.includes('DexScreener (unreachable)'));
});

test('inspectMint rejects bad input before any payment', async () => {
  const { mint, scanner } = world({ info: { mintAuthority: null, freezeAuthority: null, supply: '1', decimals: 0 } });
  assert.equal((await scanner.inspectMint(mint)).program, TOKEN_PROGRAM);
  await assert.rejects(scanner.inspectMint('hello'), (e) => e.status === 400);
  await assert.rejects(scanner.inspectMint(wallet()), (e) => e.status === 404);

  const walletAddr = wallet();
  const s2 = createTokenScanner({ call: async () => ({ value: { owner: SYSTEM, data: ['', 'base64'] } }), fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  await assert.rejects(s2.inspectMint(walletAddr), (e) => e.status === 400 && /not a token mint/.test(e.message));
  const s3 = createTokenScanner({ call: async () => ({ value: { owner: TOKEN_PROGRAM, data: { parsed: { type: 'account', info: {} } } } }) });
  await assert.rejects(s3.inspectMint(walletAddr), (e) => e.status === 400 && /token account/.test(e.message));
});

test('compactScan keeps only what an agent needs', async () => {
  const dev = wallet();
  const { mint, scanner } = world({ info: { mintAuthority: dev, freezeAuthority: null, supply: '1000', decimals: 0 }, holders: [{ owner: wallet(), amount: 5 }], pairs: [] });
  const c = compactScan(await scanner.scan(mint));
  assert.deepEqual(Object.keys(c).sort(), ['confidence', 'flags', 'mint', 'score', 'token', 'verdict']);
  assert.ok(c.flags.some((f) => /Mint authority/.test(f)));
});
