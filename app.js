/* Ritual. Com config.js preenchido, roda no Supabase (login, dados e painel em tempo real).
   Sem config, ou com ?demo na URL, roda como prévia com dados de demonstração no navegador. */

const LS = 'ritual-andresa-v1';

const HABITS = [
  { k: 'treino', t: 'Treino', s: 'Movimentei o corpo hoje' },
  { k: 'dieta', t: 'Dieta', s: 'Segui o plano alimentar' },
  { k: 'agua', t: 'Água', s: 'Bati a meta de água' },
  { k: 'cardio', t: 'Cardio', s: 'Fiz o cardio do dia' },
];
const SCALES = [
  { k: 'sono', t: 'Sono', q: 'Como foi a sua noite?', l: ['Muito ruim', 'Ruim', 'Regular', 'Boa', 'Excelente'] },
  { k: 'emocional', t: 'Emocional', q: 'Como você está por dentro?', l: ['Muito pesado', 'Pesado', 'Neutro', 'Leve', 'Muito leve'] },
  { k: 'produtividade', t: 'Produtividade', q: 'Como rendeu o seu dia?', l: ['Travado', 'Lento', 'Mediano', 'Bom', 'Voando'] },
];
const LEVELS = [
  { n: 'Semente', p: 0 }, { n: 'Broto', p: 400 }, { n: 'Raiz', p: 1000 },
  { n: 'Flor', p: 2000 }, { n: 'Essência', p: 3500 },
];
const BADGES = [
  { k: 'first', t: 'Primeiro ritual', d: 'Fechou o primeiro dia.' },
  { k: 's7', t: 'Sete dias', d: 'Uma semana inteira sem quebrar a sequência.' },
  { k: 'water', t: 'Bem hidratada', d: 'Água em dia por 7 dias seguidos.' },
  { k: 'voice', t: 'Colocou pra fora', d: 'Escreveu o porquê de como estava 5 vezes.' },
  { k: 'aware', t: 'Autoconhecimento', d: 'Registrou sono e emocional por 14 dias.' },
  { k: 'perfect', t: 'Semana impecável', d: 'Treino e dieta em dia nos últimos 7 dias.' },
  { k: 's21', t: 'Hábito formado', d: '21 dias seguidos de ritual.' },
];

/* datas */
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => key(new Date());
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = k => cap(fromKey(k).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
const shortDate = k => fromKey(k).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
const fmt = n => n.toLocaleString('pt-BR');
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const f1 = n => n == null ? '' : n.toFixed(1).replace('.', ',');
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* armazenamento */
const CFG = window.RITUAL || {};
const LIVE = !!(CFG.url && CFG.key) && !new URLSearchParams(location.search).has('demo');
let sb = null;
let db;
function load() {
  if (LIVE) { db = { users: {}, entries: {}, session: null }; return; }
  try { db = JSON.parse(localStorage.getItem(LS)); } catch (e) { db = null; }
  if (!db || !db.users) { db = seed(); save(); }
}
function save() { if (LIVE) return; try { localStorage.setItem(LS, JSON.stringify(db)); } catch (e) {} }

/* grava o dia no Supabase (ou no navegador, na prévia) */
const timers = {};
function persist(k, now) {
  if (!LIVE) return save();
  clearTimeout(timers[k]);
  const go = async () => {
    const e = db.entries[db.session][k];
    const { error } = await sb.from('entries').upsert({ user_id: db.session, dia: k, h: e.h, s: e.s, n: e.n, closed: e.closed, atualizado_em: new Date().toISOString() });
    if (error) toast('Não consegui salvar. Confira a internet e tente de novo.');
  };
  if (now) go(); else timers[k] = setTimeout(go, 400);
}
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 4000);
}
const rowToEntry = r => ({ h: r.h || {}, s: r.s || {}, n: r.n || {}, closed: !!r.closed });

async function loadProfiles() {
  const { data } = await sb.from('profiles').select('user_id,nome,email');
  (data || []).forEach(p => {
    const old = db.users[p.user_id];
    db.users[p.user_id] = { name: p.nome || cap(p.email.split('@')[0]), email: p.email, role: old ? old.role : 'client' };
  });
}
async function loadLive(user) {
  db.session = user.id;
  db.users = {}; db.entries = {};
  const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  await loadProfiles();
  if (!db.users[user.id]) db.users[user.id] = { name: (user.user_metadata && user.user_metadata.nome) || cap(user.email.split('@')[0]), email: user.email, role: 'client' };
  if (adm) db.users[user.id].role = 'admin';
  const since = key(addDays(new Date(), -90));
  const { data: rows } = await sb.from('entries').select('user_id,dia,h,s,n,closed').gte('dia', since);
  (rows || []).forEach(r => { (db.entries[r.user_id] = db.entries[r.user_id] || {})[r.dia] = rowToEntry(r); });
  if (adm) listen();
}
let channel = null;
function listen() {
  if (channel) return;
  channel = sb.channel('painel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, async ({ new: r }) => {
      if (!r || !r.user_id) return;
      (db.entries[r.user_id] = db.entries[r.user_id] || {})[r.dia] = rowToEntry(r);
      if (!db.users[r.user_id]) await loadProfiles();
      if (me() && me().role === 'admin') render();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, async () => {
      await loadProfiles();
      if (me() && me().role === 'admin') render();
    })
    .subscribe();
}

