// Telas de carregamento: uma cena do próprio jogo (imagens em telas/*.jpg, ao lado do index.html),
// nome do destino, uma dica e uma barrinha. Cobre a troca de mapa para não aparecer o mundo montando.
// Sem as imagens (arquivo aberto no computador), fica o fundo escuro com o logo — nunca quebra.

export const LOAD_SCENES = {
  world: ['vila', 'ponte', 'planicie', 'portao'],
  vila: ['vila'],
  cripta: ['cripta'],
  guardiao: ['planicie', 'portao'],
  ermos: ['ermos'],
  confins: ['confins'],
};

export const TIPS = [
  'Poções grandes curam até 900 de vida. Use as pequenas no começo, que saem bem mais baratas.',
  'O pergaminho de volta à cidade te leva para a vila de qualquer lugar do mundo.',
  'Chaves e itens únicos, como o Anel, não podem ser vendidos, largados nem trocados.',
  'Cada monstro solta peças do conjunto do bioma dele. Yetis gostam de soltar capacetes.',
  'Guarde itens no cofre do banco. Dá para aumentar o espaço dele com ouro.',
  'Ataque e defesa dos itens são fixos: 2 de ataque e 4 de defesa por ponto do item.',
  'O Vigia da cripta volta em 1 minuto, mas só a primeira vitória dá chave, XP e drop.',
  'Em grupo a XP é dividida, e online todo mundo vê os mesmos itens no chão.',
  'A espada do PvP libera no nível 30. Espada amarela: pode apanhar, mas não bate.',
  'Hunts marcadas no mapa (⚔) são ótimos lugares para farmar no seu nível.',
  'Escudos épicos e lendários puxam os monstros para você. Bom para o tanque do grupo.',
  'O arqueiro precisa de flechas: compre com a Fornecedora Lia, perto da praça.',
  'Atributos extras só aparecem em itens míticos (vermelhos) e lendários (brancos).',
  'Portais da fenda soltam monstros aos poucos. Fique perto do grupo!',
  'O mercador mostra o valor de venda de cada item antes de você confirmar.',
  'Caps Lock trava o mouse no PC. Se não travar, clique uma vez na tela do jogo.',
  'Sente a vida baixa? Afaste-se, beba uma poção e volte: os monstros não regeneram.',
  'Raids dão itens só pelo chefe, e ninguém tira lendário de chefe de raid.',
];

export function sceneFor(area, hint) {
  const pool = (hint && LOAD_SCENES[hint]) || LOAD_SCENES[area] || LOAD_SCENES.world;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)]; }

const loaded = new Map(); // nome → 'ok' | 'erro' | Promise

export function preloadScene(name) {
  if (loaded.has(name)) return loaded.get(name);
  const pr = new Promise((res) => {
    const img = new Image();
    img.onload = () => { loaded.set(name, 'ok'); res('ok'); };
    img.onerror = () => { loaded.set(name, 'erro'); res('erro'); };
    img.src = `telas/${name}.jpg`;
  });
  loaded.set(name, pr);
  return pr;
}

// Monta (uma vez) o elemento da tela de carregamento dentro de root.
export function createLoading(root) {
  const el = document.createElement('div');
  el.className = 'loadscr';
  el.innerHTML = `<div class="ls-img"></div><div class="ls-shade"></div>
    <div class="ls-logo">ELDORIA</div>
    <div class="ls-info"><div class="ls-title"></div><div class="ls-sub"></div>
      <div class="ls-bar"><i></i></div><div class="ls-tip"></div></div>`;
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  let busy = false;
  return {
    el,
    get busy() { return busy; },
    // mostra a cena, roda o trabalho pesado (cb) por trás e some depois de pelo menos minMs
    async show({ scene, title = '', sub = '', minMs = 1100 }, cb) {
      if (busy) return; // já carregando: ignora o segundo pedido (clique duplo, portal duas vezes)
      busy = true;
      const st = await Promise.race([preloadScene(scene), new Promise((r) => setTimeout(() => r('lento'), 250))]);
      q('.ls-img').style.backgroundImage = st === 'ok' ? `url("telas/${scene}.jpg")` : '';
      el.classList.toggle('noimg', st !== 'ok');
      q('.ls-title').textContent = title;
      q('.ls-sub').textContent = sub;
      q('.ls-tip').innerHTML = `<b>Dica:</b> ${randomTip()}`;
      const bar = q('.ls-bar i');
      bar.style.transition = 'none'; bar.style.width = '0%';
      el.classList.add('vis'); // fora de uso fica display:none (não pesa na composição da tela)
      void el.offsetWidth;
      el.classList.add('on');
      void bar.offsetWidth;
      bar.style.transition = `width ${minMs}ms cubic-bezier(.3,.7,.4,1)`; bar.style.width = '100%';
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 280)); // termina de escurecer antes do trabalho pesado
      try { cb?.(); } catch (e) { console.error(e); globalThis.__eldCapture?.(e, { origem: 'carregamento' }); }
      const left = minMs - (performance.now() - t0);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      el.classList.remove('on');
      await new Promise((r) => setTimeout(r, 420));
      el.classList.remove('vis');
      busy = false;
    },
  };
}
