// Witiq front end: plain ES modules, no build step, hash routing (works on any static host).
import { initWallets, onWalletChange, snapshot as walletSnap, connectWallet, disconnectWallet, isMobile, phantomDeepLink as phantomBrowseLink } from './wallet.js';
// The phone wallet flow (and its crypto) loads only when needed, so the app still starts if it is unavailable.
const deeplink = () => import('./deeplink.js');
import { payWithWallet, preparePayment, submitPayment, forgePayment, PayError } from './x402-browser.js';
import { NET, setNet, explorerTxUrl, explorerAddrUrl, usdcLabel } from './netconfig.js';
import * as V from './voice-agent.js';
import { agentSupported, getAgentWallet, createAgentWallet, forgetAgentWallet, agentSign } from './agent-wallet.js';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (a, n = 4) => (a && a.length > 2 * n + 2 ? `${a.slice(0, n)}…${a.slice(-n)}` : a || '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usd = (n, d = 3) => `$${Number(n || 0).toFixed(d)}`;
const nf = (n, o = {}) => new Intl.NumberFormat('en-US', o).format(n);

/* ---------------- icons ---------------- */
const I = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  doc: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  sol: '<path d="M5 8h13l-2 2.5H3zM5 13.5h13l-2 2.5H3zM8 19h13l-2-2.5H6z"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n] || I.bolt}</svg>`;

/* ---------------- fallback catalogue (used only if the API cannot be reached) ---------------- */
const FALLBACK_SERVICES = [
  { id: 'token-safety-scan', name: 'Token Safety Scan', icon: 'shield', category: 'Security', description: 'Paste a Solana token address, get a 0–100 safety score.', price: '$0.01', priceUsd: 0.01, path: '/api/v1/token-safety-scan', param: 'mint', paramLabel: 'Token mint address', example: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', maxLen: 44, featured: true },
  { id: 'url-safety-scan', name: 'URL Safety Scan', icon: 'link', category: 'Security', description: 'Check if a link is safe, malicious or suspicious before you click.', price: '$0.005', priceUsd: 0.005, path: '/api/v1/url-safety-scan', param: 'url', paramLabel: 'URL to scan', example: 'https://phantom-airdrop-claim.secure-verify.xyz/connect-wallet', maxLen: 500 },
  { id: 'ai-summary', name: 'AI Summary', icon: 'doc', category: 'Writing', description: 'Get a clear, concise summary of any article or document.', price: '$0.008', priceUsd: 0.008, path: '/api/v1/ai-summary', param: 'text', paramLabel: 'Text to summarise', example: 'Solana is a high-performance blockchain known for fast confirmation and very low fees. x402 revives the HTTP 402 Payment Required status code so a client can pay for an API call inside the same request. Combined, they make tiny pay-per-use payments practical.', maxLen: 3000 },
  { id: 'data-snapshot', name: 'Data Snapshot', icon: 'db', category: 'Market data', description: 'Get a live market snapshot for any crypto asset: price, 24h change, volume and rank.', price: '$0.01', priceUsd: 0.01, path: '/api/v1/data-snapshot', param: 'asset', paramLabel: 'Crypto asset (name or symbol)', example: 'solana', maxLen: 60 },
  { id: 'json-validator', name: 'JSON Validator', icon: 'code', category: 'Developer tools', description: 'Validate and format JSON data with detailed error messages.', price: '$0.003', priceUsd: 0.003, path: '/api/v1/json-validator', param: 'json', paramLabel: 'JSON to validate', example: '{"name": "Witiq", "network": "solana", "services": [1, 2, 3],}', maxLen: 2000 },
];

/* ---------------- state ---------------- */
const state = { config: null, services: [], query: '', route: 'home', health: null, apiDown: false, wallet: walletSnap(), bal: null };
const KEY = 'witiq.history.v1';
const SEEN = 'witiq.seen.v1';
let memHistory = [];
const store = {
  get(k, fb) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fb;
    } catch {
      return k === KEY ? memHistory : fb;
    }
  },
  set(k, v) {
    if (k === KEY) memHistory = v;
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode: keep in memory only */
    }
  },
};
const history = () => store.get(KEY, []);
const addHistory = (e) => store.set(KEY, [{ at: new Date().toISOString(), ...e }, ...history()].slice(0, 100));

function totals() {
  const h = history();
  const paid = h.filter((e) => e.status === 'paid');
  const failed = h.filter((e) => e.status === 'failed');
  return {
    spent: paid.reduce((n, e) => n + (e.priceUsd || 0), 0),
    requests: h.length,
    paid: paid.length,
    failed: failed.length,
    rate: h.length ? (paid.length / h.length) * 100 : null,
  };
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText || 'Request failed'), { status: res.status });
  return body;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

const txLink = (sig) =>
  sig
    ? `<a class="mono" target="_blank" rel="noopener" href="${esc(explorerTxUrl(sig))}">${esc(short(sig, 6))} ↗</a> <a class="verify-link" href="#/receipt/${esc(sig)}">Verify</a>`
    : '<span class="muted">pending</span>';
const addrLink = (a) =>
  a ? `<a class="mono" target="_blank" rel="noopener" href="${esc(explorerAddrUrl(a))}">${esc(a)}</a>` : '<span class="muted">not set</span>';

/* ---------------- chrome (sidebar, status) ---------------- */
const NAV = [
  ['home', 'Home', 'home'],
  ['scanner', 'Token Scanner', 'shield'],
  ['services', 'Services', 'grid'],
  ['voice', 'Voice', 'mic'],
  ['agent', 'Agent', 'bolt'],
  ['proof', 'Payment Proof', 'receipt'],
  ['activity', 'Activity', 'clock'],
  ['wallet', 'Wallet', 'wallet'],
  ['developers', 'Developers', 'code'],
  ['analytics', 'Analytics', 'chart'],
  ['settings', 'Settings', 'gear'],
];

function paintChrome() {
  $('#nav').innerHTML = NAV.map(([id, label, ic]) => `<a href="#/${id}" data-route="${id}" ${state.route === id ? 'aria-current="page"' : ''} class="${state.route === id ? 'active' : ''}">${svg(ic)}${label}</a>`).join('');
  const c = state.config;
  const ok = Boolean(c?.configured);
  $('#net-dot').className = `dot ${ok ? 'on' : ''}`;
  $('#net-name').textContent = c?.cluster === 'devnet' ? 'Devnet' : c?.cluster === 'mainnet' ? 'Mainnet' : 'Solana';
  const badge = $('#net-badge');
  badge.textContent = ok ? 'Connected' : 'Setup needed';
  badge.className = `badge ${ok ? '' : 'off'}`;
  const w = state.wallet;
  $('#net-wallet').innerHTML = w.connected
    ? `<span class="chain">${w.icon ? `<img src="${esc(w.icon)}" alt="" />` : svg('sol')}</span><span><b class="wname">${esc(w.name)}</b><br><span class="mono">${esc(short(w.address))}</span></span><button class="copy" data-copy="${esc(w.address)}" aria-label="Copy wallet address">${svg('copy')}</button>`
    : `<button class="btn lime sm full" data-connect>${svg('wallet')}Connect wallet</button>`;
  $('#who-name').textContent = w.connected ? w.name : 'Guest';
  $('#who-addr').textContent = w.connected ? short(w.address, 4) : 'not connected';
  $('#avatar').innerHTML = w.connected && w.icon ? `<img src="${esc(w.icon)}" alt="" />` : w.connected ? esc(w.name[0]) : 'G';
  paintWalletSlot();
  const h = history();
  $('#ping').hidden = !(h[0] && h[0].at > store.get(SEEN, ''));
}

/* ---------------- wallet UI ---------------- */
function paintWalletSlot() {
  const w = state.wallet;
  const slot = $('#wallet-slot');
  if (!slot) return;
  slot.innerHTML = w.connected
    ? `<button class="wallet-pill" data-wallet-menu aria-label="Wallet menu"><span class="wp-dot"></span>${w.icon ? `<img src="${esc(w.icon)}" alt="" />` : ''}<span class="mono">${esc(short(w.address, 4))}</span><b>${state.bal ? `${nf(state.bal.usdc, { maximumFractionDigits: 3 })} USDC` : '…'}</b></button>`
    : `<button class="btn lime sm" data-connect>${svg('wallet')}<span class="hide-sm">Connect wallet</span><span class="show-sm">Connect</span></button>`;
}

async function refreshBalance() {
  const w = state.wallet;
  if (!w.connected) {
    state.bal = null;
    return paintWalletSlot();
  }
  try {
    state.bal = await api(`/api/wallet/${w.address}`);
  } catch {
    state.bal = null;
  }
  paintWalletSlot();
  if (state.route === 'wallet') fillWallet();
}

const BRAND = { Phantom: 'phantom', Solflare: 'solflare', Backpack: 'backpack' };

function openConnect() {
  const dlg = $('#connect');
  const list = walletSnap().wallets;
  for (const x of list) if (x.icon) rememberWalletIcon(x.name, x.icon);
  const mobile = isMobile();
  // Real wallet logos, best source first: the icon the wallet itself gave us on an earlier visit
  // (Wallet Standard), then the official file in /wallets/<name>.png, then a coloured letter.
  const tile = (name) => {
    const slug = BRAND[name] || name.toLowerCase();
    const seen = walletIcons()[name];
    const src = seen && /^data:image\/(png|svg\+xml|webp|jpeg);/.test(seen) ? seen : `/wallets/${slug}.png`;
    return `<span class="wtile ${slug}">${esc(name[0])}<img src="${esc(src)}" alt="" onerror="this.remove()" /></span>`;
  };
  let rows = '';
  if (list.length) {
    rows = list.map((x) => `<button class="wopt" data-pick="${esc(x.name)}">${x.icon ? `<img src="${esc(x.icon)}" alt="" />` : tile(x.name)}<span class="wn">${esc(x.name)}</span><span class="wgo">Connect</span></button>`).join('');
  } else if (mobile) {
    rows = ['Phantom', 'Solflare'].map((n) => `<button class="wopt" data-dl="${n}">${tile(n)}<span class="wn">${n}</span><span class="wgo">Connect</span></button>`).join('');
  } else {
    rows = [['Phantom', 'https://phantom.app/download'], ['Solflare', 'https://solflare.com/download'], ['Backpack', 'https://backpack.app/downloads']]
      .map(([n, u]) => `<a class="wopt" target="_blank" rel="noopener" href="${u}">${tile(n)}<span class="wn">${n}</span><span class="wgo">Get</span></a>`).join('');
  }
  const hint = list.length
    ? 'Choose your wallet to continue.'
    : mobile
      ? 'Tap your wallet. You approve in its app, then come straight back here.'
      : 'No wallet found in this browser. Install one, then reload this page.';
  dlg.innerHTML = `
    <div class="run-wrap">
      <div class="run-head"><div class="grow"><h2 id="connect-title">Connect wallet</h2><p>${hint}</p></div><button class="icon-btn" data-close-connect aria-label="Close">✕</button></div>
      <div class="run-body">
        <div class="wlist">${rows}</div>
        <div id="connect-err"></div>
        ${NET.testMoney
          ? `<details class="fine"><summary>Using test money? Setup tips</summary>
          <p>This copy of Witiq runs on Solana devnet. In Phantom turn on <i>Settings → Developer Settings → Testnet Mode</i>, then add free test USDC at <a target="_blank" rel="noopener" href="https://faucet.circle.com">faucet.circle.com</a>.</p>
        </details>`
          : `<details class="fine"><summary>What do I need?</summary>
          <p>Witiq runs on Solana mainnet with real USDC. Requests cost one cent or less, and the network fee is paid for you, so you need a little USDC and no SOL. Make sure your wallet is <b>not</b> in Testnet Mode.</p>
        </details>`}
        <p class="note center">Witiq never sees your keys. You approve every payment in your wallet.</p>
      </div>
    </div>`;
  if (!dlg.open) dlg.showModal();
}

async function doConnect(name) {
  const errBox = $('#connect-err');
  try {
    await connectWallet(name);
    $('#connect').close();
    toast(`Connected to ${name}`);
  } catch (err) {
    if (errBox) errBox.innerHTML = `<div class="callout"><b>Could not connect.</b> ${esc(err.message || 'Request was cancelled.')}</div>`;
  }
}