function seed() {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const NOTES = {
    sono: ['Acordei várias vezes de madrugada.', 'Fiquei no celular até tarde.', 'Calor demais, não descansei.', 'Bebê acordou a noite toda.'],
    emocional: ['Acordei triste sem motivo.', 'Discussão em casa me tirou do eixo.', 'Ansiosa com o trabalho.', 'Me senti sozinha hoje.', 'Cansada de tudo.'],
    produtividade: ['Reunião atrás de reunião.', 'Não consegui focar.'],
  };
  const users = { 'andresa@ritual.app': { name: 'Andresa Alves', role: 'admin' } };
  const entries = {};
  const people = [
    { e: 'camila@demo.com', n: 'Camila Rocha', from: 16, to: 1, mood: 0 },
    { e: 'juliana@demo.com', n: 'Juliana Prado', from: 20, to: 0, mood: -1 },
    { e: 'marina@demo.com', n: 'Marina Teles', from: 12, to: 0, mood: 1 },
    { e: 'beatriz@demo.com', n: 'Beatriz Nunes', from: 25, to: 0, mood: 0 },
    { e: 'larissa@demo.com', n: 'Larissa Gomes', from: 14, to: 4, mood: 0 },
  ];
  const now = new Date();
  for (const p of people) {
    users[p.e] = { name: p.n, role: 'client' };
    entries[p.e] = {};
    for (let i = p.from; i >= p.to; i--) {
      if (rnd() < 0.08 && i > 2) continue;
      const k = key(addDays(now, -i));
      const recentLow = p.mood < 0 && i < 4;
      const sc = v => Math.max(1, Math.min(5, Math.round(v)));
      const sono = sc(3.6 + p.mood * 0.6 + (rnd() * 2.6 - 1.3) - (recentLow ? 1.6 : 0));
      const emocional = sc(3.5 + p.mood * 0.7 + (rnd() * 2.6 - 1.3) - (recentLow ? 1.8 : 0));
      const produtividade = sc(3.4 + (rnd() * 2.4 - 1.2));
      const tough = sono <= 2 || emocional <= 2;
      const e = {
        h: { treino: rnd() < (tough ? 0.45 : 0.85), dieta: rnd() < (tough ? 0.3 : 0.9), agua: rnd() < 0.82, cardio: rnd() < (tough ? 0.35 : 0.7) },
        s: { sono, emocional, produtividade },
        n: {},
        closed: true,
      };
      for (const sk of ['sono', 'emocional', 'produtividade']) if (e.s[sk] <= 2 && rnd() < 0.8) e.n[sk] = pick(NOTES[sk]);
      entries[p.e][k] = e;
    }
  }
  return { users, entries, session: null };
}

/* regras do jogo */
function entryOf(email, k) {
  const all = db.entries[email] || (db.entries[email] = {});
  return all[k] || (all[k] = { h: {}, s: {}, n: {}, closed: false });
}
function pointsOf(e) {
  if (!e) return 0;
  let p = 0;
  HABITS.forEach(h => { if (e.h[h.k]) p += 10; });
  SCALES.forEach(s => { if (e.s[s.k]) p += 5; if (e.n[s.k]) p += 5; });
  if (e.closed) p += 10;
  return p;
}
const MAX_DAY = 4 * 10 + 3 * 10 + 10;
function totalPoints(email) {
  const all = db.entries[email] || {};
  return Object.values(all).reduce((t, e) => t + pointsOf(e), 0) + streak(email) * 5;
}
function streak(email) {
  const all = db.entries[email] || {};
  let d = new Date();
  if (!(all[key(d)] && all[key(d)].closed)) d = addDays(d, -1);
  let n = 0;
  while (all[key(d)] && all[key(d)].closed) { n++; d = addDays(d, -1); }
  return n;
}
function levelOf(pts) {
  let i = 0;
  LEVELS.forEach((l, j) => { if (pts >= l.p) i = j; });
  return { cur: LEVELS[i], next: LEVELS[i + 1] };
}
function lastDays(email, n) {
  const all = db.entries[email] || {};
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const k = key(addDays(new Date(), -i)); out.push([k, all[k]]); }
  return out;
}
function earned(email) {
  const all = db.entries[email] || {};
  const got = new Set();
  const closed = Object.values(all).filter(e => e.closed);
  if (closed.length) got.add('first');
  const st = streak(email);
  if (st >= 7) got.add('s7');
  if (st >= 21) got.add('s21');
  const l7 = lastDays(email, 7).map(x => x[1]);
  if (l7.every(e => e && e.h.agua)) got.add('water');
  if (l7.every(e => e && e.h.treino && e.h.dieta)) got.add('perfect');
  const notes = Object.values(all).reduce((t, e) => t + Object.values(e.n || {}).filter(Boolean).length, 0);
  if (notes >= 5) got.add('voice');
  if (lastDays(email, 14).every(x => x[1] && x[1].s.sono && x[1].s.emocional)) got.add('aware');
  return got;
}

