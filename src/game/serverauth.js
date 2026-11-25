// Conta no servidor próprio (fora do Claude): login/cadastro e salvamento dos personagens no servidor.
// Oferece a mesma interface da "nuvem" do Claude (collection().get(), doc().get/set/delete) para o SaveManager.
const TK = 'eldoria_token', US = 'eldoria_user';
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } } };

export function serverApiBase() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  return window.ELDORIA_API || location.origin;
}

async function call(method, path, body, token) {
  const base = serverApiBase();
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { j = null; }
  if (!r.ok) { const e = new Error(j?.error || 'Erro ' + r.status); e.status = r.status; throw e; }
  // resposta que não é do jogo (ex.: página do Render "acordando" o servidor do plano grátis)
  if (j === null) { const e = new Error('servidor acordando'); e.status = 0; e.waking = true; throw e; }
  return j;
}

// o servidor tem a API de contas? (no GitHub Pages ou num site estático não tem)
// Servidor "dormindo" (Render grátis leva ~1 min para acordar): continua tentando até ~90 s, avisando quem espera.
// Antes desistia em 6 s: o app abria sem a conta e os personagens sumiam da tela (pareciam perdidos).
let STATUS = null;
export async function serverHasAccounts(onWait) {
  if (!serverApiBase()) return false;
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    try {
      const j = await Promise.race([call('GET', '/api/status'), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('t'), { waking: true })), 8000))]);
      STATUS = j; return !!j?.ok;
    } catch (e) {
      if (e.status === 404 || e.status === 405) return false; // site estático: não há contas
      if (Date.now() - t0 > (window.__eldSrvWait || 90000)) return null; // não respondeu: a tela oferece "Tentar de novo"
      try { onWait?.(i, Date.now() - t0); } catch { /* ok */ }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

export function logoutServer() { ls.del(TK); ls.del(US); }

// devolve { token, user } ou null (jogar sem conta)
export async function ensureLogin() {
  const token = ls.get(TK);
  if (token) {
    try { const me = await call('GET', '/api/me', undefined, token); return { token, user: me.user, store: me.store, email: me.email, montaria: me.montaria || null, gm: !!me.gm }; } catch (e) { if (e.status !== 401) return { token, user: ls.get(US) || 'jogador', offline: true }; logoutServer(); }
  }
  return STATUS?.google ? googleOverlay(STATUS.google) : loginOverlay();
}

// ---- Login com Google + senha ----
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => res(); sc.onerror = () => rej(new Error('Não consegui carregar o login do Google.'));
    document.head.appendChild(sc);
  });
}