function walletMenu() {
  const w = state.wallet;
  const dlg = $('#connect');
  dlg.innerHTML = `
    <div class="run-wrap">
      <div class="run-head"><div class="chain big">${w.icon ? `<img src="${esc(w.icon)}" alt="" />` : svg('wallet')}</div><div class="grow"><h2 id="connect-title">${esc(w.name)}</h2><p class="mono">${esc(short(w.address, 8))}</p></div><button class="icon-btn" data-close-connect aria-label="Close">✕</button></div>
      <div class="run-body">
        <div class="grid-2">
          <div class="card bal"><div class="label">${NET.testMoney ? 'USDC (devnet)' : 'USDC'}</div><div class="value">${state.bal ? nf(state.bal.usdc, { maximumFractionDigits: 4 }) : '–'}</div></div>
          <div class="card bal"><div class="label">${NET.testMoney ? 'SOL (devnet)' : 'SOL'}</div><div class="value">${state.bal ? nf(state.bal.sol, { maximumFractionDigits: 4 }) : '–'}</div></div>
        </div>
        <div class="actions">
          <button class="btn ghost" data-copy="${esc(w.address)}">${svg('copy')}Copy address</button>
          <a class="btn ghost" target="_blank" rel="noopener" href="${esc(explorerAddrUrl(w.address))}">Explorer ↗</a>
          ${NET.testMoney ? '<a class="btn ghost" target="_blank" rel="noopener" href="https://faucet.circle.com">Get test USDC ↗</a>' : ''}
        </div>
        <div class="actions"><button class="btn danger" data-disconnect>Disconnect</button></div>
      </div>
    </div>`;
  dlg.showModal();
}

/* ---------------- setup checklist ---------------- */
function setupBanner() {
  const h = state.health;
  if (state.apiDown) return '<div class="callout"><b>Service temporarily unavailable.</b> We could not reach the Witiq API. Please refresh in a moment.</div>';
  if (!state.config?.configured) return '<div class="callout"><b>Payments are not available yet.</b> The merchant wallet has not been configured.</div>';
  if (h?.checks?.merchantAccount === false) return '<div class="callout"><b>Payments are being activated.</b> The payout account is not ready yet. Please check back shortly.</div>';
  if (h && h.checks && h.checks.facilitator === false) return '<div class="callout"><b>Payment network is slow to respond.</b> Payments may take longer than usual.</div>';
  return '';
}

/* ---------------- shared pieces ---------------- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function statsHtml() {
  const t = totals();
  const cards = [
    ['wallet', 'Total Spent', usd(t.spent), `<b>${t.paid}</b> settled payment${t.paid === 1 ? '' : 's'} (USDC)`],
    ['bolt', 'Requests Made', nf(t.requests), t.requests ? `<b>${t.paid}</b> unlocked, ${t.failed} rejected` : 'on this device'],
    ['grid', 'Active Services', state.services.length, `all live on ${esc(NET.name)}`],
    ['check', 'Success Rate', t.rate === null ? '–' : `${t.rate.toFixed(1)}%`, t.rate === null ? 'run a service to see this' : 'paid vs rejected'],
  ];
  return cards.map(([ic, label, value, hint]) => `<div class="card stat"><div class="ico">${svg(ic)}</div><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`).join('');
}

const svcCard = (s) => `
  <article class="svc">
    <div class="svc-top">
      <div class="ico">${svg(s.icon)}</div>
      <div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></div>
    </div>
    <div class="svc-foot">
      <div class="price"><span class="coin">$</span><span>${esc(s.price)} <small>USDC</small></span></div>
      <button class="btn lime sm" data-run="${esc(s.id)}">Pay &amp; Run</button>
    </div>
  </article>`;

function activityList(entries) {
  if (!entries.length) return '<div class="empty"><b>No activity yet</b>Run a service and it shows up here.</div>';
  return `<ul class="act">${entries
    .map((e) => {
      const s = state.services.find((x) => x.id === e.service);
      return `<li>
        <div class="ico" style="width:46px;height:46px">${svg(s?.icon || 'bolt')}</div>
        <div><div class="t">${esc(e.name || s?.name || e.service)}</div><div class="d">${e.status === 'paid' ? 'Unlocked 1 request' : 'Payment rejected'}</div></div>
        <div class="when"><span>${esc(ago(e.at))}</span><b>${usd(e.priceUsd)} USDC</b></div>
        <span class="pill ${e.status === 'paid' ? 'ok' : 'bad'}">${e.status === 'paid' ? 'Success' : 'Failed'}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

/* ---------------- pages ---------------- */
function solanaPanel() {
  return `
    <section class="card panel solana" aria-labelledby="why-sol">
      <div class="panel-head"><div><h2 id="why-sol">Solana is the access control</h2><p>There are no accounts or API keys here. A service unlocks only when a USDC transfer settles on Solana.</p></div><span class="live"><i></i>Live on ${esc(NET.id)}</span></div>
      <div class="sol-grid">
        <div class="sol-fact"><b id="sol-slot">–</b><span>current slot</span></div>
        <div class="sol-fact"><b id="sol-tps">–</b><span>transactions / sec</span></div>
        <div class="sol-fact"><b id="sol-time">–</b><span>average slot time</span></div>
        <div class="sol-fact"><b>$0.0008</b><span>base fee, paid by the facilitator, not you</span></div>
      </div>
      <ol class="sol-how">
        <li><b>402 Payment Required</b> The server answers with the price in USDC and the merchant’s Solana address.</li>
        <li><b>You sign a USDC transfer</b> Your own wallet signs an SPL-token transfer. No key ever leaves it.</li>
        <li><b>Settled on-chain</b> The facilitator verifies it, pays the fee and lands it on Solana in about a second.</li>
        <li><b>Result unlocked</b> The response carries the transaction signature, so every request has a public receipt.</li>
      </ol>
      <p class="note">Why not cards? A $0.005 request costs more in card fees than it earns. On Solana the fee is a fraction of a cent, so pay-per-request becomes viable.</p>
    </section>`;
}

async function fillSolana() {
  if (!$('#sol-slot')) return;
  try {
    const st = await api('/api/solana/stats');
    if (!$('#sol-slot')) return;
    $('#sol-slot').textContent = nf(st.slot);
    $('#sol-tps').textContent = st.tps == null ? '–' : nf(st.tps);
    $('#sol-time').textContent = st.slotTimeMs == null ? '–' : `${st.slotTimeMs} ms`;
  } catch {
    /* leave dashes */
  }
}

function pageHome() {
  const h = history().slice(0, 5);
  return `
    <div class="page-head">
      <div><h1>${greeting()}${state.wallet.connected ? '' : ', builder'}</h1><p class="sub">Pay for tools only when you need them.</p></div>
      ${state.wallet.connected ? '<a class="btn lime" href="#/wallet">' + svg('wallet') + 'My Wallet</a>' : '<button class="btn lime" data-connect>' + svg('wallet') + 'Connect Wallet</button>'}
    </div>
    ${setupBanner()}
    ${scanHero()}
    <section class="stats" style="margin-top:22px">${statsHtml()}</section>
    ${solanaPanel()}
    <div class="two">
      <section class="card panel">
        <div class="panel-head"><div><h2>Explore Services</h2><p>Choose a service, pay with USDC on Solana, and get results instantly.</p></div><a class="more" href="#/services">View all services ${svg('arrow')}</a></div>
        <div class="svc-grid">${state.services.map(svcCard).join('')}</div>
      </section>
      <section class="card panel">
        <div class="panel-head"><h2>Recent Activity</h2><a class="more" href="#/activity">View all ${svg('arrow')}</a></div>
        ${activityList(h)}
      </section>
    </div>`;
}