/* o cruzamento que a Andresa pediu: dieta x sono x emocional */
function insight(email, n, who) {
  const days = lastDays(email, n).map(x => x[1]).filter(e => e && e.closed && e.s.sono && e.s.emocional);
  const slip = days.filter(e => !e.h.dieta), ok = days.filter(e => e.h.dieta);
  const voc = who === 'client' ? ['seu', 'você'] : ['o', 'ela'];
  if (days.length < 3) return `<p>Com mais alguns dias registrados aparece aqui a leitura do que mexe com a dieta.</p>`;
  if (!slip.length) return `<p>Nenhum escape na dieta nos últimos ${n} dias. <em>Sono médio ${f1(avg(days.map(e => e.s.sono)))}, emocional ${f1(avg(days.map(e => e.s.emocional)))}.</em></p>`;
  const sS = avg(slip.map(e => e.s.sono)), eS = avg(slip.map(e => e.s.emocional));
  const sO = avg(ok.map(e => e.s.sono)), eO = avg(ok.map(e => e.s.emocional));
  let txt = `Nos <em>${slip.length} ${slip.length > 1 ? 'dias' : 'dia'}</em> em que a dieta escapou, ${voc[0]} sono ficou em <em>${f1(sS)}</em> e o emocional em <em>${f1(eS)}</em>.`;
  if (ok.length) txt += ` Nos dias de dieta em dia: ${f1(sO)} e ${f1(eO)}.`;
  if (ok.length && (sO - sS > 0.7 || eO - eS > 0.7)) {
    const which = (eO - eS) >= (sO - sS) ? 'o emocional' : 'o sono';
    txt += ` O gatilho mais provável é ${which}.`;
  }
  return `<p>${txt}</p>`;
}

/* estado da tela */
const ui = { view: 'today', step: LIVE ? 'login' : 'email', email: '', nome: '', err: '', ok: '', busy: false, anim: null, client: null };
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const me = () => db.session && db.users[db.session];

function render() {
  const u = me();
  if (!u) return renderLogin();
  if (u.role === 'admin') return ui.admin === 'tutorial' ? renderTutorial() : ui.client ? renderClientDetail(ui.client) : renderPanel();
  const views = { today: renderToday, week: renderWeek, badges: renderBadges };
  app.innerHTML = `
    <div class="wrap">
      <header class="top"><span class="brand">Ritual</span><button class="link" data-a="logout">Sair</button></header>
      ${views[ui.view]()}
    </div>
    <nav class="tabs"><div>
      ${[['today', 'Hoje'], ['week', 'Semana'], ['badges', 'Conquistas']].map(([v, t]) => `<button data-a="tab" data-v="${v}" class="${ui.view === v ? 'on' : ''}">${t}</button>`).join('')}
    </div></nav>`;
  ui.anim = null;
}

function renderLogin() {
  if (LIVE) return renderLiveLogin();
  const code = ui.step === 'code';
  app.innerHTML = `
    <div class="wrap"><section class="login">
      <h1>Ritual</h1>
      <p class="by">por Andresa Alves</p>
      <p class="lead">Seu dia em um minuto. Treino, dieta, sono e emoções no mesmo lugar.</p>
      ${code ? `
        <label class="flabel" for="code">Código enviado para ${esc(ui.email)}</label>
        <input id="code" class="field code" inputmode="numeric" maxlength="6" placeholder="······" autocomplete="one-time-code">
        <button class="cta" data-a="verify">Entrar</button>
        <p class="hint">Na prévia qualquer código entra.</p>
        <button class="link" style="margin-top:12px" data-a="restart">Trocar e-mail</button>
      ` : `
        <label class="flabel" for="email">Seu e-mail</label>
        <input id="email" class="field" type="email" placeholder="voce@email.com" autocomplete="email">
        <button class="cta" data-a="send">Entrar</button>
      `}
      <div class="demo">
        <p class="flabel">Prévia</p>
        <button data-a="demo" data-e="camila@demo.com">Entrar como cliente (Camila)</button>
        <button data-a="demo" data-e="andresa@ritual.app">Entrar como Andresa (painel)</button>
      </div>
    </section></div>`;
}

function renderLiveLogin() {
  const m = ui.step;
  const title = { login: 'Entrar', signup: 'Criar sua conta', forgot: 'Recuperar a senha', newpass: 'Nova senha' }[m] || 'Entrar';
  const btn = { login: 'Entrar', signup: 'Criar conta', forgot: 'Enviar link', newpass: 'Salvar senha' }[m];
  app.innerHTML = `
    <div class="wrap"><form class="login" data-form="${m}" novalidate>
      <h1>Ritual</h1>
      <p class="by">por Andresa Alves</p>
      <p class="lead">Seu dia em um minuto. Treino, dieta, sono e emoções no mesmo lugar.</p>
      <h2 class="form-title">${title}</h2>
      ${m === 'signup' ? `<label class="flabel" for="nome">Seu nome</label><input id="nome" class="field" autocomplete="name" placeholder="Como você quer ser chamada" value="${esc(ui.nome)}">` : ''}
      ${m !== 'newpass' ? `<label class="flabel" for="email">Seu e-mail</label><input id="email" class="field" type="email" autocomplete="email" placeholder="voce@email.com" value="${esc(ui.email)}">` : ''}
      ${m !== 'forgot' ? `<label class="flabel" for="senha">${m === 'newpass' ? 'Nova senha' : 'Senha'}</label><input id="senha" class="field" type="password" autocomplete="${m === 'login' ? 'current-password' : 'new-password'}"${m !== 'login' ? ' aria-describedby="senha-dica"' : ''}>
        ${m !== 'login' ? '<p class="hint" id="senha-dica">Pelo menos 6 caracteres.</p>' : ''}` : ''}
      ${ui.err ? `<p class="err" role="alert">${esc(ui.err)}</p>` : ''}
      ${ui.ok ? `<p class="okmsg" role="status">${esc(ui.ok)}</p>` : ''}
      <button class="cta" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Aguarde...' : btn}</button>
      <div class="alt">
        ${m === 'login' ? '<button type="button" class="link" data-a="mode" data-m="signup">Primeira vez? Criar conta</button><button type="button" class="link" data-a="mode" data-m="forgot">Esqueci a senha</button>' : ''}
        ${m === 'signup' || m === 'forgot' ? '<button type="button" class="link" data-a="mode" data-m="login">Já tenho conta</button>' : ''}
      </div>
    </form></div>`;
}

