import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleBasedPlan, planTask, extractiveReport, writeReport } from '../src/agent.js';
import { createServices } from '../src/services.js';

test('plans the right services for a mixed task', () => {
  const steps = ruleBasedPlan('Is https://phantom-airdrop-claim.secure-verify.xyz/connect-wallet safe, and what is SOL doing today?');
  assert.deepEqual(steps.map((s) => s.service), ['url-safety-scan', 'data-snapshot']);
  assert.equal(steps[0].input, 'https://phantom-airdrop-claim.secure-verify.xyz/connect-wallet');
});

test('detects JSON and plans nothing for unrelated chat', () => {
  assert.equal(ruleBasedPlan('check {"a": 1, "b": [1,2,],}')[0].service, 'json-validator');
  assert.equal(ruleBasedPlan('hello there').length, 0);
});

test('a real pre-purchase task buys a token scan, a link check and market data', () => {
  const steps = ruleBasedPlan('I am about to buy BONK (DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263). Is the token safe, what is its price doing today, and is this claim link someone sent me legit? https://bonk-airdrop-claim.secure-verify.xyz/connect-wallet');
  assert.deepEqual(steps.map((s) => s.service).sort(), ['data-snapshot', 'token-safety-scan', 'url-safety-scan']);
  assert.equal(steps.find((s) => s.service === 'token-safety-scan').input, 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
});

test('scans a known token by name only when asked about safety', () => {
  assert.equal(ruleBasedPlan('is JUP safe to hold?')[0].input, 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN');
  assert.ok(!ruleBasedPlan('what is the price of jup').some((s) => s.service === 'token-safety-scan'));
  assert.ok(!ruleBasedPlan('check https://example.com/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263').some((s) => s.service === 'token-safety-scan'), 'addresses inside links are not scanned');
});

test('report summarises a token scan without calling anything a scam', async () => {
  const scan = { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', token: { symbol: 'Bonk' }, score: 82, verdict: 'Low risk', confidence: 'high', checks: [{ title: 'Metadata', status: 'warn', detail: 'Mutable.' }] };
  const { answer, engine } = await writeReport('is bonk safe', [{ service: 'token-safety-scan', result: scan }], {});
  assert.equal(engine, 'rules');
  assert.match(answer, /Bonk .*82\/100, Low risk/);
  assert.match(answer, /Metadata: Mutable/);
});

test('planTask validates inputs and falls back to rules without a key', async () => {
  const { steps, engine } = await planTask('price of bitcoin and ethereum', createServices({ env: {} }), {});
  assert.equal(engine, 'rules');
  assert.equal(steps.length, 2);
});

test('report is built from results', () => {
  const text = extractiveReport([{ service: 'data-snapshot', result: { asset: { name: 'Solana', symbol: 'SOL' }, priceUsd: 150, change24hPct: -2 } }]);
  assert.match(text, /Solana \(SOL\) is \$150, down 2%/);
});