function pageServices() {
  const q = state.query.trim().toLowerCase();
  const list = q ? state.services.filter((s) => `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q)) : state.services;
  return `
    <div class="page-head"><div><h1>Services</h1><p class="sub">${q ? `${list.length} result${list.length === 1 ? '' : 's'} for “${esc(state.query.trim())}”` : 'Every tool is priced per request. No subscription.'}</p></div></div>
    ${setupBanner()}
    <div class="svc-grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))">${list.map(svcCard).join('') || '<div class="card empty"><b>No services match</b>Try “url”, “json” or “market”.</div>'}</div>`;
}

function pageActivity() {
  const h = history();
  const rows = h
    .map((e) => {
      const s = state.services.find((x) => x.id === e.service);
      return `<tr><td>${esc(new Date(e.at).toLocaleString())}</td><td>${esc(e.name || s?.name || e.service)}</td><td><span class="pill ${e.status === 'paid' ? 'ok' : 'bad'}">${e.status === 'paid' ? 'Success' : 'Failed'}</span></td><td class="num">${e.status === 'paid' ? usd(e.priceUsd) : '–'}</td><td>${e.status === 'paid' ? txLink(e.transaction) : ''}</td></tr>`;
    })
    .join('');
  return `
    <div class="page-head"><div><h1>Activity</h1><p class="sub">Your payments and results on this device.</p></div>${h.length ? '<button class="btn ghost" data-clear>Clear history</button>' : ''}</div>
    <section class="stats">${statsHtml()}</section>
    <div class="card panel table-wrap">${rows ? `<table><thead><tr><th>Time</th><th>Service</th><th>Status</th><th class="num">Amount</th><th>Transaction</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty"><b>No activity yet</b>Run a service from Home or Services.</div>'}</div>
    <p class="note" style="margin-top:12px">History is stored in this browser only. Settled payments link to their transaction on Solana Explorer.</p>`;
}

function pageWallet() {
  const w = state.wallet;
  if (!w.connected) {
    return `
      <div class="page-head"><div><h1>Wallet</h1><p class="sub">Connect your Solana wallet to pay for services.</p></div></div>
      <div class="card panel hero-connect">
        <div class="ico big">${svg('wallet')}</div>
        <h2>Pay from your own wallet</h2>
        <p class="note">Phantom, Solflare and Backpack are supported. You approve every payment in your wallet. Witiq never holds your funds or keys.</p>
        <div class="actions"><button class="btn lime" data-connect>${svg('wallet')}Connect wallet</button></div>
      </div>
      <div id="wallet-body"></div>`;
  }
  return `
    <div class="page-head"><div><h1>Wallet</h1><p class="sub">${esc(w.name)} · ${esc(short(w.address, 6))}</p></div><div class="actions"><button class="btn ghost" data-refresh-wallet>Refresh balances</button><button class="btn danger" data-disconnect>Disconnect</button></div></div>
    <div id="wallet-body"><div class="loading">Reading balances from ${esc(NET.name)}…</div></div>`;
}

async function fillWallet() {
  const el = $('#wallet-body');
  const w = state.wallet;
  if (!el || !w.connected) return;
  let mer = null;
  try {
    const x = await api('/api/wallet');
    mer = x.merchantBalances;
  } catch {
    /* optional */
  }
  if (!el.isConnected) return;
  const b = state.bal;
  const low = b && b.usdc < 0.05;
  el.innerHTML = `
    ${!b ? '<div class="callout"><b>Could not read balances.</b> The Solana RPC may be busy. Press Refresh in a moment.</div>' : ''}
    ${low ? `<div class="callout"><b>You need a little ${usdcLabel()} to pay.</b> ${fundsHelp()}</div>` : ''}
    <div class="grid-3">
      <div class="card bal"><div class="label">Your USDC</div><div class="value">${b ? nf(b.usdc, { maximumFractionDigits: 4 }) : '–'}</div><div class="note">pays for requests</div></div>
      <div class="card bal"><div class="label">Your SOL</div><div class="value">${b ? nf(b.sol, { maximumFractionDigits: 4 }) : '–'}</div><div class="note">not needed: the facilitator pays network fees</div></div>
      <div class="card bal"><div class="label">Merchant USDC received</div><div class="value">${mer ? nf(mer.usdc, { maximumFractionDigits: 4 }) : '–'}</div><div class="note">what Witiq services have earned</div></div>
    </div>
    <div class="card panel"><dl class="kv">
      <dt>Wallet</dt><dd>${addrLink(w.address)} <button class="copy" style="display:inline-grid;vertical-align:middle" data-copy="${esc(w.address)}" aria-label="Copy">${svg('copy')}</button></dd>
      <dt>Network</dt><dd>${esc(NET.name)} ${NET.testMoney ? '(test money only)' : '(real USDC)'}</dd>
      <dt>Token</dt><dd>USDC <span class="mono muted">${esc(short(NET.usdcMint, 4))}</span></dd>
    </dl>
    <p class="note" style="margin-top:16px">Each payment is a USDC transfer you sign. The maximum Witiq will ever ask for in one request is 0.05 USDC.</p></div>`;
}

const AGENT_EXAMPLES = [
  ['Before I buy a token', 'I am about to buy BONK (DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263). Is the token safe, what is its price doing today, and is this claim link someone sent me legit? https://bonk-airdrop-claim.secure-verify.xyz/connect-wallet'],
  ['Compare two tokens', 'Which is riskier to hold, JUP (JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN) or BONK (DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263)?'],
  ['Check a DM', 'Someone in Telegram says I won an airdrop at https://phantom-airdrop-claim.secure-verify.xyz/connect-wallet. Is it safe, and what is SOL trading at?'],
];
const AGENT_EXAMPLE = AGENT_EXAMPLES[0][1];
const agentState = { wallet: null, bal: null, supported: true, running: false };

function pageAgent() {
  return `
    <div class="page-head"><div><h1>Agent</h1><p class="sub">Give it a task. It buys the tools it needs, paying with its own wallet on Solana.</p></div></div>
    ${setupBanner()}
    <div id="agent-body"><div class="loading">Preparing the agent…</div></div>`;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function fillAgent() {
  const el = $('#agent-body');
  if (!el) return;
  try {
    agentState.supported = await withTimeout(agentSupported(), 4000).catch(() => false);
    agentState.wallet = agentState.supported ? await withTimeout(getAgentWallet(), 4000) : null;
    agentState.bal = null;
    if (agentState.wallet) {
      try {
        agentState.bal = await withTimeout(api(`/api/wallet/${agentState.wallet.address}`), 8000);
      } catch {
        /* balance shows as a dash */
      }
    }
    if (!el.isConnected) return;
    paintAgent();
  } catch (err) {
    if (el.isConnected) el.innerHTML = `<div class="callout"><b>The agent could not start.</b> ${esc(err.message || 'Unknown error')}. Reload the page, or try a current version of Safari or Chrome.</div>`;
  }
}

function paintAgent() {
  const el = $('#agent-body');
  if (!el) return;
  const w = agentState.wallet;
  const b = agentState.bal;
  if (!agentState.supported) {
    el.innerHTML = '<div class="callout"><b>The agent needs a newer browser.</b> Its wallet uses a security feature found in Safari 17+, Chrome and Edge. Update your browser, or open Witiq there.</div>';
    return;
  }
  if (!w) {
    el.innerHTML = `<div class="card panel hero-connect"><div class="ico big">${svg('bolt')}</div><h2>Create the agent’s wallet</h2>
      <p class="note">${NET.testMoney
        ? 'A small throwaway Solana wallet is created in this browser, for test money only. You fund it with free devnet USDC, and the agent spends from it by itself, capped per task. No key ever leaves your device.'
        : 'A small Solana wallet is created in this browser. You send it a few cents of USDC, and the agent spends from it by itself: at most 0.05 USDC per request and never more than your cap per task. Its key stays on this device, so treat it like pocket change: fund it with cents, not savings. Leftover USDC can only be spent on Witiq tools for now (there is no withdraw button yet).'}</p>
      <div class="actions"><button class="btn lime" data-agent-create>${svg('bolt')}Create agent wallet</button></div></div>`;
    return;
  }
  const funded = b && b.usdc >= 0.01;
  el.innerHTML = `
    <section class="card panel">
      <div class="panel-head"><div><h2>Agent wallet</h2><p>The agent pays from this wallet${NET.testMoney ? ' with test USDC' : ' with real USDC'}. You never paste a key anywhere.</p></div><span class="live"><i></i>${esc(NET.testMoney ? 'Devnet' : 'Mainnet')}</span></div>
      <div class="grid-3">
        <div class="card bal"><div class="label">Agent USDC</div><div class="value">${b ? nf(b.usdc, { maximumFractionDigits: 4 }) : '–'}</div><div class="note">its spending money</div></div>
        <div class="card bal"><div class="label">Spending cap per task</div><div class="value"><input id="agent-cap" class="cap" type="number" min="0.003" max="0.2" step="0.005" value="0.05" aria-label="Spending cap in USDC" /></div><div class="note">USDC, enforced before it buys</div></div>
        <div class="card bal"><div class="label">Address</div><div class="mono small">${esc(short(w.address, 8))}</div><div class="actions" style="margin-top:8px"><button class="btn ghost sm" data-copy="${esc(w.address)}">${svg('copy')}Copy</button>${NET.testMoney ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="https://faucet.circle.com">Get USDC ↗</a>' : `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(explorerAddrUrl(w.address))}">Explorer ↗</a>`}</div></div>
      </div>
      ${funded ? '' : NET.testMoney
        ? `<div class="callout"><b>The agent has no USDC yet.</b> Copy its address, open <a target="_blank" rel="noopener" href="https://faucet.circle.com">faucet.circle.com</a> (Solana, Devnet, USDC), paste the address and send. Then press Refresh.</div>`
        : `<div class="callout"><b>The agent has no USDC yet.</b> Copy its address and send it about <b>0.10 USDC</b> from Phantom or Solflare (Send → USDC → paste). That covers several tasks. Then press Refresh. No SOL is needed. Send cents only: there is no withdraw button yet.</div>`}
      <div class="actions"><button class="btn ghost sm" data-agent-refresh>Refresh balance</button><button class="btn danger sm" data-agent-reset>Discard wallet</button></div>
    </section>
    <section class="card panel" style="margin-top:22px">
      <h2 style="margin-bottom:10px">Task</h2>
      <div class="chips" style="margin-bottom:10px">${AGENT_EXAMPLES.map(([label], i) => `<button class="chip" data-agent-example="${i}">${esc(label)}</button>`).join('')}</div>
      <label class="field">What should the agent find out?<textarea id="agent-task" rows="4" maxlength="4000">${esc(AGENT_EXAMPLE)}</textarea></label>
      <div class="actions" style="margin-top:12px"><button class="btn lime" data-agent-run ${funded ? '' : 'disabled'}>${svg('bolt')}Run agent</button></div>
      <div class="flow" id="agent-flow" hidden></div>
    </section>`;
}

async function runAgent() {
  if (agentState.running) return;
  const task = $('#agent-task').value.trim();
  const cap = Math.max(0.003, Math.min(0.2, Number($('#agent-cap').value) || 0.05));
  const flow = $('#agent-flow');
  const btn = $('[data-agent-run]');
  const rows = [];
  const paint = (extra = '') => {
    flow.hidden = false;
    flow.innerHTML = rows.map((r, i) => `<div class="step ${r.status}"><div class="n">${r.status === 'done' ? '✓' : r.status === 'error' ? '✕' : i + 1}</div><div><div class="t">${esc(r.title)}</div><div class="d">${r.html || ''}</div></div></div>`).join('') + extra;
  };
  agentState.running = true;
  btn.disabled = true;
  rows.push({ status: 'active', title: 'Planning', html: 'Deciding which tools to buy…' });
  paint();
  try {
    const plan = await api('/api/agent/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    if (!plan.steps.length) {
      rows[0] = { status: 'error', title: 'Planning', html: 'None of the tools fit this task. Try pasting a token address, a link, a coin (like SOL), some JSON, or text to summarise.' };
      return paint();
    }
    // Spending cap: buy in order until the next tool would break the cap.
    const priced = plan.steps.map((st) => ({ ...st, svc: state.services.find((x) => x.id === st.service) })).filter((st) => st.svc);
    let spent = 0;
    const buy = [];
    const skipped = [];
    for (const st of priced) (spent + st.svc.priceUsd <= cap + 1e-9 ? (buy.push(st), (spent += st.svc.priceUsd)) : skipped.push(st));
    rows[0] = { status: 'done', title: 'Planning', html: `${buy.length} tool${buy.length === 1 ? '' : 's'} to buy for <b>${usd(spent)}</b> (cap ${usd(cap)}). Planned by ${plan.engine === 'claude' ? 'Claude' : 'keyword rules'}.${skipped.length ? ` <span class="err">Skipped ${skipped.length} to stay under the cap.</span>` : ''}` };
    paint();

    const results = [];
    let totalPaid = 0;
    for (const st of buy) {
      const i = rows.push({ status: 'active', title: `Buy: ${st.svc.name} (${st.svc.price})`, html: esc(st.why) }) - 1;
      paint();
      const url = new URL(st.svc.path, location.origin);
      url.searchParams.set(st.svc.param, st.input);
      try {
        const out = await payWithWallet({ url: url.toString(), payer: agentState.wallet.address, sign: agentSign, onStep: () => {} });
        const sig = out.settlement.transaction;
        results.push({ service: st.service, result: out.result.result });
        if (st.service === 'token-safety-scan') rememberScan(out.result.result, sig);
        totalPaid += st.svc.priceUsd;
        addHistory({ service: st.service, name: `Agent: ${st.svc.name}`, status: 'paid', priceUsd: st.svc.priceUsd, transaction: sig, payer: agentState.wallet.address });
        rows[i] = { status: 'done', title: `Bought: ${st.svc.name} (${st.svc.price})`, html: `${esc(st.why)}<br>Receipt ${txLink(sig)}` };
      } catch (err) {
        rows[i] = { status: 'error', title: `Could not buy: ${st.svc.name}`, html: `<span class="err">${esc(err.message)}</span> Nothing was charged for this step.${err.needFunds ? ` ${fundsHelp()}` : ''}` };
      }
      paint();
    }
    if (!results.length) return;

    const k = rows.push({ status: 'active', title: 'Answer', html: 'Writing the answer from what it bought…' }) - 1;
    paint();
    let report;
    try {
      report = await api('/api/agent/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, results }) });
    } catch {
      report = { answer: results.map((r) => JSON.stringify(r.result)).join('\n'), engine: 'raw' };
    }
    const scanCards = results.filter((r) => r.service === 'token-safety-scan' && r.result?.checks).map((r) => scanCard(r.result, { compact: true })).join('');
    rows[k] = { status: 'done', title: 'Answer', html: `<div class="result"><p style="white-space:pre-wrap">${esc(report.answer)}</p>${scanCards}<div class="chips"><span class="chip">Spent ${usd(totalPaid)} USDC</span><span class="chip">${results.length} on-chain receipt${results.length === 1 ? '' : 's'}</span><span class="chip">${report.engine === 'claude' ? 'Written by Claude' : 'Written from results'}</span></div></div>` };
    paint();
  } catch (err) {
    rows.push({ status: 'error', title: 'Agent stopped', html: `<span class="err">${esc(err.message)}</span>` });
    paint();
  } finally {
    agentState.running = false;
    btn.disabled = false;
    try {
      agentState.bal = await api(`/api/wallet/${agentState.wallet.address}`);
      const v = $('#agent-body .bal .value');
      if (v && agentState.bal) v.textContent = nf(agentState.bal.usdc, { maximumFractionDigits: 4 });
    } catch {
      /* ignore */
    }
  }
}

function pageReceipt() {
  const sig = location.hash.split('/')[2] || '';
  return `
    <div class="page-head"><div><h1>Verify a receipt</h1><p class="sub">Paste any transaction signature. Witiq checks it directly on Solana. No trust required.</p></div></div>
    <section class="card panel">
      <label class="field">Transaction signature<input id="rc-input" class="text-input" type="text" spellcheck="false" autocomplete="off" placeholder="Paste a signature from a Witiq payment" value="${esc(sig)}" /></label>
      <div class="actions" style="margin-top:12px"><button class="btn lime" data-verify>Verify on Solana</button></div>
      <div id="rc-body" style="margin-top:18px">${sig ? `<div class="loading">Checking ${esc(NET.name)}…</div>` : ''}</div>
    </section>`;
}

async function fillReceipt() {
  const sig = location.hash.split('/')[2] || '';
  const el = $('#rc-body');
  if (!el || !sig) return;
  try {
    const r = await api(`/api/receipt/${encodeURIComponent(sig)}`);
    if (!el.isConnected) return;
    if (!r.found) {
      el.innerHTML = `<div class="callout"><b>Transaction not found.</b> It may still be confirming, or it is not on ${esc(NET.name)}. Wait a few seconds and try again.</div>`;
      return;
    }
    const c = r.checks;
    const row = (ok, text) => `<li class="chk ${ok ? 'yes' : 'no'}"><span>${ok ? '✓' : '✕'}</span>${text}</li>`;
    el.innerHTML = `
      <ul class="checks">
        ${row(c.confirmedOnChain, c.confirmedOnChain ? `Confirmed on ${esc(NET.name)}` : `Transaction failed on-chain`)}
        ${row(c.isUsdcTransfer, 'A USDC transfer')}
        ${row(c.paidToWitiqMerchant, c.paidToWitiqMerchant ? 'Paid to the Witiq merchant wallet' : 'Not paid to the Witiq merchant wallet')}
        ${row(c.feeSponsoredByFacilitator, 'Network fee sponsored by the x402 facilitator (buyer needed no SOL)')}
      </ul>
      <dl class="kv" style="margin-top:14px">
        <dt>Amount</dt><dd>${r.amountUsdc == null ? '–' : `${nf(r.amountUsdc, { maximumFractionDigits: 6 })} USDC`}</dd>
        <dt>Payer</dt><dd>${r.payer ? addrLink(r.payer) : '–'}</dd>
        <dt>Merchant</dt><dd>${addrLink(r.merchant)}</dd>
        <dt>Time</dt><dd>${r.blockTime ? esc(new Date(r.blockTime).toLocaleString()) : '–'} · slot ${esc(nf(r.slot))}</dd>
        <dt>Network fee</dt><dd>${r.feeLamports == null ? '–' : `${esc(nf(r.feeLamports))} lamports, paid by ${r.feePayer ? esc(short(r.feePayer, 4)) : '–'}`}</dd>
      </dl>
      <div class="actions" style="margin-top:14px"><a class="btn ghost" target="_blank" rel="noopener" href="${esc(explorerTxUrl(sig))}">Open in Solana Explorer ↗</a></div>`;
  } catch (err) {
    if (el.isConnected) el.innerHTML = `<div class="callout"><b>Could not verify.</b> ${esc(err.message)}</div>`;
  }
}

function pageDevelopers() {
  const c = state.config || {};
  const rows = state.services.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="note">${esc(s.category)}</div></td><td class="mono">GET ${esc(s.path)}?${esc(s.param)}=</td><td class="num">${esc(s.price)}</td></tr>`).join('');
  return `
    <div class="page-head"><div><h1>Developers</h1><p class="sub">Publish an API, get paid per request in USDC. No billing system to build.</p></div></div>
    <section class="card panel"><div class="panel-head"><div><h2>Earnings, straight from Solana</h2><p>Read from the chain, not a database: every row is a real settled payment to the merchant wallet.</p></div><button class="btn ghost sm" data-refresh-earn>Refresh</button></div>
      <div id="earn-body"><div class="loading">Reading on-chain receipts…</div></div>
    </section>
    <section class="card panel" style="margin-top:22px"><div class="panel-head"><div><h2>Agent-ready</h2><p>Any AI agent can discover these tools and pay for them with x402. No sign-up, no API key.</p></div></div>
      <div class="actions"><a class="btn ghost" target="_blank" rel="noopener" href="/api/catalog">Machine-readable catalog ↗</a><a class="btn ghost" target="_blank" rel="noopener" href="/llms.txt">Agent instructions (llms.txt) ↗</a><a class="btn ghost" href="#/receipt">Verify a receipt</a></div>
    </section>
    <section class="card panel" style="margin-top:22px"><div class="panel-head"><h2>Your paid endpoints</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Service</th><th>Endpoint</th><th class="num">Price</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note" style="margin-top:12px">Merchant wallet: ${addrLink(c.payTo)}</p>
    </section>`;
}

async function fillEarnings() {
  const el = $('#earn-body');
  if (!el) return;
  try {
    const e = await api('/api/earnings');
    if (!el.isConnected) return;
    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:16px"><div class="card bal"><div class="label">Recent USDC received</div><div class="value">${nf(e.totalUsdc, { maximumFractionDigits: 4 })}</div><div class="note">last ${e.receipts.length} settled payments</div></div></div>
      ${e.receipts.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Payer</th><th class="num">Amount</th><th>Transaction</th></tr></thead><tbody>${e.receipts.map((r) => `<tr><td>${esc(r.blockTime ? new Date(r.blockTime).toLocaleString() : '–')}</td><td class="mono">${esc(short(r.payer || '', 4))}</td><td class="num">${usd(r.amountUsdc)}</td><td>${txLink(r.signature)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No payments yet</b>Run a service and the receipt appears here within seconds.</div>'}`;
  } catch (err) {
    if (el.isConnected) el.innerHTML = `<div class="callout"><b>Could not read receipts.</b> ${esc(err.message)}</div>`;
  }
}

function pageAnalytics() {
  const h = history();
  const per = state.services.map((s) => {
    const rows = h.filter((e) => e.service === s.id);
    const paid = rows.filter((e) => e.status === 'paid');
    return { s, paid: paid.length, failed: rows.length - paid.length, spend: paid.reduce((n, e) => n + (e.priceUsd || 0), 0) };
  });
  const maxPaid = Math.max(1, ...per.map((p) => p.paid));
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const spend = h.filter((e) => e.status === 'paid' && new Date(e.at) >= d && new Date(e.at) < next).reduce((n, e) => n + (e.priceUsd || 0), 0);
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), spend };
  });
  const maxDay = Math.max(0.001, ...days.map((d) => d.spend));
  return `
    <div class="page-head"><div><h1>Analytics</h1><p class="sub">Where your requests and spend go.</p></div></div>
    <section class="stats">${statsHtml()}</section>
    <div class="stack">
      <section class="card panel"><div class="panel-head"><h2>Spend, last 7 days</h2></div>
        <div class="cols">${days.map((d) => `<div class="col"><b>${d.spend ? usd(d.spend) : ''}</b><div class="stick ${d.spend ? '' : 'zero'}" style="height:${d.spend ? Math.max(6, (d.spend / maxDay) * 100) : 0}%"></div><span>${esc(d.label)}</span></div>`).join('')}</div>
      </section>
      <section class="card panel"><div class="panel-head"><h2>Requests by service</h2></div>
        <div class="bars">${per.map((p) => `<div class="bar-row"><span>${esc(p.s.name)}</span><div class="bar" title="${p.paid} settled, ${p.failed} rejected"><span style="width:${(p.paid / maxPaid) * 100}%"></span></div><span class="note">${p.paid} paid · ${usd(p.spend)}</span></div>`).join('')}</div>
      </section>
    </div>
    <p class="note" style="margin-top:12px">Based on payments made from this browser.</p>`;
}