async function submitLogin(m) {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const email = val('email').toLowerCase(), nome = val('nome');
  const senhaEl = document.getElementById('senha'), senha = senhaEl ? senhaEl.value : '';
  ui.email = email; ui.nome = nome; ui.err = ''; ui.ok = '';
  if (m !== 'newpass' && !/^\S+@\S+\.\S+$/.test(email)) { ui.err = 'Confira o e-mail.'; return render(); }
  if (m === 'signup' && !nome) { ui.err = 'Coloque o seu nome.'; return render(); }
  if ((m === 'signup' || m === 'newpass') && senha.length < 6) { ui.err = 'A senha precisa de pelo menos 6 caracteres.'; return render(); }
  ui.busy = true; render();
  let res;
  if (m === 'login') res = await sb.auth.signInWithPassword({ email, password: senha });
  else if (m === 'signup') res = await sb.auth.signUp({ email, password: senha, options: { data: { nome } } });
  else if (m === 'forgot') res = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  else res = await sb.auth.updateUser({ password: senha });
  ui.busy = false;
  if (res.error) {
    const msg = res.error.message || '';
    ui.err = /Invalid login/i.test(msg) ? 'E-mail ou senha não conferem.'
      : /already registered|already been registered/i.test(msg) ? 'Esse e-mail já tem conta. Use Entrar.'
      : /rate limit/i.test(msg) ? 'Muitas tentativas. Espere alguns minutos.'
      : 'Não deu certo agora. Tente de novo.';
    return render();
  }
  if (m === 'forgot') { ui.ok = 'Se esse e-mail tiver conta, o link chega em alguns minutos.'; return render(); }
  const { data } = await sb.auth.getUser();
  if (!data.user) { ui.err = 'Conta criada. Entre com seu e-mail e senha.'; ui.step = 'login'; return render(); }
  await loadLive(data.user);
  ui.step = 'login'; ui.view = 'today'; render(); window.scrollTo(0, 0);
}

function renderToday() {
  const u = me(), k = today(), e = entryOf(db.session, k);
  const pts = totalPoints(db.session), st = streak(db.session), lv = levelOf(pts);
  const h = new Date().getHours();
  const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const first = u.name.split(' ')[0];
  return `
    <section class="hero">
      <h1>${hi}, ${esc(first)}.</h1>
      <p class="sub">${longDate(k)}. ${e.closed ? `Dia ${st} da sua sequência fechado.` : `Feche o dia para chegar a ${st + 1} ${st + 1 === 1 ? 'dia seguido' : 'dias seguidos'}.`}</p>
      <div class="stats">
        <div><span class="num">${st}</span><span class="lbl">${st === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
        <div><span class="num">${fmt(pts)}</span><span class="lbl">pontos</span></div>
        <div><span class="num">${lv.cur.n}</span><span class="lbl">nível</span></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Hábitos do dia</h2><span>${pointsOf(e)} de ${MAX_DAY} pts</span></div>
      ${HABITS.map(x => `
        <button class="habit ${e.h[x.k] ? 'done' : ''}" data-a="habit" data-k="${x.k}">
          <span><span class="t">${x.t}</span><span class="s">${x.s}</span></span>
          <span class="right"><span class="pts">+10</span><span class="box ${ui.anim === x.k ? 'anim' : ''}">${e.h[x.k] ? '<svg viewBox="0 0 18 18"><path d="M3 9.5l4 4 8-9"/></svg>' : ''}</span></span>
        </button>`).join('')}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Como você está</h2><span>de 1 a 5</span></div>
      ${SCALES.map(s => {
        const v = e.s[s.k];
        return `
        <div class="scale">
          <div class="t">${s.t}</div><div class="q">${s.q}</div>
          <div class="nums">${[1, 2, 3, 4, 5].map(n => `<button data-a="scale" data-k="${s.k}" data-v="${n}" class="${v === n ? 'on' : ''} ${v === n && n <= 2 ? 'low' : ''}" aria-label="${s.t} ${n}">${n}</button>`).join('')}</div>
          <div class="scale-lbl">${v ? s.l[v - 1] : ''}</div>
          ${v ? `<textarea class="note" rows="1" data-k="${s.k}" placeholder="${v <= 2 ? 'O que aconteceu? Escreve aqui.' : 'Por quê? (opcional)'}">${esc(e.n[s.k])}</textarea>` : ''}
        </div>`;
      }).join('')}
    </section>
    ${e.closed
      ? `<p class="closed-msg">Dia fechado. Dá pra ajustar até a meia-noite.</p>`
      : `<button class="cta" data-a="close">Fechar o dia</button>`}
  `;
}