function googleOverlay(clientId) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'loginov';
    el.innerHTML = `<form class="card loginbox" autocomplete="on">
      <div class="logo sm"><span class="lt">ELDORIA</span></div>
      <h2 class="gtitle">Entre com o Google</h2>
      <p class="muted gstep1">Sua conta é ligada ao seu e-mail do Google e protegida por uma senha. Cada e-mail e cada apelido só podem ter uma conta.</p>
      <div class="gbtn"></div>
      <div class="gform hidden">
        <div class="gmail muted"></div>
        <label class="lnick hidden">Apelido no jogo (único)<input name="nick" maxlength="20" autocomplete="nickname"></label>
        <label>Senha<input name="pass" type="password" maxlength="100" autocomplete="current-password"></label>
        <label class="lpass2 hidden">Repita a senha<input name="pass2" type="password" maxlength="100" autocomplete="new-password"></label>
        <div class="row"><button class="btn primary" data-m="go" type="submit">Entrar</button></div>
        <button class="btn sm ghost hidden" data-m="link" type="button">Já tenho conta antiga (apelido e senha)</button>
      </div>
      <div class="lerr hidden"></div>
      <button class="btn sm ghost" data-m="skip" type="button">Jogar sem conta (salva só neste navegador)</button>
    </form>`;
    document.body.appendChild(el);
    const f = el.querySelector('form'), err = el.querySelector('.lerr'), q = (s) => el.querySelector(s);
    let idToken = null, mode = 'login';
    const showErr = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    const done = (v) => { el.remove(); resolve(v); };
    const setMode = (m, info) => {
      mode = m;
      q('.gform').classList.remove('hidden'); q('.gbtn').classList.add('hidden'); q('.gstep1').classList.add('hidden');
      q('.lnick').classList.toggle('hidden', m === 'login');
      q('.lpass2').classList.toggle('hidden', m !== 'register');
      q('[data-m=link]').classList.toggle('hidden', m === 'login');
      q('.gtitle').textContent = m === 'login' ? `Olá, ${info?.nick || ''}!` : m === 'link' ? 'Ligar conta antiga' : 'Criar sua conta';
      q('.gmail').textContent = (info?.email || '') + (m === 'login' ? ' · digite sua senha' : m === 'link' ? ' · apelido e senha da conta antiga' : ' · escolha um apelido e uma senha');
      q('[data-m=go]').textContent = m === 'login' ? 'Entrar' : m === 'link' ? 'Ligar e entrar' : 'Criar conta';
      q('[data-m=link]').textContent = m === 'link' ? 'Voltar: criar conta nova' : 'Já tenho conta antiga (apelido e senha)';
      setTimeout(() => (m === 'login' ? f.pass : f.nick).focus(), 50);
    };
    let info = null;
    loadGsi().then(() => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          idToken = resp.credential; err.classList.add('hidden');
          try { info = await call('POST', '/api/google', { idToken, mode: 'check' }); setMode(info.exists ? 'login' : 'register', info); }
          catch (e) { showErr(e.message); }
        },
      });
      window.google.accounts.id.renderButton(q('.gbtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR' });
    }).catch((e) => showErr(e.message));
    q('[data-m=link]').addEventListener('click', () => setMode(mode === 'link' ? 'register' : 'link', info));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!idToken) return showErr('Primeiro entre com o Google.');
      const pass = f.pass.value, nick = f.nick.value.trim();
      if (mode === 'register' && pass !== f.pass2.value) return showErr('As senhas não são iguais.');
      for (const b of f.querySelectorAll('button')) b.disabled = true;
      try {
        const j = await call('POST', '/api/google', { idToken, mode, pass, nick });
        ls.set(TK, j.token); ls.set(US, j.user);
        done({ token: j.token, user: j.user, montaria: j.montaria || null, gm: !!j.gm }); // GM já no primeiro login (antes só depois de recarregar)
      } catch (e2) { showErr(e2.message || 'Não deu certo.'); }
      finally { for (const b of f.querySelectorAll('button')) b.disabled = false; }
    });
    q('[data-m=skip]').addEventListener('click', () => done(null));
  });
}

function loginOverlay() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'loginov';
    el.innerHTML = `<form class="card loginbox" autocomplete="on">
      <div class="logo sm"><span class="lt">ELDORIA</span></div>
      <h2 class="ltitle">Entre na sua conta</h2>
      <p class="muted">Seus personagens ficam salvos no servidor: pode limpar o navegador ou trocar de aparelho sem perder nada.</p>
      <label><span class="luser">E-mail ou apelido</span><input name="user" maxlength="80" autocomplete="username" required></label>
      <label class="lemail hidden">E-mail<input name="email" type="email" maxlength="120" autocomplete="email"></label>
      <label>Senha<input name="pass" type="password" maxlength="100" autocomplete="current-password" required></label>
      <label class="lpass2 hidden">Repita a senha<input name="pass2" type="password" maxlength="100" autocomplete="new-password"></label>
      <div class="lerr hidden"></div>
      <div class="row"><button class="btn primary" data-m="go" type="submit">Entrar</button><button class="btn" data-m="toggle" type="button">Criar conta</button></div>
      <button class="btn sm ghost" data-m="skip" type="button">Jogar sem conta (salva só neste navegador)</button>
    </form>`;
    document.body.appendChild(el);
    const f = el.querySelector('form'), err = el.querySelector('.lerr'), q = (x) => el.querySelector(x);
    let reg = false;
    const done = (v) => { el.remove(); resolve(v); };
    const setReg = (on) => {
      reg = on; err.classList.add('hidden');
      q('.ltitle').textContent = on ? 'Criar conta' : 'Entre na sua conta';
      q('.luser').textContent = on ? 'Apelido no jogo (único)' : 'E-mail ou apelido';
      q('.lemail').classList.toggle('hidden', !on); q('.lpass2').classList.toggle('hidden', !on);
      f.email.required = on;
      q('[data-m=go]').textContent = on ? 'Criar conta' : 'Entrar';
      q('[data-m=toggle]').textContent = on ? 'Já tenho conta' : 'Criar conta';
      f.user.focus();
    };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = f.user.value.trim(), pass = f.pass.value;
      if (reg && pass !== f.pass2.value) { err.textContent = 'As senhas não são iguais.'; err.classList.remove('hidden'); return; }
      err.classList.add('hidden');
      for (const bt of f.querySelectorAll('button')) bt.disabled = true;
      try {
        const j = await call('POST', reg ? '/api/register' : '/api/login', { user, pass, email: f.email.value.trim() });
        ls.set(TK, j.token); ls.set(US, j.user);
        done({ token: j.token, user: j.user, email: j.email ?? null, montaria: j.montaria || null, gm: !!j.gm }); // GM já no primeiro login
      } catch (e2) { err.textContent = e2.message || 'Não deu certo. Tente de novo.'; err.classList.remove('hidden'); }
      finally { for (const bt of f.querySelectorAll('button')) bt.disabled = false; }
    });
    q('[data-m=toggle]').addEventListener('click', () => setReg(!reg));
    q('[data-m=skip]').addEventListener('click', () => done(null));
    setTimeout(() => f.user.focus(), 50);
  });
}