function pageSettings() {
  const c = state.config || {};
  return `
    <div class="page-head"><div><h1>Settings</h1><p class="sub">How Witiq is wired to Solana.</p></div></div>
    <div class="stack">
      <section class="card panel"><div class="panel-head"><h2>Payments</h2></div><dl class="kv">
        <dt>Network</dt><dd>${esc(c.networkName || NET.name)} <span class="mono muted">${esc(c.network || '')}</span></dd>
        <dt>Protocol</dt><dd>x402 v2, scheme <span class="mono">${esc(c.scheme || 'exact')}</span>, paid in ${esc(c.asset || 'USDC')}</dd>
        <dt>Facilitator</dt><dd>${esc(c.facilitator || '')}</dd>
        <dt>Merchant wallet</dt><dd>${addrLink(c.payTo)}</dd>
        <dt>Summary engine</dt><dd>${c.aiEngine === 'claude' ? 'Claude' : 'Built-in summariser'}</dd>
        <dt>Status</dt><dd>${c.configured ? '<span class="ok-text">Live</span>' : '<span class="err">Payments unavailable</span>'}</dd>
        <dt>Facilitator reachable</dt><dd>${state.health?.checks?.facilitator == null ? '–' : state.health.checks.facilitator ? 'Yes' : '<span class="err">No</span>'}</dd>
        <dt>Quick demo</dt><dd>${state.health?.checks?.demoWallet ? 'Available' : 'Off'}</dd>
      </dl></section>
      <section class="card panel"><div class="panel-head"><h2>This device</h2></div>
        <p class="note" style="margin-bottom:14px">Your activity and analytics are kept in this browser's local storage. Nothing about you is stored on the server.</p>
        <div class="actions"><button class="btn danger" data-clear>Clear activity history</button></div>
      </section>
    </div>`;
}


