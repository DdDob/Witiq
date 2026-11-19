// Voice in and out for the Witiq voice agent.
//   Listening: the phone's built-in speech recognition (free, on-device or by the OS vendor).
//   Speaking:  ElevenLabs through /api/voice/speak when available, else the phone's own voice.
// Phones only allow sound after a tap, so unlock() must run inside the mic button's tap handler.

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
let audio = null;
let currentUrl = null;
let speakToken = 0;

const Recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const canListen = () => Boolean(Recognition());
export const canSpeakLocally = () => 'speechSynthesis' in window;

export function unlock() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
  }
  try {
    audio.src = SILENT_WAV;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
  if (canSpeakLocally()) {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }
}

// Starts listening. Returns stop(). onFinal(text) fires once with the final transcript.
export function listen({ onInterim, onFinal, onEnd, onError, lang = navigator.language || 'en-US' } = {}) {
  const R = Recognition();
  if (!R) {
    onError?.('unsupported');
    return () => {};
  }
  const rec = new R();
  rec.lang = /^en/i.test(lang) ? lang : 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let done = false;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onInterim?.((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    onError?.(e.error || 'error');
  };
  rec.onend = () => {
    if (done) return;
    done = true;
    const text = finalText.trim();
    if (text) onFinal?.(text);
    onEnd?.(Boolean(text));
  };
  try {
    rec.start();
  } catch {
    onError?.('busy');
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  };
}

function pickLocalVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  return (
    voices.find((v) => /premium|enhanced|neural|natural/i.test(v.name)) ||
    voices.find((v) => /samantha|daniel|google uk english|google us english|karen|moira/i.test(v.name)) ||
    voices.find((v) => v.default) ||
    voices[0] ||
    null
  );
}

function speakLocally(text, token) {
  return new Promise((resolve) => {
    if (!canSpeakLocally()) return resolve('none');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickLocalVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.onend = u.onerror = () => resolve(token === speakToken ? 'phone' : 'stopped');
    speechSynthesis.speak(u);
  });
}

// Speaks text. Resolves with which voice was used: 'natural', 'phone', 'none' or 'stopped'.
export async function say(text, { natural = true, onStart } = {}) {
  stop();
  const token = ++speakToken;
  if (natural) {
    try {
      const res = await fetch('/api/voice/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 400) }) });
      if (token !== speakToken) return 'stopped';
      if (res.ok && (res.headers.get('content-type') || '').includes('audio')) {
        const blob = await res.blob();
        if (token !== speakToken) return 'stopped';
        if (!audio) unlock();
        currentUrl = URL.createObjectURL(blob);
        audio.src = currentUrl;
        onStart?.('natural');
        const ended = new Promise((resolve) => {
          audio.onended = () => resolve('natural');
          audio.onerror = () => resolve('error');
        });
        await audio.play();
        const how = await ended;
        if (how === 'natural') return token === speakToken ? 'natural' : 'stopped';
      }
    } catch {
      /* fall through to the phone voice */
    }
    if (token !== speakToken) return 'stopped';
  }
  onStart?.('phone');
  return speakLocally(text, token);
}

export function stop() {
  speakToken++;
  try {
    if (audio) {
      audio.pause();
      audio.onended = null;
    }
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    if (canSpeakLocally()) speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/* ---------- turn tool results into one or two spoken sentences (no AI needed, no guessing) ---------- */

const pct = (n) => `${Math.abs(n) >= 10 ? Math.round(Math.abs(n)) : Math.abs(n).toFixed(1)} percent`;
export function spokenSummary(service, r) {
  if (!r) return 'Done.';
  if (service === 'token-safety-scan') {
    const name = r.token?.symbol || r.token?.name || 'This token';
    const flags = (r.checks || []).filter((c) => c.status === 'fail' || c.status === 'warn').map((c) => c.title.toLowerCase());
    let s = `${name} scores ${r.score} out of 100. ${r.verdict}.`;
    s += flags.length ? ` Main signals: ${flags.slice(0, 2).join(' and ')}.` : ' No major risk signals.';
    if (r.confidence === 'low') s += ' Some data was missing, so treat this with care.';
    return s;
  }
  if (service === 'url-safety-scan') return `${r.host || 'That link'}: ${r.verdict || 'checked.'}`;
  if (service === 'data-snapshot') {
    const name = r.asset?.name || r.asset?.symbol || 'It';
    const price = r.priceUsd >= 1 ? r.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : Number(r.priceUsd).toPrecision(3);
    const ch = r.change24hPct;
    return `${name} is at ${price} dollars${ch != null ? `, ${ch >= 0 ? 'up' : 'down'} ${pct(ch)} in the last day` : ''}.`;
  }
  return 'Done.';
}