// contas antigas sem e-mail: pede para cadastrar (uma vez)
export async function addEmailOverlay(token) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'loginov';
    el.innerHTML = `<form class="card loginbox"><h2>Adicione seu e-mail</h2>
      <p class="muted">Assim você também pode entrar usando o e-mail. Cada e-mail só pode estar em uma conta.</p>
      <label>E-mail<input name="email" type="email" maxlength="120" autocomplete="email" required></label>
      <label>Sua senha atual<input name="pass" type="password" maxlength="100" autocomplete="current-password" required></label>
      <div class="lerr hidden"></div>
      <div class="row"><button class="btn primary" type="submit">Salvar</button><button class="btn" data-m="later" type="button">Agora não</button></div></form>`;
    document.body.appendChild(el);
    const f = el.querySelector('form'), err = el.querySelector('.lerr');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await call('POST', '/api/email', { email: f.email.value.trim(), pass: f.pass.value }, token); el.remove(); resolve(true); }
      catch (e2) { err.textContent = e2.message; err.classList.remove('hidden'); }
    });
    el.querySelector('[data-m=later]').addEventListener('click', () => { el.remove(); resolve(false); });
  });
}

// ---------- nomes únicos (o servidor confere antes de deixar usar) ----------
export async function reserveName(token, name, charId) {
  try { await call('POST', '/api/name/reserve', { name, charId }, token); return { ok: true }; }
  catch (e) { return { ok: false, taken: e.status === 409 || e.status === 400, error: e.message || 'Não foi possível conferir o nome agora.' }; }
}
export function releaseName(token, name, charId) { return call('POST', '/api/name/release', { name, charId }, token).catch(() => {}); }
// personagem antigo com nome repetido: pede um nome novo (não dá para pular)
export function renameOverlay(token, oldName, charId, why) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'loginov';
    el.innerHTML = `<form class="card loginbox"><h2>Escolha outro nome</h2>
      <p class="muted why"></p>
      <label>Nome novo do personagem<input name="nm" maxlength="16" autocomplete="off" required></label>
      <div class="lerr hidden"></div>
      <div class="row"><button class="btn primary" type="submit">Usar este nome</button></div></form>`;
    el.querySelector('p').textContent = (why || `O nome "${oldName}" já é de outro jogador.`) + ' Cada nome só pode existir uma vez no jogo.';
    document.body.appendChild(el);
    const f = el.querySelector('form'), err = el.querySelector('.lerr');
    f.nm.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nm = f.nm.value.replace(/\s+/g, ' ').trim();
      const r = await reserveName(token, nm, charId);
      if (r.ok) { el.remove(); resolve(nm); } else { err.textContent = r.error; err.classList.remove('hidden'); }
    });
  });
}

// "nuvem" do servidor com a mesma forma da do Claude
export function serverCloud(token) {
  const last = (p) => String(p).split('/').filter(Boolean).pop();
  const wrapDoc = (id, data) => ({ id, exists: !!data, data: () => data });
  return {
    collection() {
      return { async get() { const j = await call('GET', '/api/docs', undefined, token); return { docs: (j.docs || []).map((d) => wrapDoc(d.id, d.data)) }; } };
    },
    doc(path) {
      const id = last(path);
      return {
        async get() { const j = await call('GET', '/api/docs/' + encodeURIComponent(id), undefined, token); return wrapDoc(id, j.exists ? j.data : null); },
        async set(data) { await call('PUT', '/api/docs/' + encodeURIComponent(id), data, token); },
        async delete() { await call('DELETE', '/api/docs/' + encodeURIComponent(id), undefined, token); },
      };
    },
  };
}
