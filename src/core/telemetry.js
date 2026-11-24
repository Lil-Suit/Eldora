// Relatório de erros para o Sentry, sem SDK (cabe no arquivo único do jogo).
// Só envia quando o jogo roda de verdade (https, fora de testes automáticos). Nada pessoal vai junto:
// sem nome de conta, e-mail ou personagem — só versão, aparelho, classe/nível e o que estava acontecendo.
import { VERSION } from '../version.js';

const DSN = 'https://8ffc505d8bfbef96c829cace57608900@o4512419115499520.ingest.us.sentry.io/4512419158622208';
const MAX_PER_SESSION = 12;
const SAME_GAP_MS = 60000;

function parseDsn(dsn) {
  const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn);
  return m ? { key: m[1], host: m[2], project: m[3] } : null;
}

function hex32() {
  const a = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('') || String(Date.now()).padStart(32, '0');
}

function envName() {
  const h = location.hostname || '';
  if (/onrender\.com$/.test(h)) return 'online';
  if (/claude|anthropic/.test(h)) return 'artefato';
  return 'web';
}

// "at fn (url:line:col)" (Chrome) e "fn@url:line:col" (Firefox/Safari) → frames do Sentry (mais antigo primeiro)
export function parseStack(stack) {
  const frames = [];
  for (const line of String(stack || '').split('\n').slice(0, 40)) {
    let m = /^\s*at (?:(.+?) \()?(.*?):(\d+):(\d+)\)?\s*$/.exec(line) || /^\s*(.*?)@(.*?):(\d+):(\d+)\s*$/.exec(line);
    if (!m) continue;
    const file = (m[2] || '').replace(/^.*\//, '') || '<anon>';
    frames.push({ function: m[1] || '?', filename: file, abs_path: m[2] || file, lineno: +m[3], colno: +m[4], in_app: !/^(chrome|moz|safari)-extension:/.test(m[2] || '') });
  }
  return frames.reverse();
}

const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /extension:\/\//i, /Non-Error promise rejection captured/i, /The play\(\) request was interrupted/i, /AbortError/i];

export const telemetry = {
  dsn: parseDsn(DSN),
  enabled: false,
  sent: 0,
  seen: new Map(),
  crumbs: [],
  ctx: {},
  installId: null,

  init(getCtx) {
    try {
      const auto = navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent);
      this.enabled = !!this.dsn && location.protocol === 'https:' && !auto && !/^(localhost|127\.)/.test(location.hostname);
    } catch { this.enabled = false; }
    this.getCtx = getCtx;
    globalThis.__eldCrumb = (m, cat) => this.crumb(m, 'info', cat || 'jogo');
    globalThis.__eldCapture = (e, x) => this.capture(e, x);
    try { this.installId = localStorage.getItem('eldoria.iid') || hex32().slice(0, 16); localStorage.setItem('eldoria.iid', this.installId); } catch { this.installId = hex32().slice(0, 16); }
    addEventListener('error', (ev) => {
      if (ev?.target && ev.target !== window && !ev.error) return; // imagem/script que não carregou
      this.capture(ev.error || new Error(ev.message || 'erro'), { origem: 'window.onerror' });
    });
    addEventListener('unhandledrejection', (ev) => {
      const r = ev.reason;
      this.capture(r instanceof Error ? r : new Error(typeof r === 'string' ? r : 'promessa rejeitada'), { origem: 'promise' });
    });
    for (const lvl of ['error', 'warn']) {
      const orig = console[lvl];
      console[lvl] = (...a) => { this.crumb(a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : '')).join(' ').slice(0, 200), lvl === 'warn' ? 'warning' : 'error', 'console'); return orig.apply(console, a); };
    }
  },

  crumb(message, level = 'info', category = 'jogo') {
    if (!message) return;
    this.crumbs.push({ timestamp: Date.now() / 1000, message: String(message).slice(0, 200), level, category });
    if (this.crumbs.length > 25) this.crumbs.shift();
  },

  capture(err, extra = {}) {
    try {
      if (!this.enabled || this.sent >= MAX_PER_SESSION) return;
      const msg = String(err?.message || err || 'erro');
      if (IGNORE.some((r) => r.test(msg) || r.test(String(err?.stack || '')))) return;
      const sig = msg + '|' + String(err?.stack || '').split('\n')[1];
      const now = Date.now();
      if (now - (this.seen.get(sig) || 0) < SAME_GAP_MS) return;
      this.seen.set(sig, now); this.sent++;
      let c = {};
      try { c = this.getCtx?.() || {}; } catch { /* sem contexto */ }
      const event = {
        event_id: hex32(), timestamp: now / 1000, platform: 'javascript', level: 'error',
        release: 'eldoria@' + VERSION, environment: envName(),
        exception: { values: [{ type: err?.name || 'Error', value: msg.slice(0, 500), stacktrace: { frames: parseStack(err?.stack) } }] },
        tags: { classe: c.classe || '-', modo: c.modo || '-', area: c.area || '-', qualidade: c.qualidade || '-', aparelho: c.mobile ? 'celular' : 'pc', online: c.online ? 'sim' : 'não', origem: extra.origem || 'manual' },
        user: { id: this.installId },
        contexts: { jogo: { nivel: c.nivel, fps: c.fps, inimigos: c.inimigos, jogadores: c.jogadores }, device: { screen_resolution: `${screen.width}x${screen.height}`, pixel_ratio: devicePixelRatio } },
        request: { url: location.origin + location.pathname, headers: { 'User-Agent': navigator.userAgent } },
        breadcrumbs: { values: this.crumbs.slice() },
        extra,
      };
      const d = this.dsn;
      const url = `https://${d.host}/api/${d.project}/envelope/?sentry_key=${d.key}&sentry_version=7&sentry_client=eldoria-mini%2F${VERSION}`;
      const body = JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }) + '\n' + JSON.stringify({ type: 'event' }) + '\n' + JSON.stringify(event);
      fetch(url, { method: 'POST', body, keepalive: body.length < 60000, mode: 'cors', headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => {});
    } catch { /* o relatório de erro nunca pode quebrar o jogo */ }
  },
};