/* ---------------- token scanner (roadmap phase 1) ---------------- */
const SCANS = 'witiq.scans.v1';
const ICONS = 'witiq.walleticons.v1';
const walletIcons = () => store.get(ICONS, {});
function rememberWalletIcon(name, icon) {
  if (typeof icon !== 'string' || icon.length > 60000 || walletIcons()[name] === icon) return;
  store.set(ICONS, { ...walletIcons(), [name]: icon });
}
const SCAN_EXAMPLES = [
  ['BONK', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'],
  ['JUP', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'],
  ['USDC', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
];
const SCAN_CHECKS = [
  ['Mint authority', 'Can someone still print new tokens?'],
  ['Freeze authority', 'Can the developer freeze your tokens so you cannot sell?'],
  ['Hidden transfer rules', 'Token-2022 fees, transfer hooks, permanent delegate, default freeze.'],
  ['Holder concentration', 'How much the top 10 wallets hold, with pools and burn addresses excluded.'],
  ['Dev wallet', 'How much the creator’s wallet still holds.'],
  ['Liquidity', 'How much money is in the trading pools.'],
  ['Age and trading', 'How old the token is, sell pressure and signs of wash trading.'],
  ['Metadata', 'Can the name and logo still be changed? Are socials listed?'],
  ['Bundled launch', 'Not checked yet; shown honestly as unknown.'],
];
const scanService = () => state.services.find((x) => x.id === 'token-safety-scan');
const scans = () => store.get(SCANS, []);
function rememberScan(r, sig) {
  if (!r?.mint || r.score == null) return;
  store.set(SCANS, [{ at: new Date().toISOString(), sig: sig || null, r }, ...scans().filter((x) => x.r.mint !== r.mint)].slice(0, 12));
}
const levelCls = (lvl) => (lvl === 'low' ? 'good' : lvl === 'caution' ? 'warn' : 'bad');
const CHECK_ICON = { pass: '✓', info: 'i', warn: '!', fail: '✕', unknown: '?' };
const tokenLabel = (r) => esc(r.token?.symbol || r.token?.name || short(r.mint, 4));

function scanCard(r, { compact = false } = {}) {
  const cls = levelCls(r.level);
  const head = `
    <div class="scan-card">
      <div class="score-ring ${cls}" style="--p:${Number(r.score) || 0}"><b>${esc(r.score)}</b><span>/100</span></div>
      <div class="scan-meta">
        <div class="headline ${cls}">${esc(r.verdict)}</div>
        <div class="tok">${tokenLabel(r)}${r.token?.name && r.token?.symbol ? ` · ${esc(r.token.name)}` : ''} <span class="mono muted">${esc(short(r.mint, 4))}</span></div>
        <p>${esc(r.summary)}</p>
        <div class="chips"><span class="chip">Confidence: ${esc(r.confidence)}</span><span class="chip">${esc(r.token?.program || '')}</span>${r.token?.priceUsd ? `<span class="chip">${money(r.token.priceUsd)}</span>` : ''}${r.token?.issuer ? '<span class="chip">Regulated issuer</span>' : ''}</div>
      </div>
    </div>`;
  if (compact) return head;
  return `${head}
    <ul class="scan-checks">${(r.checks || []).map((c) => `<li class="sc ${esc(c.status)}"><span class="sdot">${CHECK_ICON[c.status] || '?'}</span><div><b>${esc(c.title)}</b><p>${esc(c.detail)}</p></div></li>`).join('')}</ul>
    <p class="note">${esc(r.disclaimer || '')} Sources: ${esc((r.sources || []).join(', '))}. Checked ${esc(r.checkedAt ? new Date(r.checkedAt).toLocaleString() : 'now')}.</p>`;
}

function scanHero() {
  const s = scanService();
  return `
    <section class="card panel scan-hero" aria-labelledby="scan-h">
      <div class="panel-head"><div><h2 id="scan-h">${svg('shield')} Is this token safe?</h2><p>Paste any Solana token address. Get a 0–100 safety score with a reason for every check, paid per scan in USDC. No account.</p></div><span class="live"><i></i>${esc(s?.price || '$0.01')} per scan</span></div>
      <div class="scan-row"><input id="scan-input" class="text-input" type="text" spellcheck="false" autocomplete="off" maxlength="44" placeholder="Token mint address, e.g. DezXAZ8z…B263" /><button class="btn lime" data-scan>${svg('shield')}Scan</button></div>
      <div class="chips" style="margin-top:10px"><span class="note">Try:</span>${SCAN_EXAMPLES.map(([n, m]) => `<button class="chip" data-scan-example="${esc(m)}">${esc(n)}</button>`).join('')}</div>
    </section>`;
}

function pageScanner() {
  const recent = scans();
  return `
    <div class="page-head"><div><h1>Token Safety Scanner</h1><p class="sub">The first agent on Witiq. Paste a token address, get a clear safety score in seconds.</p></div></div>
    ${setupBanner()}
    ${scanHero()}
    <div class="two" style="margin-top:22px">
      <section class="card panel"><div class="panel-head"><h2>What it checks</h2></div>
        <ol class="checklist">${SCAN_CHECKS.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>
        <p class="note" style="margin-top:12px">You pay only if the address is a real token mint and the payment settles. A wallet address, a typo or a token account is rejected before the paywall, free. Scores are information, not financial advice, and never an accusation against a project.</p>
      </section>
      <section class="card panel"><div class="panel-head"><h2>Your recent scans</h2></div>
        ${recent.length
          ? `<ul class="act">${recent.map((x, i) => `<li class="scan-li" data-scan-view="${i}"><div class="score-ring sm ${levelCls(x.r.level)}" style="--p:${Number(x.r.score) || 0}"><b>${esc(x.r.score)}</b></div><div><div class="t">${tokenLabel(x.r)}</div><div class="d">${esc(x.r.verdict)} · ${esc(ago(x.at))}</div></div><span class="pill ${x.r.level === 'low' ? 'ok' : 'bad'}">View</span></li>`).join('')}</ul>`
          : '<div class="empty"><b>No scans yet</b>Scan a token and it is saved here, on this device only.</div>'}
      </section>
    </div>`;
}

function startScan() {
  const v = ($('#scan-input')?.value || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) {
    toast('Paste a Solana token mint address (32 to 44 letters and numbers).');
    $('#scan-input')?.focus();
    return;
  }
  openRun('token-safety-scan', v);
}

function viewScan(i) {
  const x = scans()[i];
  if (!x) return;
  const dlg = $('#run');
  dlg.dataset.id = '';
  dlg.innerHTML = `<div class="run-wrap"><div class="run-head"><div class="ico">${svg('shield')}</div><div class="grow"><h2 id="run-title">${tokenLabel(x.r)} safety scan</h2><p>${esc(new Date(x.at).toLocaleString())}${x.sig ? ` · receipt ${txLink(x.sig)}` : ''}</p></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="run-body"><div class="result">${scanCard(x.r)}</div><div class="actions"><button class="btn ghost" data-scan-again="${esc(x.r.mint)}">Scan again (fresh data)</button></div></div></div>`;
  if (!dlg.open) dlg.showModal();
}

/* ---------------- payment proof (judges' tip: failure next to success) ---------------- */
const proof = { forged: null, real: null, busy: false };
const PROOF_MINT = SCAN_EXAMPLES[0][1];

function pageProof() {
  const w = state.wallet;
  const s = scanService();
  return `
    <div class="page-head"><div><h1>Payment proof</h1><p class="sub">A forged or cancelled payment gets nothing and costs nothing. A real one gets the result and a public Solana receipt. Your USDC balance is read from the chain before and after each.</p></div></div>
    ${setupBanner()}
    ${w.connected ? '' : `<div class="callout"><b>Connect a wallet to see balances and make the real purchase.</b> The forged payment works without one. <button class="btn lime sm" data-connect style="margin-left:8px">Connect wallet</button></div>`}
    ${w.mode === 'deeplink' ? `<div class="callout"><b>On a phone?</b> The real purchase on this page needs the wallet inside the browser. Open Witiq in <a href="${esc(phantomBrowseLink())}">Phantom’s browser</a>, or use the Token Scanner, which returns from your wallet app automatically.</div>` : ''}
    <div class="proof-grid">
      <section class="card panel proof bad">
        <div class="panel-head"><div><h2>1. Forged payment</h2><p>Sends a well-formed x402 payment whose transaction is random bytes, to the same paid endpoint.</p></div></div>
        <div class="actions"><button class="btn danger" data-proof="forged">Send forged payment</button></div>
        <div id="proof-forged" class="flow"></div>
      </section>
      <section class="card panel proof good">
        <div class="panel-head"><div><h2>2. Real purchase</h2><p>Buys one Token Safety Scan of BONK for ${esc(s?.price || '$0.01')} with your wallet. Reject it in your wallet to see a cancelled payment instead.</p></div></div>
        <div class="actions"><button class="btn lime" data-proof="real" ${w.connected && w.mode !== 'deeplink' ? '' : 'disabled'}>${svg('wallet')}Pay ${esc(s?.price || '$0.01')} and scan</button></div>
        <div id="proof-real" class="flow"></div>
      </section>
    </div>
    <section class="card panel" style="margin-top:22px"><div class="panel-head"><div><h2>Side by side</h2><p>Every number below comes from the server response or from Solana itself.</p></div></div>
      <div class="table-wrap" id="proof-table">${proofTable()}</div>
    </section>`;
}

function proofTable() {
  const f = proof.forged;
  const r = proof.real;
  const bal = (n) => (n == null ? '–' : `${nf(n, { maximumFractionDigits: 6 })} USDC`);
  const charged = (x) => (!x || x.before == null || x.after == null ? '–' : x.before - x.after > 1e-9 ? `<b class="err">${nf(x.before - x.after, { maximumFractionDigits: 6 })} USDC</b>` : '<b class="ok-text">0 USDC</b>');
  const row = (label, a, b) => `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`;
  return `<table><thead><tr><th></th><th>Forged payment</th><th>${r?.cancelled ? 'Cancelled in wallet' : 'Real purchase'}</th></tr></thead><tbody>
    ${row('HTTP status', f ? `<span class="mono">${esc(f.status)}</span>` : '–', r ? `<span class="mono">${esc(r.status ?? '–')}</span>` : '–')}
    ${row('Result delivered', f ? (f.delivered ? '<b class="err">Yes</b>' : '<b class="ok-text">No</b>') : '–', r ? (r.delivered ? '<b class="ok-text">Yes</b>' : 'No') : '–')}
    ${row('USDC before', bal(f?.before), bal(r?.before))}
    ${row('USDC after', bal(f?.after), bal(r?.after))}
    ${row('Charged', charged(f), charged(r))}
    ${row('Solana transaction', f ? 'None: nothing was sent to the chain' : '–', r ? (r.tx ? txLink(r.tx) : 'None') : '–')}
  </tbody></table>`;
}

async function usdcOf(address) {
  if (!address) return null;
  try {
    return (await api(`/api/wallet/${address}`)).usdc;
  } catch {
    return null;
  }
}
// Waits for the balance to change after a settled payment (RPC nodes can lag a moment).
async function usdcAfter(address, before, expectChange) {
  let v = await usdcOf(address);
  for (let i = 0; expectChange && i < 4 && v != null && before != null && Math.abs(v - before) < 1e-9; i++) {
    await sleep(1500);
    v = await usdcOf(address);
  }
  return v;
}

async function runProof(kind) {
  if (proof.busy) return;
  const s = scanService();
  if (!s) return toast('The scanner service is not available.');
  proof.busy = true;
  document.querySelectorAll('[data-proof]').forEach((b) => (b.disabled = true));
  const box = $(`#proof-${kind}`);
  const line = (cls, html) => `<div class="step ${cls}"><div class="n">${cls === 'done' ? '✓' : cls === 'error' ? '✕' : '…'}</div><div><div class="d">${html}</div></div></div>`;
  const url = new URL(s.path, location.origin);
  url.searchParams.set(s.param, PROOF_MINT);
  const addr = state.wallet.connected ? state.wallet.address : null;
  try {
    box.innerHTML = line('active', 'Reading your USDC balance from Solana…');
    const before = await usdcOf(addr);
    if (kind === 'forged') {
      box.innerHTML = line('active', 'Sending a forged payment…');
      const out = await forgePayment(url.toString());
      const after = await usdcAfter(addr, before, false);
      proof.forged = { ...out, before, after };
      box.innerHTML =
        line(out.delivered ? 'error' : 'done', `Server answered <code>HTTP ${esc(out.status)}</code>${out.error ? `: ${esc(out.error)}` : ''}.`) +
        line(out.delivered ? 'error' : 'done', out.delivered ? 'A result was delivered. This should never happen.' : 'No result was delivered. No transaction reached Solana.') +
        line('done', addr ? `Balance ${nf(before ?? 0, { maximumFractionDigits: 6 })} → ${nf(after ?? 0, { maximumFractionDigits: 6 })} USDC.` : 'Connect a wallet to also see your balance stay the same.');
      addHistory({ service: s.id, name: `Proof: forged payment`, status: 'failed', priceUsd: s.priceUsd, transaction: null });
    } else {
      box.innerHTML = line('active', 'Approve the payment in your wallet…');
      try {
        const out = await payWithWallet({ url: url.toString(), payer: addr, onStep: () => {} });
        const sig = out.settlement.transaction;
        box.innerHTML = line('active', 'Settled. Reading your new balance from Solana…');
        const after = await usdcAfter(addr, before, true);
        proof.real = { status: 200, delivered: true, tx: sig, before, after };
        rememberScan(out.result.result, sig);
        addHistory({ service: s.id, name: s.name, status: 'paid', priceUsd: s.priceUsd, transaction: sig, payer: addr });
        box.innerHTML = line('done', `Paid and settled on ${esc(NET.name)}. Receipt ${txLink(sig)}`) + `<div class="result">${scanCard(out.result.result, { compact: true })}</div>`;
      } catch (err) {
        const after = await usdcAfter(addr, before, false);
        const cancelled = err instanceof PayError && err.stage === 'rejected';
        proof.real = { status: err.status ?? (cancelled ? 'not sent' : 'error'), delivered: false, tx: null, before, after, cancelled };
        box.innerHTML = line('error', esc(err.message || 'Payment failed')) + line('done', `Nothing was delivered. Balance ${nf(before ?? 0, { maximumFractionDigits: 6 })} → ${nf(after ?? 0, { maximumFractionDigits: 6 })} USDC.${err.needFunds ? ` ${fundsHelp()}` : ''}`);
      }
    }
  } catch (err) {
    box.innerHTML = line('error', esc(err.message || 'Something went wrong'));
  } finally {
    proof.busy = false;
    document.querySelectorAll('[data-proof]').forEach((b) => (b.disabled = b.dataset.proof === 'real' && (!state.wallet.connected || state.wallet.mode === 'deeplink')));
    const t = $('#proof-table');
    if (t) t.innerHTML = proofTable();
    paintChrome();
    refreshBalance();
  }
}


/* ---------------- voice agent ---------------- */
// Read-only voice agent. It answers, opens pages, reads balances and past scans for free. Anything
// paid becomes a card the user approves; the payment then goes through their own wallet as usual.
const VLOG = 'witiq.voice.log.v1';
const VAWAIT = 'witiq.voice.await.v1';
const VNATURAL = 'witiq.voice.natural.v1';
const vs = { phase: 'idle', interim: '', stopListening: null, status: null };
const vlog = () => {
  try {
    return JSON.parse(sessionStorage.getItem(VLOG) || '[]');
  } catch {
    return [];
  }
};
const vsave = (log) => {
  try {
    sessionStorage.setItem(VLOG, JSON.stringify(log.slice(-30)));
  } catch {
    /* full or private mode */
  }
};
const vpush = (entry) => {
  const log = vlog();
  log.push({ at: Date.now(), ...entry });
  vsave(log);
  return log.length - 1;
};
const vupdate = (i, patch) => {
  const log = vlog();
  if (!log[i]) return;
  log[i] = { ...log[i], ...patch };
  vsave(log);
};
const naturalOn = () => store.get(VNATURAL, true);
const agentName = () => vs.status?.name || 'J';

const VOICE_HINTS = ['Is BONK safe?', 'What is SOL trading at?', 'Is this link safe? https://phantom-airdrop-claim.secure-verify.xyz', 'What is my balance?'];

function pageVoice() {
  return `
    <div class="page-head"><div><h1>Talk to ${esc(agentName())}</h1><p class="sub">Ask out loud if a token or a link is safe, or what a coin is doing. ${esc(agentName())} never spends money without your approval.</p></div></div>
    <section class="card panel voice-panel">
      <div class="voice-stage">
        <button class="orb ${esc(vs.phase)}" data-voice-mic aria-label="${vs.phase === 'listening' ? 'Stop listening' : vs.phase === 'speaking' ? 'Stop speaking' : 'Tap to talk'}">
          <span class="orb-ring"></span><span class="orb-ring r2"></span>${svg(vs.phase === 'speaking' ? 'stop' : 'mic')}
        </button>
        <div id="voice-state" class="voice-state">${esc(voiceStateText())}</div>
        <div id="voice-interim" class="voice-interim">${esc(vs.interim)}</div>
      </div>
      <div id="voice-log" class="voice-log">${voiceLogHtml()}</div>
      <form class="voice-input" data-voice-form autocomplete="off">
        <input id="voice-text" class="text-input" type="text" maxlength="500" placeholder="Or type, or paste a token address" />
        <button class="btn lime" type="submit">Send</button>
      </form>
      <div class="voice-opts">
        <label class="toggle"><input type="checkbox" id="voice-natural" ${naturalOn() ? 'checked' : ''} /> Natural voice</label>
        ${vlog().length ? '<button class="btn ghost sm" data-voice-clear>Clear</button>' : ''}
      </div>
    </section>`;
}

function voiceStateText() {
  if (vs.phase === 'listening') return 'Listening…';
  if (vs.phase === 'thinking') return 'Thinking…';
  if (vs.phase === 'speaking') return 'Speaking. Tap to stop.';
  return V.canListen() ? 'Tap to talk' : 'Voice input is not available in this browser. Type below.';
}

function voiceLogHtml() {
  const log = vlog();
  if (!log.length) {
    return `<div class="voice-empty"><p>Try saying:</p><div class="chips">${VOICE_HINTS.map((h, i) => `<button class="chip" data-voice-hint="${i}">${esc(h.length > 34 ? `${h.slice(0, 32)}…` : h)}</button>`).join('')}</div></div>`;
  }
  return log
    .map((m, i) => {
      if (m.role === 'user') return `<div class="vb user"><p>${esc(m.text)}</p></div>`;
      let extra = '';
      const a = m.action;
      if (a?.type === 'paid') {
        if (m.status === 'offer') {
          extra = `<div class="voffer"><div><b>${esc(a.serviceName)}</b><span class="mono">${esc(a.input.length > 30 ? short(a.input, 6) : a.input)}</span></div><div class="actions"><button class="btn lime sm" data-voice-approve="${i}">${svg('wallet')}Approve ${esc(a.price)}</button><button class="btn ghost sm" data-voice-decline="${i}">No thanks</button></div></div>`;
        } else if (m.status === 'paying') extra = '<p class="note">Waiting for your wallet…</p>';
        else if (m.status === 'away') extra = '<p class="note">Approve in your wallet app. The result will appear here when you come back.</p>';
        else if (m.status === 'declined') extra = '<p class="note">Skipped. Nothing was charged.</p>';
        else if (m.status === 'failed') extra = `<p class="note err">${esc(m.error || 'Payment failed')}. Nothing was charged.</p>`;
      }
      if (m.result && m.service === 'token-safety-scan') extra += `<div class="result">${scanCard(m.result, { compact: true })}</div>`;
      if (m.tx) extra += `<p class="note">Receipt ${txLink(m.tx)}</p>`;
      const hear = m.unspoken ? `<button class="btn ghost sm" data-voice-hear="${i}">${svg('mic')}Hear it</button>` : '';
      return `<div class="vb agent"><p>${esc(m.text)}</p>${extra}${hear}</div>`;
    })
    .join('');
}

function paintVoice() {
  if (state.route !== 'voice') return;
  const orb = $('[data-voice-mic]');
  if (orb) {
    orb.className = `orb ${vs.phase}`;
    orb.innerHTML = `<span class="orb-ring"></span><span class="orb-ring r2"></span>${svg(vs.phase === 'speaking' ? 'stop' : 'mic')}`;
  }
  const st = $('#voice-state');
  if (st) st.textContent = voiceStateText();
  const im = $('#voice-interim');
  if (im) im.textContent = vs.interim;
  const lg = $('#voice-log');
  if (lg) {
    lg.innerHTML = voiceLogHtml();
    lg.scrollTop = lg.scrollHeight;
  }
}

async function fillVoice() {
  if (!vs.status) {
    try {
      vs.status = await api('/api/voice/status');
    } catch {
      vs.status = { name: 'J', brain: 'rules', naturalVoice: false };
    }
    if (state.route === 'voice') {
      const h = $('.page-head h1');
      if (h) h.textContent = `Talk to ${agentName()}`;
    }
  }
  paintVoice();
}

async function voiceSay(text, i) {
  vs.phase = 'speaking';
  paintVoice();
  const how = await V.say(text, { natural: naturalOn() && vs.status?.naturalVoice !== false });
  if (i != null && how !== 'stopped') vupdate(i, { unspoken: false });
  if (vs.phase === 'speaking') vs.phase = 'idle';
  paintVoice();
}

function voiceMic() {
  V.unlock(); // must run inside the tap, so phones allow sound later
  if (vs.phase === 'speaking') {
    V.stop();
    vs.phase = 'idle';
    return paintVoice();
  }
  if (vs.phase === 'listening') {
    vs.stopListening?.();
    return;
  }
  if (vs.phase === 'thinking') return;
  if (!V.canListen()) {
    toast('This browser cannot listen. Type your question instead.');
    $('#voice-text')?.focus();
    return;
  }
  vs.phase = 'listening';
  vs.interim = '';
  paintVoice();
  vs.stopListening = V.listen({
    onInterim: (t) => {
      vs.interim = t;
      const im = $('#voice-interim');
      if (im) im.textContent = t;
    },
    onFinal: (t) => voiceAsk(t),
    onEnd: (got) => {
      vs.stopListening = null;
      vs.interim = '';
      if (!got && vs.phase === 'listening') vs.phase = 'idle';
      paintVoice();
    },
    onError: (err) => {
      vs.phase = 'idle';
      vs.interim = '';
      paintVoice();
      toast(
        err === 'not-allowed' || err === 'service-not-allowed'
          ? 'Microphone access is off. Allow it for this site (on iPhone, also turn on Siri & Dictation), or type instead.'
          : 'I could not hear that. Try again, or type instead.',
      );
    },
  });
}

async function voiceAsk(text) {
  text = String(text || '').trim().slice(0, 500);
  if (!text) return;
  V.unlock();
  vpush({ role: 'user', text });
  vs.phase = 'thinking';
  vs.interim = '';
  paintVoice();
  const history = vlog()
    .slice(-7, -1)
    .map((m) => ({ role: m.role, text: m.text }));
  let out;
  try {
    out = await api('/api/voice/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, history }) });
  } catch (err) {
    out = { say: err.message || 'I could not reach the server. Try again in a moment.', action: null };
  }
  const a = out.action;
  if (a?.type === 'free') return voiceFree(out.say, a);
  const i = vpush({ role: 'agent', text: out.say, action: a || null, status: a?.type === 'paid' ? 'offer' : null, unspoken: true });
  paintVoice();
  await voiceSay(out.say, i);
}

async function voiceFree(sayFirst, a) {
  let text = sayFirst;
  if (a.name === 'balance') {
    if (!state.wallet.connected) text = 'Connect your wallet first, then ask me again.';
    else {
      try {
        const b = await api(`/api/wallet/${state.wallet.address}`);
        text = `You have ${nf(b.usdc ?? 0, { maximumFractionDigits: 2 })} USDC and ${nf(b.sol ?? 0, { maximumFractionDigits: 3 })} SOL.`;
      } catch {
        text = 'I could not read your balance right now. Try again in a moment.';
      }
    }
  } else if (a.name === 'recent_scans') {
    const list = scans().slice(0, 3);
    text = list.length ? `Your last scans: ${list.map((x) => `${x.r.token?.symbol || x.r.token?.name || 'a token'} scored ${x.r.score}`).join(', ')}.` : 'You have not scanned any tokens yet. Paste an address or ask about BONK.';
  }
  const i = vpush({ role: 'agent', text, unspoken: true });
  paintVoice();
  if (a.name === 'balance' && !state.wallet.connected) openConnect();
  await voiceSay(text, i);
  if (a.name === 'open_page') location.hash = `#/${a.input}`;
}

async function voiceApprove(i) {
  V.unlock();
  const m = vlog()[i];
  const a = m?.action;
  if (!a || m.status !== 'offer') return;
  const s = state.services.find((x) => x.id === a.service);
  if (!s) return toast('That tool is not available right now.');
  if (!state.wallet.connected) {
    toast('Connect your wallet, then tap Approve again.');
    return openConnect();
  }
  if (state.wallet.mode === 'deeplink') {
    // Phone wallet app: the page leaves for the wallet and comes back; the result is added on return.
    try {
      sessionStorage.setItem(VAWAIT, JSON.stringify({ i, service: s.id, at: Date.now() }));
    } catch {
      /* ignore */
    }
    vupdate(i, { status: 'away' });
    paintVoice();
    return openRun(s.id, a.input);
  }
  vupdate(i, { status: 'paying' });
  paintVoice();
  const url = new URL(s.path, location.origin);
  url.searchParams.set(s.param, a.input);
  try {
    const out = await payWithWallet({ url: url.toString(), payer: state.wallet.address, onStep: () => {} });
    const sig = out.settlement.transaction;
    const result = out.result?.result;
    addHistory({ service: s.id, name: s.name, status: 'paid', priceUsd: s.priceUsd, transaction: sig, payer: state.wallet.address });
    if (s.id === 'token-safety-scan') rememberScan(result, sig);
    vupdate(i, { status: 'done' });
    const text = V.spokenSummary(s.id, result);
    const j = vpush({ role: 'agent', text, service: s.id, result, tx: sig, unspoken: true });
    paintChrome();
    refreshBalance();
    paintVoice();
    await voiceSay(text, j);
  } catch (err) {
    const cancelled = err instanceof PayError && err.stage === 'rejected';
    vupdate(i, { status: cancelled ? 'declined' : 'failed', error: err.message });
    paintVoice();
    await voiceSay(cancelled ? 'No problem, nothing was charged.' : 'That payment did not go through, and nothing was charged.');
  }
}

// Called after any successful paid call; adds the result to the voice chat if the voice agent asked for it.
function voiceOnPaid(serviceId, result, sig) {
  let w = null;
  try {
    w = JSON.parse(sessionStorage.getItem(VAWAIT) || 'null');
  } catch {
    /* ignore */
  }
  if (!w || w.service !== serviceId || Date.now() - w.at > 15 * 60_000) return;
  sessionStorage.removeItem(VAWAIT);
  vupdate(w.i, { status: 'done' });
  vpush({ role: 'agent', text: V.spokenSummary(serviceId, result), service: serviceId, result, tx: sig, unspoken: true });
  paintVoice();
}

const PAGES = { home: pageHome, voice: pageVoice, scanner: pageScanner, services: pageServices, proof: pageProof, activity: pageActivity, wallet: pageWallet, agent: pageAgent, developers: pageDevelopers, receipt: pageReceipt, analytics: pageAnalytics, settings: pageSettings };
const TITLES = { home: 'Home', voice: 'Voice', scanner: 'Token Scanner', services: 'Services', proof: 'Payment proof', activity: 'Activity', wallet: 'Wallet', agent: 'Agent', developers: 'Developers', receipt: 'Verify a receipt', analytics: 'Analytics', settings: 'Settings' };

function render() {
  state.route = (location.hash.replace(/^#\//, '').split(/[?/]/)[0] || 'home').toLowerCase();
  if (!PAGES[state.route]) state.route = 'home';
  document.title = `${TITLES[state.route]} · Witiq`;
  $('#content').innerHTML = PAGES[state.route]();
  document.body.dataset.route = state.route;
  paintChrome();
  loadPage();
}

// Each page that shows live data loads it here, every time the page is opened.
function loadPage() {
  if (state.route === 'wallet') fillWallet();
  else if (state.route === 'developers') fillEarnings();
  else if (state.route === 'agent') fillAgent();
  else if (state.route === 'home') fillSolana();
  else if (state.route === 'receipt') fillReceipt();
  else if (state.route === 'voice') fillVoice();
}

/* ---------------- run dialog ---------------- */
const STEP_TITLES = ['Request the service', 'Payment required (HTTP 402)', 'Sign, verify and settle on Solana', 'Result unlocked'];
const num = (n, o) => (n === null || n === undefined ? '–' : nf(n, o));
const money = (n) => (n === null || n === undefined ? '–' : `$${nf(n, { maximumFractionDigits: n < 1 ? 4 : 2 })}`);
const pct = (n) => (n === null || n === undefined ? '–' : `${n > 0 ? '+' : ''}${n}%`);

function renderResult(id, payload) {
  const r = payload?.result ?? payload;
  let body = '';
  if (id === 'token-safety-scan') {
    body = scanCard(r);
  } else if (id === 'url-safety-scan') {
    const cls = r.level === 'high' ? 'bad' : r.level === 'medium' ? 'warn' : 'good';
    body = `<div class="headline ${cls}">${esc(String(r.level).toUpperCase())} risk · score ${esc(r.score)}/100</div><p>${esc(r.verdict)}</p>${r.flags?.length ? `<ul>${r.flags.map((f) => `<li>${esc(f.detail)}</li>`).join('')}</ul>` : ''}<p class="note">${esc(r.method)}</p>`;
  } else if (id === 'ai-summary') {
    body = `<p>${esc(r.summary)}</p><div class="chips"><span class="chip">${esc(r.engine === 'claude' ? 'Claude' : 'Local summariser')}</span><span class="chip">${esc(r.originalWords)} → ${esc(r.summaryWords)} words</span></div>${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}`;
  } else if (id === 'data-snapshot') {
    const up = (r.change24hPct ?? 0) >= 0;
    body = `<div class="headline">${esc(r.asset.name)} (${esc(r.asset.symbol)}) · ${money(r.priceUsd)}</div><div class="chips"><span class="chip" style="color:${up ? 'var(--green)' : 'var(--red)'}">24h ${pct(r.change24hPct)}</span><span class="chip">7d ${pct(r.change7dPct)}</span>${r.asset.marketCapRank ? `<span class="chip">Rank #${esc(r.asset.marketCapRank)}</span>` : ''}</div><ul><li>24h high ${money(r.high24hUsd)} · low ${money(r.low24hUsd)}</li><li>Market cap ${money(r.marketCapUsd)}</li><li>24h volume ${money(r.volume24hUsd)}</li></ul><p class="note">Source: ${esc(r.source)} · as of ${esc(r.asOf ? new Date(r.asOf).toLocaleTimeString() : 'now')}</p>`;
  } else if (id === 'json-validator') {
    body = r.valid
      ? `<div class="headline good">Valid JSON</div><div class="chips"><span class="chip">${esc(r.type)}</span><span class="chip">${esc(r.totalKeys)} keys</span><span class="chip">depth ${esc(r.depth)}</span><span class="chip">${esc(r.bytes)} bytes</span></div><pre class="json">${esc(r.formatted)}</pre>`
      : `<div class="headline bad">Invalid JSON</div><p>${esc(r.error)}</p>${r.line ? `<div class="chips"><span class="chip">line ${esc(r.line)}, column ${esc(r.column)}</span><span class="chip">near ${esc(JSON.stringify(r.character))}</span></div>` : ''}`;
  }
  return `<div class="result">${body}<details><summary>Raw response</summary><pre class="json">${esc(JSON.stringify(payload, null, 2))}</pre></details></div>`;
}

function stepsHtml(steps) {
  return steps
    .map((s, i) => `<div class="step ${s.status}"><div class="n">${s.status === 'done' ? '✓' : s.status === 'error' ? '✕' : i + 1}</div><div><div class="t">${esc(STEP_TITLES[i])}</div><div class="d">${s.html || ''}</div></div></div>`)
    .join('');
}

function openRun(id, preset) {
  const s = state.services.find((x) => x.id === id);
  if (!s) return;
  const dlg = $('#run');
  dlg.dataset.id = id;
  dlg.innerHTML = `
    <div class="run-wrap">
      <div class="run-head"><div class="ico">${svg(s.icon)}</div><div class="grow"><h2 id="run-title">${esc(s.name)}</h2><p>${esc(s.description)}</p></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="run-body">
        <label class="field">${esc(s.paramLabel)}<textarea id="run-input" rows="${s.id === 'ai-summary' ? 6 : ['data-snapshot', 'token-safety-scan'].includes(s.id) ? 1 : 3}" maxlength="${s.maxLen}" spellcheck="false">${esc(preset ?? s.example)}</textarea></label>
        <div id="run-actions"></div>
        <p class="note">You are charged only if the input is valid and the payment settles on Solana. ${NET.testMoney ? 'Test USDC on devnet.' : 'Real USDC on Solana mainnet.'}</p>
        <div class="flow" id="run-flow" hidden></div>
      </div>
    </div>`;
  paintRunActions();
  if (!dlg.open) dlg.showModal();
}

function paintRunActions() {
  const box = $('#run-actions');
  const dlg = $('#run');
  if (!box) return;
  const s = state.services.find((x) => x.id === dlg.dataset.id);
  if (!s) return;
  const w = state.wallet;
  const demoOk = state.health?.checks?.demoWallet;
  box.innerHTML = `<div class="actions">
    ${w.connected ? `<button class="btn lime" data-go-wallet>${svg('wallet')}Pay ${esc(s.price)} with ${esc(w.name)}</button>` : `<button class="btn lime" data-connect>${svg('wallet')}Connect wallet to pay</button>`}
    ${demoOk ? `<button class="btn ghost" data-go title="Pays from a server-side devnet wallet, no wallet needed">Quick demo (no wallet)</button>` : ''}
    <button class="btn ghost" data-fail title="Sends a forged payment to show that nothing is delivered and nothing is charged">Simulate forged payment</button>
  </div>`;
}

const fundsHelp = () =>
  NET.testMoney
    ? '<a target="_blank" rel="noopener" href="https://faucet.circle.com">Get free devnet USDC</a> (Solana, Devnet, USDC), then try again.'
    : 'Add a little USDC on Solana (swap in your wallet, or withdraw from an exchange choosing the <b>Solana</b> network), then try again. No SOL is needed.';

async function runPay(kind) {
  const dlg = $('#run');
  const id = dlg.dataset.id;
  const s = state.services.find((x) => x.id === id);
  const input = $('#run-input').value;
  const flow = $('#run-flow');
  const btns = dlg.querySelectorAll('#run-actions button');
  btns.forEach((b) => (b.disabled = true));
  const steps = STEP_TITLES.map(() => ({ status: 'idle', html: '' }));
  const paint = () => {
    flow.hidden = false;
    flow.innerHTML = stepsHtml(steps);
  };
  const done = () => {
    btns.forEach((b) => (b.disabled = false));
    if (['home', 'activity', 'analytics'].includes(state.route)) {
      const y = window.scrollY;
      $('#content').innerHTML = PAGES[state.route]();
      window.scrollTo(0, y);
      if (state.route === 'home') fillSolana();
    }
    refreshBalance();
  };
  const record = (status, tx, payer) => {
    addHistory({ service: id, name: s.name, status, priceUsd: s.priceUsd, transaction: tx || null, payer: payer || null });
    paintChrome();
  };

  /* ---- real wallet payment, signed in the browser ---- */
  if (kind === 'wallet') {
    const url = new URL(s.path, location.origin);
    url.searchParams.set(s.param, input);
    const problem = (s.maxLen && input.length > s.maxLen) || !input.trim();
    if (problem) {
      steps[0] = { status: 'error', html: '<span class="err">Enter a valid input first.</span> You were not charged.' };
      paint();
      return done();
    }
    const onStep = (i, status, html) => {
      steps[i] = { status, html };
      if (status === 'done' && steps[i + 1] && steps[i + 1].status === 'idle') steps[i + 1] = { status: 'active', html: '' };
      paint();
    };
    if (state.wallet.mode === 'deeplink') {
      // Phone flow: build the payment, hand it to the wallet app, and finish when the wallet sends the user back.
      try {
        const p = await preparePayment({ url: url.toString(), payer: state.wallet.address, onStep });
        onStep(2, 'active', `Opening ${esc(state.wallet.name)} to approve… you will return here automatically.`);
        (await deeplink()).requestSignature(p.unsigned, { serviceId: id, input, url: p.url, payer: p.payer, required: p.required, accept: p.accept, amountUsdc: p.amountUsdc });
        return; // the page now navigates to the wallet app
      } catch (err) {
        const e = err instanceof PayError ? err : new PayError('payment', err.message || 'Could not open the wallet');
        const at = e.stage === 'request' ? 0 : 2;
        steps[at] = { status: 'error', html: `<span class="err">${esc(e.message)}</span>${e.needFunds ? ` ${fundsHelp()}` : ''}` };
        if (at === 2) steps[3] = { status: 'error', html: 'No result was delivered and nothing was charged.' };
        paint();
        return done();
      }
    }
    try {
      const out = await payWithWallet({ url: url.toString(), payer: state.wallet.address, onStep });
      const sig = out.settlement.transaction;
      onStep(2, 'done', `Signed by <code>${esc(short(out.payer))}</code>. The facilitator verified it and settled on Solana. Transaction ${txLink(sig)}`);
      steps[3] = { status: 'done', html: `Unlocked in ${esc(out.timings.payAndUnlockMs)} ms.${renderResult(id, out.result)}` };
      paint();
      record('paid', sig, out.payer);
      if (id === 'token-safety-scan') rememberScan(out.result?.result, sig);
      voiceOnPaid(id, out.result?.result, sig);
    } catch (err) {
      const e = err instanceof PayError ? err : new PayError('payment', err.message || 'Payment failed');
      const at = e.stage === 'request' ? 0 : 2;
      steps[at] = { status: 'error', html: `<span class="err">${esc(e.message)}</span>${e.needFunds ? ` ${fundsHelp()}` : ''}${e.stage === 'request' ? ' You were not charged.' : ''}` };
      if (at === 2) steps[3] = { status: 'error', html: 'No result was delivered and nothing was charged.' };
      paint();
      if (e.stage === 'payment') record('failed');
    }
    return done();
  }

  /* ---- forged payment, sent from this browser (no server wallet needed) ---- */
  if (kind === 'fail') {
    const url = new URL(s.path, location.origin);
    url.searchParams.set(s.param, input);
    steps[0] = { status: 'active', html: 'Calling the service with a forged payment…' };
    paint();
    try {
      const out = await forgePayment(url.toString());
      steps[0] = { status: 'done', html: 'Sent the request with a forged payment (random bytes instead of a signed transaction).' };
      steps[1] = { status: 'done', html: 'Server asked for payment: <code>402 Payment Required</code>.' };
      steps[2] = { status: out.delivered ? 'done' : 'error', html: out.delivered ? '<span class="err">Unexpectedly accepted.</span>' : `Rejected by verification (HTTP ${esc(out.status)})${out.error ? `: ${esc(out.error)}` : ''}. Nothing was sent to Solana.` };
      steps[3] = { status: 'error', html: 'Nothing was delivered and nothing was charged. See <a href="#/proof">Payment proof</a> for the balance before and after.' };
      record('failed');
    } catch (err) {
      steps[0] = { status: 'error', html: `<span class="err">${esc(err.message)}</span> You were not charged.` };
    }
    paint();
    return done();
  }

  /* ---- server-side demo wallet (devnet only, optional) ---- */
  steps[0] = { status: 'active', html: 'Calling the service…' };
  paint();
  let out;
  try {
    out = await api(`/api/demo/${kind}/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
  } catch (err) {
    steps[0] = { status: 'error', html: `<span class="err">${esc(err.message)}</span> You were not charged.` };
    paint();
    return done();
  }
  const step = async (i, status, html, delay = 320) => {
    steps[i] = { status, html };
    if (status === 'done' && steps[i + 1]) steps[i + 1] = { status: 'active', html: '' };
    paint();
    await sleep(delay);
  };
  if (kind === 'fail') {
    await step(0, 'done', 'Sent the request with a forged payment signature.');
    await step(1, 'done', 'Server answered <code>402 Payment Required</code>.');
    await step(2, 'error', `Rejected by verification (HTTP ${esc(out.status)}): ${esc(out.error)}`, 0);
    steps[3] = { status: 'error', html: 'Nothing was delivered and nothing was charged.' };
    paint();
    record('failed');
  } else if (out.stage === 'request') {
    await step(0, 'error', `<span class="err">${esc(out.error)}</span> You were not charged.`, 0);
  } else {
    const r = out.requirements;
    await step(0, 'done', `Called <code>${esc(s.path)}</code> with no payment.`);
    await step(1, 'done', r ? `Server asked for <strong>${esc(r.amountUsdc)} USDC</strong> on <code>${esc(short(r.network, 9))}</code> to <code>${esc(short(r.payTo))}</code> (scheme <code>${esc(r.scheme)}</code>).` : 'Payment requirements received.');
    if (!out.ok) {
      await step(2, 'error', `<span class="err">${esc(out.error)}</span>`, 0);
      steps[3] = { status: 'error', html: 'No result was delivered.' };
      paint();
      record('failed');
    } else {
      await step(2, 'done', `Demo wallet <code>${esc(short(out.payer))}</code> signed; the facilitator verified and settled. Transaction ${txLink(out.settlement.transaction)}`);
      await step(3, 'done', `Unlocked in ${esc(out.timings.payAndUnlockMs)} ms.${renderResult(id, out.result)}`, 0);
      record('paid', out.settlement.transaction, out.payer);
      if (id === 'token-safety-scan') rememberScan(out.result?.result, out.settlement.transaction);
    }
  }
  done();
}

/* ---------------- returning from the wallet app (phone flow) ---------------- */
async function resumePayment(cb) {
  const pend = cb.pending;
  const s = pend && state.services.find((x) => x.id === pend.serviceId);
  if (!s) {
    toast(cb.error || 'That payment request expired. Please try again.');
    return;
  }
  if (pend.hash) location.hash = pend.hash;
  openRun(s.id);
  $('#run-input').value = pend.input;
  const flow = $('#run-flow');
  const steps = [
    { status: 'done', html: 'Called the endpoint with no payment.' },
    { status: 'done', html: `Server asked for <strong>${esc(pend.amountUsdc)} USDC</strong> on ${esc(NET.name)}.` },
    { status: 'active', html: 'Back from your wallet. Verifying and settling on Solana…' },
    { status: 'idle', html: '' },
  ];
  const paint = () => {
    flow.hidden = false;
    flow.innerHTML = stepsHtml(steps);
  };
  paint();
  (await deeplink()).clearPending();
  const fail = (msg, record) => {
    steps[2] = { status: 'error', html: `<span class="err">${esc(msg)}</span>` };
    steps[3] = { status: 'error', html: 'No result was delivered and nothing was charged.' };
    paint();
    if (record) {
      addHistory({ service: s.id, name: s.name, status: 'failed', priceUsd: s.priceUsd, transaction: null, payer: pend.payer });
      paintChrome();
    }
  };
  if (cb.error) return fail(cb.error, !cb.rejected);
  try {
    const out = await submitPayment({ ...pend, signed: cb.signed, onStep: () => {} });
    const sig = out.settlement.transaction;
    steps[2] = { status: 'done', html: `Signed in ${esc(state.wallet.name || 'your wallet')}. The facilitator verified it and settled on Solana. Transaction ${txLink(sig)}` };
    steps[3] = { status: 'done', html: `Unlocked in ${esc(out.timings.payAndUnlockMs)} ms.${renderResult(s.id, out.result)}` };
    paint();
    addHistory({ service: s.id, name: s.name, status: 'paid', priceUsd: s.priceUsd, transaction: sig, payer: pend.payer });
    if (s.id === 'token-safety-scan') rememberScan(out.result?.result, sig);
    voiceOnPaid(s.id, out.result?.result, sig);
    paintChrome();
    refreshBalance();
  } catch (err) {
    fail(err.message || 'Payment failed', true);
  }
}

/* ---------------- events ---------------- */
document.addEventListener('click', async (e) => {
  const t = e.target;
  const run = t.closest('[data-run]');
  if (run) return openRun(run.dataset.run);
  if (t.closest('[data-go-wallet]')) return runPay('wallet');
  if (t.closest('[data-go]')) return runPay('pay');
  if (t.closest('[data-fail]')) return runPay('fail');
  if (t.closest('[data-verify]')) {
    const v = $('#rc-input').value.trim();
    if (v) location.hash = `#/receipt/${encodeURIComponent(v)}`;
    return;
  }
  if (t.closest('[data-connect]')) {
    const found = walletSnap().wallets;
    if (found.length === 1) {
      try {
        await connectWallet(found[0].name);
        toast(`Connected to ${found[0].name}`);
        return;
      } catch (err) {
        /* fall back to the picker */
      }
    }
    return openConnect();
  }
  if (t.closest('[data-agent-create]')) {
    await createAgentWallet();
    return fillAgent();
  }
  if (t.closest('[data-agent-refresh]')) return fillAgent();
  if (t.closest('[data-agent-reset]')) {
    if (confirm(NET.testMoney ? 'Discard the agent wallet? Any test USDC in it will be lost.' : 'Discard the agent wallet? Any USDC still in it will be lost for good. Spend it first.')) {
      forgetAgentWallet();
      fillAgent();
    }
    return;
  }
  if (t.closest('[data-voice-mic]')) return voiceMic();
  const vh = t.closest('[data-voice-hint]');
  if (vh) return voiceAsk(VOICE_HINTS[Number(vh.dataset.voiceHint)]);
  const va = t.closest('[data-voice-approve]');
  if (va) return voiceApprove(Number(va.dataset.voiceApprove));
  const vd = t.closest('[data-voice-decline]');
  if (vd) {
    vupdate(Number(vd.dataset.voiceDecline), { status: 'declined' });
    return paintVoice();
  }
  const vhear = t.closest('[data-voice-hear]');
  if (vhear) {
    V.unlock();
    const i = Number(vhear.dataset.voiceHear);
    return voiceSay(vlog()[i]?.text || '', i);
  }
  if (t.closest('[data-voice-clear]')) {
    V.stop();
    vsave([]);
    vs.phase = 'idle';
    return render();
  }
  if (t.closest('[data-agent-run]')) return runAgent();
  const ex = t.closest('[data-agent-example]');
  if (ex) {
    const box = $('#agent-task');
    if (box) box.value = AGENT_EXAMPLES[Number(ex.dataset.agentExample)]?.[1] || '';
    return;
  }
  if (t.closest('[data-scan]')) return startScan();
  const sx = t.closest('[data-scan-example]');
  if (sx) {
    const box = $('#scan-input');
    if (box) box.value = sx.dataset.scanExample;
    return startScan();
  }
  const sv = t.closest('[data-scan-view]');
  if (sv) return viewScan(Number(sv.dataset.scanView));
  const sa = t.closest('[data-scan-again]');
  if (sa) return openRun('token-safety-scan', sa.dataset.scanAgain);
  const pr = t.closest('[data-proof]');
  if (pr) return runProof(pr.dataset.proof);
  const dl = t.closest('[data-dl]');
  if (dl) {
    try {
      return (await deeplink()).connectViaDeepLink(dl.dataset.dl);
    } catch (err) {
      const box = $('#connect-err');
      if (box) box.innerHTML = `<div class="callout"><b>Could not open the wallet.</b> ${esc(/import|fetch|module/i.test(err.message) ? 'A site file failed to load. Reload the page and try again.' : err.message)}</div>`;
      return;
    }
  }
  const pick = t.closest('[data-pick]');
  if (pick) return doConnect(pick.dataset.pick);
  if (t.closest('[data-wallet-menu]')) return walletMenu();
  if (t.closest('[data-disconnect]')) {
    await disconnectWallet();
    if ($('#connect').open) $('#connect').close();
    toast('Wallet disconnected');
    return;
  }
  if (t.closest('[data-close-connect]') || t === $('#connect')) return $('#connect').close();
  if (t.closest('[data-close]') || t === $('#run')) return $('#run').close();
  const cp = t.closest('[data-copy]');
  if (cp) {
    try {
      await navigator.clipboard.writeText(cp.dataset.copy);
      toast('Address copied');
    } catch {
      toast('Could not copy. Select the address and copy it manually.');
    }
    return;
  }
  if (t.closest('[data-clear]')) {
    if (confirm('Clear the activity history stored in this browser?')) {
      store.set(KEY, []);
      render();
      toast('History cleared');
    }
    return;
  }
  if (t.closest('[data-refresh-wallet]')) {
    $('#wallet-body').innerHTML = `<div class="loading">Reading balances from ${esc(NET.name)}…</div>`;
    await refreshBalance();
    return fillWallet();
  }
  if (t.closest('[data-refresh-earn]')) {
    $('#earn-body').innerHTML = '<div class="loading">Reading on-chain receipts…</div>';
    return fillEarnings();
  }
  if (t.closest('.nav a, .brand')) $('#app').classList.remove('open');
  if (t.closest('#menu-btn')) $('#app').classList.toggle('open');
  if (t === $('#scrim')) $('#app').classList.remove('open');
  if (t.closest('#bell')) {
    const h = history();
    store.set(SEEN, h[0]?.at || '');
    paintChrome();
    toast(h[0] ? `Latest: ${h[0].name} ${h[0].status === 'paid' ? 'unlocked' : 'was rejected'} ${ago(h[0].at)}` : 'No activity yet');
  }
});

$('#search').addEventListener('input', (e) => {
  state.query = e.target.value;
  if (state.route !== 'services') location.hash = '#/services';
  else render();
});
document.addEventListener('submit', (e) => {
  if (!e.target.closest?.('[data-voice-form]')) return;
  e.preventDefault();
  const box = $('#voice-text');
  const v = box?.value || '';
  if (box) box.value = '';
  voiceAsk(v);
});
document.addEventListener('change', (e) => {
  if (e.target?.id === 'voice-natural') store.set(VNATURAL, e.target.checked);
});
window.addEventListener('hashchange', () => {
  if (state.route !== 'voice' && vs.phase === 'listening') vs.stopListening?.();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target?.id === 'scan-input') return startScan();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#search').focus();
  }
  if (e.key === 'Escape') $('#app').classList.remove('open');
});
window.addEventListener('hashchange', render);

/* ---------------- boot ---------------- */
onWalletChange((snap) => {
  const was = state.wallet.address;
  state.wallet = snap;
  paintChrome();
  if (snap.address !== was) refreshBalance();
  if ($('#run')?.open) paintRunActions();
  if ($('#connect')?.open && snap.connected && !$('#connect-err')?.innerHTML) {
    /* picker stays open until doConnect closes it */
  }
  if (['home', 'wallet', 'proof'].includes(state.route) && !proof.busy) render();
});

async function boot() {
  const cb = location.search.includes('wcb=') ? await deeplink().then((m) => m.handleDeepLinkReturn()).catch(() => null) : null; // returning from a wallet app?
  state.wallet = walletSnap();
  initWallets();
  const [cfg, svc, health] = await Promise.allSettled([api('/api/config'), api('/api/services'), api('/api/health')]);
  state.config = cfg.status === 'fulfilled' ? cfg.value : null;
  if (state.config?.net) setNet(state.config.net);
  state.health = health.status === 'fulfilled' ? health.value : null;
  state.apiDown = cfg.status !== 'fulfilled' || svc.status !== 'fulfilled';
  state.services = svc.status === 'fulfilled' && Array.isArray(svc.value) && svc.value.length ? svc.value : FALLBACK_SERVICES;
  if (cb?.type === 'connect' && !cb.error && cb.hash) location.hash = cb.hash;
  render();
  if (state.wallet.connected) refreshBalance();
  if (cb?.type === 'connect') toast(cb.error ? cb.error : `Connected to ${cb.wallet}`);
  if (cb?.type === 'sign') resumePayment(cb);
}
boot().catch((err) => {
  $('#content').innerHTML = `<div class="callout"><b>Witiq could not start.</b> ${esc(err.message || 'Unknown error')}. Reload the page.</div>`;
});
