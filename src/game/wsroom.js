// Sala multiplayer pelo servidor próprio (server/server.js), usada quando o jogo roda fora do Claude
// (Render, etc.). Imita a interface da sala do Claude (join/emit/on/onPeers/presence/onConnection),
// então o resto do código de rede não muda.
import { MUNDO } from './mundo.js';
export function wsServerUrl(sv = 1) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  const custom = window.ELDORIA_SERVER; // opcional: apontar um site estático para um servidor em outro endereço
  const base = custom || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  return base + (base.includes('?') ? '&' : '?') + 'sv=' + sv + (MUNDO ? '&mundo=' + encodeURIComponent(MUNDO.key) : ''); // servidor (mundo) escolhido na tela inicial
}

export function makeWsLobby(url) {
  return {
    join() {
      return new Promise((resolve, reject) => {
        const subs = { chat: new Set(), fx: new Set(), mob: new Set() };
        const peerSubs = new Set(), connSubs = new Set();
        let ws = null, self = null, lastHost, lastPeers = [], myPresence = {}, myToken = null, opened = false, closedByUs = false, retry = 0;
        const ready = () => ws && ws.readyState === 1;
        const out = (o) => { if (ready()) ws.send(JSON.stringify(o)); };
        const emitPeers = () => {
          const ch = { host: lastHost, peers: lastPeers.map((p) => ({ peer: p.peer, sameTab: p.peer === self, kind: 'viewer', presence: p.presence || {}, isMe: false, guest: false, updatedAt: p.updatedAt })) };
          for (const f of peerSubs) { try { f(ch); } catch { /* ignora */ } }
        };
        const open = () => {
          try { ws = new WebSocket(url); } catch (e) { if (!opened) reject(e); return; }
          const t = setTimeout(() => { if (!opened) { try { ws.close(); } catch { /* ok */ } reject(new Error('tempo esgotado')); } }, 8000);
          ws.onopen = () => { retry = 0; clearInterval(room._pi); room._pi = setInterval(() => out({ t: 'ping', at: performance.now() }), 2000); };
          ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch { return; }
            if (m.t === 'hello') {
              self = m.peer;
              if (Number.isFinite(m.now)) room.clockOff = m.now - Date.now();
              if (myToken) out({ t: 'auth', token: myToken });
              out({ t: 'pres', p: myPresence });
              for (const f of connSubs) f(true);
              if (!opened) { opened = true; clearTimeout(t); resolve(room); }
            } else if (m.t === 'pong') { if (Number.isFinite(m.at)) { room.ping = Math.round(performance.now() - m.at); room.onPing?.(room.ping); } }
            else if (m.t === 'kicked') { closedByUs = true; try { window.dispatchEvent(new Event('eldoria-kicked')); } catch { /* ok */ } }
            else if (m.t === 'pvpdead') { try { window.dispatchEvent(new CustomEvent('eldoria-pvpdead', { detail: m })); } catch { /* ok */ } }
            else if (m.t === 'maint') { try { window.dispatchEvent(new Event('eldoria-maint')); } catch { /* ok */ } }
            else if (m.t === 'peers') {
              // parcial: só os do meu mapa vieram atualizados; os de outros mapas continuam como estavam (keep)
              if (m.partial && Array.isArray(m.keep)) { const old = new Map(lastPeers.map((q) => [q.peer, q])); lastPeers = (Array.isArray(m.peers) ? m.peers : []).concat(m.keep.map((id) => old.get(id)).filter(Boolean)); }
              else lastPeers = Array.isArray(m.peers) ? m.peers : []; if ('host' in m) lastHost = m.host; if (Number.isFinite(m.now)) room.clockOff = room.clockOff == null ? m.now - Date.now() : room.clockOff * 0.8 + (m.now - Date.now()) * 0.2; emitPeers(); }
            else if (m.t === 'msg' && subs[m.topic]) {
              const msg = { peer: m.peer, sameTab: m.peer === self, guest: false, data: m.data };
              for (const f of subs[m.topic]) { try { f(msg); } catch { /* ignora */ } }
            }
          };
          ws.onclose = () => {
            for (const f of connSubs) f(false);
            if (closedByUs) return;
            if (!opened) { clearTimeout(t); reject(new Error('sem servidor')); return; }
            setTimeout(open, Math.min(8000, 500 * 2 ** retry++)); // reconecta sozinho
          };
          ws.onerror = () => {};
        };
        const room = {
          emit(topic, data) { if (!ready()) return Promise.reject(new Error('desconectado')); out({ t: 'emit', topic, data }); return Promise.resolve(); },
          on(topic, f) { subs[topic]?.add(f); return () => subs[topic]?.delete(f); },
          onPeers(f) { peerSubs.add(f); if (lastPeers.length) emitPeers(); return () => peerSubs.delete(f); },
          onConnection(f) { connSubs.add(f); return () => connSubs.delete(f); },
          auth(token) { myToken = token || null; if (myToken) out({ t: 'auth', token: myToken }); },
          presence(p) { myPresence = p || {}; out({ t: 'pres', p: myPresence }); return Promise.resolve(); },
          ping: null,
          leave() { clearInterval(room._pi); closedByUs = true; try { ws?.close(); } catch { /* ok */ } },
        };
        open();
      });
    },
  };
}