function weekKeys() {
  const d = new Date(), dow = (d.getDay() + 6) % 7;
  const mon = addDays(d, -dow);
  return [0, 1, 2, 3, 4, 5, 6].map(i => key(addDays(mon, i)));
}
function gridRows(email, keys, showToday) {
  const all = db.entries[email] || {};
  const head = keys.map(k => {
    const d = fromKey(k);
    const lab = d.toLocaleDateString('pt-BR', { weekday: 'narrow' });
    return `<th class="${showToday && k === today() ? 'today' : ''}">${lab}<br>${d.getDate()}</th>`;
  }).join('');
  const hab = HABITS.map(h => `<tr><td>${h.t}</td>${keys.map(k => {
    const e = all[k];
    if (!e || !e.closed && !Object.keys(e.h).length) return `<td class="mute">-</td>`;
    return e.h[h.k] ? `<td class="ck"><svg class="tick" viewBox="0 0 18 18" aria-label="feito"><path d="M4 9.5l3.5 3.5 7-8"/></svg></td>` : `<td class="mute">-</td>`;
  }).join('')}</tr>`).join('');
  const sc = SCALES.slice(0, 2).map(s => `<tr><td>${s.t}</td>${keys.map(k => {
    const v = all[k] && all[k].s[s.k];
    return v ? `<td class="${v <= 2 ? 'lo' : ''}">${v}</td>` : `<td class="mute">-</td>`;
  }).join('')}</tr>`).join('');
  return `<table class="grid"><thead><tr><th></th>${head}</tr></thead><tbody>${hab}${sc}</tbody></table>`;
}
function whys(email, keys) {
  const all = db.entries[email] || {};
  const out = [];
  keys.slice().reverse().forEach(k => {
    const e = all[k];
    if (!e) return;
    SCALES.forEach(s => { if (e.n[s.k]) out.push(`<div class="why"><span class="d">${shortDate(k)} · ${s.t} ${e.s[s.k]}</span><p>${esc(e.n[s.k])}</p></div>`); });
  });
  return out.length ? out.join('') : `<p class="hint">Nenhum porquê escrito nesse período.</p>`;
}

function renderWeek() {
  const keys = weekKeys();
  return `
    <section class="hero">
      <h1>Sua semana</h1>
      <p class="sub">De ${fromKey(keys[0]).getDate()} a ${fromKey(keys[6]).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</p>
    </section>
    <div class="panel"><div class="panel-head"><h2>Hábitos e escalas</h2><span>de 1 a 5</span></div><div class="grid-card scroll">${gridRows(db.session, keys, true)}</div></div>
    <div class="panel insight"><div class="flabel">Leitura dos últimos 14 dias</div>${insight(db.session, 14, 'client')}</div>
    <section class="panel"><div class="panel-head"><h2>Seus porquês</h2></div>${whys(db.session, keys)}</section>`;
}

function renderBadges() {
  const pts = totalPoints(db.session), lv = levelOf(pts), got = earned(db.session);
  return `
    <section class="panel level">
      <p class="flabel">Seu nível</p>
      <span class="num">${lv.cur.n}</span>
      <p>${fmt(pts)} pontos${lv.next ? ` · faltam ${fmt(lv.next.p - pts)} para ${lv.next.n}` : ' · nível máximo'}</p>
    </section>
    <section class="panel"><div class="panel-head"><h2>Conquistas</h2><span>${got.size} de ${BADGES.length}</span></div>
      ${BADGES.map((b, i) => `<div class="badge ${got.has(b.k) ? '' : 'locked'}"><span class="mark">${got.has(b.k) ? '<svg viewBox="0 0 18 18"><path d="M4 9.5l3.5 3.5 7-8"/></svg>' : ''}</span><div><h3>${b.t}</h3><p>${b.d}</p></div></div>`).join('')}
    </section>
    <section class="panel"><div class="panel-head"><h2>Como pontua</h2></div>
      <p class="hint" style="font-size:13px;line-height:1.7">Cada hábito marcado vale 10. Cada escala preenchida vale 5, e escrever o porquê vale mais 5. Fechar o dia vale 10, e cada dia de sequência soma 5 de bônus.</p>
    </section>`;
}

/* painel da Andresa */
function clientStats(email) {
  const all = db.entries[email] || {};
  const l7 = lastDays(email, 7).map(x => x[1]).filter(e => e && e.closed);
  const t = all[today()];
  let lastK = Object.keys(all).filter(k => all[k].closed).sort().pop();
  const gap = lastK ? Math.round((fromKey(today()) - fromKey(lastK)) / 864e5) : 99;
  const l3 = lastDays(email, 3).map(x => x[1]).filter(e => e && e.closed);
  const flags = [];
  if (gap >= 2) flags.push(`Sem registro há ${gap} dias`);
  if (l3.filter(e => e.s.emocional <= 2).length >= 2) flags.push('Emocional baixo');
  if (l3.filter(e => e.s.sono <= 2).length >= 2) flags.push('Sono ruim');
  return {
    today: !!(t && t.closed),
    streak: streak(email),
    sono: avg(l7.map(e => e.s.sono).filter(Boolean)),
    emo: avg(l7.map(e => e.s.emocional).filter(Boolean)),
    dieta: l7.length ? Math.round(100 * l7.filter(e => e.h.dieta).length / l7.length) : null,
    flags,
  };
}
/* topo do painel com as abas Clientes e Tutorial */
function adminTop() {
  const on = ui.admin === 'tutorial' ? 'tutorial' : 'clientes';
  return `<header class="top admin-top">
      <span class="brand">Ritual <span class="brand-sub">Painel da Andresa</span></span>
      <nav class="atabs" aria-label="Painel">
        <button data-a="atab" data-v="clientes" class="${on === 'clientes' ? 'on' : ''}">Clientes</button>
        <button data-a="atab" data-v="tutorial" class="${on === 'tutorial' ? 'on' : ''}">Tutorial</button>
      </nav>
      <button class="link" data-a="logout">Sair</button>
    </header>`;
}

const appLink = () => location.origin + location.pathname.replace(/index\.html$/, '');
const inviteMsg = () => `Oi! A partir de agora a gente vai acompanhar o seu dia pelo Ritual. Entra em ${appLink()} , toca em "Primeira vez? Criar conta" e cadastra seu nome, e-mail e uma senha. Depois salva na tela inicial do celular para abrir como aplicativo. Todo dia, antes de dormir, marca seus hábitos, dá a nota do sono e do emocional e toca em "Fechar o dia". Leva um minuto.`;

function renderTutorial() {
  app.innerHTML = `
    <div class="wrap wide">
      ${adminTop()}
      <section class="panel-h">
        <h1>Como o Ritual funciona</h1>
        <p class="sub">O caminho da sua cliente, do convite ao painel, e o que você acompanha daqui.</p>
      </section>

      <div class="two tut">
        <section class="panel">
          <div class="panel-head"><h2>Convide suas clientes</h2></div>
          <p class="tut-p">Mande o link do app. Cada cliente cria a própria conta em menos de um minuto, sem código e sem baixar nada.</p>
          <div class="linkbox"><span>${esc(appLink())}</span><button class="copy" data-a="copy" data-what="link">Copiar link</button></div>
          <p class="flabel" style="margin-top:16px">Mensagem pronta para o WhatsApp</p>
          <div class="msg">${esc(inviteMsg())}</div>
          <button class="copy" style="margin-top:10px" data-a="copy" data-what="msg">Copiar mensagem</button>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>O que você vê no painel</h2></div>
          <dl class="tut-dl">
            <dt>Lista de clientes</dt>
            <dd>Quem já fechou o dia hoje, a sequência de dias seguidos e as médias dos últimos 7 dias de sono, emocional e dieta.</dd>
            <dt>Sinais em vermelho</dt>
            <dd><b>Emocional baixo</b> ou <b>Sono ruim</b> quando a nota foi 1 ou 2 em dois dos últimos três dias. <b>Sem registro</b> quando ela passou 2 dias ou mais sem fechar o dia. Quem tem sinal aparece primeiro.</dd>
            <dt>Tempo real</dt>
            <dd>Quando uma cliente fecha o dia, o painel atualiza sozinho, sem recarregar a página.</dd>
            <dt>Detalhe da cliente</dt>
            <dd>Toque no nome para ver os últimos 14 dias, a leitura do que mexe com a dieta dela (cruza os escapes com o sono e o emocional e aponta o gatilho mais provável) e tudo o que ela escreveu nos porquês.</dd>
          </dl>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>O caminho da cliente</h2><span>como ela usa no dia a dia</span></div>
        <ol class="steps">
          <li><h3>Cria a conta</h3><p>Abre o link, toca em <b>Primeira vez? Criar conta</b> e coloca nome, e-mail e uma senha de pelo menos 6 caracteres. Entra na hora.</p></li>
          <li><h3>Salva na tela inicial</h3><p><b>iPhone:</b> no Safari, botão Compartilhar e depois Adicionar à Tela de Início. <b>Android:</b> no Chrome, menu de três pontos e depois Adicionar à tela inicial. Fica com ícone, como um aplicativo.</p></li>
          <li><h3>Preenche o dia na aba Hoje</h3><p>Marca treino, dieta, água e cardio. Dá nota de 1 a 5 para sono, emocional e produtividade. Quando a nota é 1 ou 2, o app pede para ela escrever o que aconteceu.</p></li>
          <li><h3>Fecha o dia</h3><p>Toca em <b>Fechar o dia</b>, ganha os pontos e soma mais um dia na sequência. Dá para ajustar até a meia-noite.</p></li>
          <li><h3>Acompanha a evolução</h3><p>Na aba <b>Semana</b> vê a grade dos 7 dias, a leitura do que mexe com a dieta e os próprios porquês. Na aba <b>Conquistas</b> vê o nível e as medalhas.</p></li>
        </ol>
      </section>

      <div class="two tut">
        <section class="panel">
          <div class="panel-head"><h2>Como ela ganha pontos</h2></div>
          <table class="mini">
            <tr><td>Cada hábito marcado</td><td class="r">10</td></tr>
            <tr><td>Cada escala preenchida</td><td class="r">5</td></tr>
            <tr><td>Escrever o porquê</td><td class="r">5</td></tr>
            <tr><td>Fechar o dia</td><td class="r">10</td></tr>
            <tr><td>Cada dia de sequência</td><td class="r">5</td></tr>
          </table>
          <p class="tut-p" style="margin-top:14px">Níveis: ${LEVELS.map(l => `${l.n}${l.p ? ` (${fmt(l.p)})` : ''}`).join(', ')}. Medalhas: ${BADGES.map(b => b.t).join(', ')}.</p>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Dúvidas comuns</h2></div>
          <dl class="tut-dl">
            <dt>Ela esqueceu a senha</dt>
            <dd>Na tela de entrada, <b>Esqueci a senha</b>. O link chega no e-mail dela em alguns minutos.</dd>
            <dt>Uma cliente vê as outras?</dt>
            <dd>Não. Cada cliente vê só os próprios dias. Só você vê todas.</dd>
            <dt>Trocou de celular</dt>
            <dd>É só entrar de novo com e-mail e senha. Tudo fica salvo na nuvem.</dd>
            <dt>Precisa de internet?</dt>
            <dd>Sim, para salvar. Se a conexão cair, aparece um aviso na tela.</dd>
          </dl>
        </section>
      </div>
    </div>`;
}

function renderPanel() {
  const clients = Object.entries(db.users).filter(([, u]) => u.role === 'client');
  const rows = clients.map(([e, u]) => ({ e, u, s: clientStats(e) }))
    .sort((a, b) => b.s.flags.length - a.s.flags.length || a.u.name.localeCompare(b.u.name));
  const filled = rows.filter(r => r.s.today).length, attn = rows.filter(r => r.s.flags.length).length;
  const avgEmo = avg(rows.map(r => r.s.emo).filter(v => v != null));
  app.innerHTML = `
    <div class="wrap wide">
      ${adminTop()}
      <section class="panel-h">
        <h1>Bom dia, Andresa.</h1>
        <p class="sub">${longDate(today())}. ${attn ? `${attn} ${attn > 1 ? 'clientes pedem' : 'cliente pede'} atenção hoje.` : 'Nenhuma cliente pede atenção hoje.'}</p>
      </section>
      <div class="summary">
        <div><span class="num">${rows.length}</span><span class="lbl">clientes</span></div>
        <div><span class="num">${filled}</span><span class="lbl">fecharam o dia</span></div>
        <div><span class="num" style="${attn ? 'color:var(--negative)' : ''}">${attn}</span><span class="lbl">pedem atenção</span></div>
        <div><span class="num">${f1(avgEmo)}</span><span class="lbl">emocional médio</span></div>
      </div>
      <div class="tbl-card scroll"><table class="tbl">
        <thead><tr><th>Cliente</th><th>Hoje</th><th class="r">Sequência</th><th class="r hide-m">Sono 7d</th><th class="r hide-m">Emocional 7d</th><th class="r hide-m">Dieta 7d</th><th>Sinal</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr class="row" data-a="open" data-e="${r.e}">
            <td class="name">${esc(r.u.name)}</td>
            <td class="${r.s.today ? 'ok' : 'pend'}">${r.s.today ? 'Fechou' : 'Pendente'}</td>
            <td class="r">${r.s.streak}</td>
            <td class="r hide-m ${r.s.sono != null && r.s.sono < 2.6 ? 'lo' : ''}">${f1(r.s.sono)}</td>
            <td class="r hide-m ${r.s.emo != null && r.s.emo < 2.6 ? 'lo' : ''}">${f1(r.s.emo)}</td>
            <td class="r hide-m">${r.s.dieta == null ? '' : r.s.dieta + '%'}</td>
            <td class="flag">${r.s.flags.join('<br>')}</td>
          </tr>`).join('') || `<tr><td colspan="7" class="empty">Nenhuma cliente ainda. Na aba Tutorial tem o link e a mensagem pronta para convidar.</td></tr>`}</tbody>
      </table></div>
      <p class="hint" style="margin-top:18px">Atualiza sozinho quando uma cliente fecha o dia. Toque numa cliente para ver o detalhe.</p>
    </div>`;
}
function renderClientDetail(email) {
  const u = db.users[email], s = clientStats(email);
  const keys = lastDays(email, 14).map(x => x[0]);
  app.innerHTML = `
    <div class="wrap wide">
      ${adminTop()}
      <button class="link back" data-a="panel">Voltar para todas</button>
      <section class="panel-h" style="padding-top:18px">
        <h1>${esc(u.name)}</h1>
        <p class="sub">${esc(u.email || email)}</p>
        ${s.flags.length ? `<p class="flag" style="margin-top:10px">${s.flags.join(' · ')}</p>` : ''}
      </section>
      <div class="summary">
        <div><span class="num">${s.streak}</span><span class="lbl">dias seguidos</span></div>
        <div><span class="num">${f1(s.sono)}</span><span class="lbl">sono 7d</span></div>
        <div><span class="num">${f1(s.emo)}</span><span class="lbl">emocional 7d</span></div>
        <div><span class="num">${s.dieta == null ? '' : s.dieta + '%'}</span><span class="lbl">dieta 7d</span></div>
      </div>
      <div class="panel insight"><div class="flabel">O que mexe com a dieta dela</div>${insight(email, 14, 'admin')}</div>
      <div class="two">
        <div class="panel">
          <div class="panel-head"><h2>Últimos 14 dias</h2><span>sono e emocional de 1 a 5</span></div>
          <div class="grid-card scroll">${gridRows(email, keys, true)}</div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>O que ela escreveu</h2></div>
          ${whys(email, keys)}
        </div>
      </div>
    </div>`;
}

/* fechar o dia */
function closeDay() {
  const before = earned(db.session);
  const e = entryOf(db.session, today());
  e.closed = true; persist(today(), true);
  const got = earned(db.session);
  const fresh = BADGES.filter(b => got.has(b.k) && !before.has(b.k));
  const st = streak(db.session), dayPts = pointsOf(e) + 5;
  overlay.hidden = false;
  overlay.innerHTML = `<div>
    <div class="big" id="count">+0</div>
    <h2>Dia fechado.</h2>
    <p>${st === 1 ? 'Primeiro dia da sua sequência.' : `${st} dias seguidos. Continue amanhã.`}</p>
    ${fresh.map(b => `<div class="new rise"><span>Nova conquista</span><h3>${b.t}</h3></div>`).join('')}
    <button class="cta" data-a="dismiss">Continuar</button>
  </div>`;
  const el = document.getElementById('count');
  let n = 0;
  const step = () => { n = Math.min(dayPts, n + Math.ceil(dayPts / 24)); el.textContent = '+' + n; if (n < dayPts) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* eventos */
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'send') {
    const v = (document.getElementById('email').value || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(v)) { document.getElementById('email').focus(); return; }
    ui.email = v; ui.step = 'code'; render();
  } else if (a === 'verify') {
    if (!db.users[ui.email]) db.users[ui.email] = { name: cap(ui.email.split('@')[0]), role: 'client' };
    db.session = ui.email; save(); ui.view = 'today'; render();
  } else if (a === 'restart') { ui.step = 'email'; render(); }
  else if (a === 'demo') { db.session = b.dataset.e; save(); ui.view = "today"; ui.client = null; render(); window.scrollTo(0, 0); }
  else if (a === 'logout') { ui.admin = 'clientes'; if (LIVE) { sb.auth.signOut(); if (channel) { sb.removeChannel(channel); channel = null; } ui.step = 'login'; } else ui.step = 'email'; db.session = null; ui.client = null; save(); render(); }
  else if (a === 'mode') { ui.step = b.dataset.m; ui.err = ''; ui.ok = ''; render(); }
  else if (a === 'tab') { ui.view = b.dataset.v; render(); window.scrollTo(0, 0); }
  else if (a === 'habit') {
    const e = entryOf(db.session, today());
    e.h[b.dataset.k] = !e.h[b.dataset.k];
    if (e.h[b.dataset.k]) ui.anim = b.dataset.k;
    persist(today()); render();
  } else if (a === 'scale') {
    const e = entryOf(db.session, today());
    e.s[b.dataset.k] = Number(b.dataset.v); persist(today()); render();
  } else if (a === 'close') closeDay();
  else if (a === 'dismiss') { overlay.hidden = true; render(); }
  else if (a === 'open') { ui.client = b.dataset.e; render(); window.scrollTo(0, 0); }
  else if (a === 'panel') { ui.client = null; render(); }
  else if (a === 'atab') { ui.admin = b.dataset.v; ui.client = null; render(); window.scrollTo(0, 0); }
  else if (a === 'copy') {
    const txt = b.dataset.what === 'msg' ? inviteMsg() : appLink();
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
      () => toast(b.dataset.what === 'msg' ? 'Mensagem copiada.' : 'Link copiado.'),
      () => toast('Não deu para copiar. Selecione o texto e copie.'));
  }
});
document.addEventListener('input', ev => {
  if (!ev.target.classList.contains('note')) return;
  const e = entryOf(db.session, today());
  e.n[ev.target.dataset.k] = ev.target.value; persist(today());
});
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'email') document.querySelector('[data-a="send"]').click();
  if (ev.target.id === 'code') document.querySelector('[data-a="verify"]').click();
});
document.addEventListener('submit', ev => {
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();
  submitLogin(f.dataset.form);
});
/* prévia: painel atualiza entre abas */
window.addEventListener('storage', ev => { if (!LIVE && ev.key === LS) { load(); if (me() && me().role === 'admin') render(); } });

async function start() {
  load();
  if (LIVE) {
    app.innerHTML = '<div class="wrap"><p class="hint" style="padding-top:40vh;text-align:center">Carregando...</p></div>';
    sb = window.supabase.createClient(CFG.url, CFG.key);
    sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { db.session = null; ui.step = 'newpass'; render(); } });
    const { data } = await sb.auth.getSession();
    if (data.session && !/type=recovery/.test(location.hash)) {
      try { await loadLive(data.session.user); } catch (e) { db.session = null; }
    }
  }
  render();
}
start();
