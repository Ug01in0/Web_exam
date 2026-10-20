/**
 * SPA Lab — FIXED version
 *
 * Отличия от vulnerable/app.js:
 *  1. searchPage() использует textContent / append вместо innerHTML —
 *     пользовательский ввод интерпретируется как текст, а не HTML.
 *  2. Сервер отдаёт строгий CSP с nonce (defense in depth).
 */

const state = {
  token: localStorage.getItem('token'),
  user: null,
};

// ── API helper ────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── DOM helper ────────────────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ── Router ────────────────────────────────────────────────────────────────
function parseRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  return { name: parts[0] || '', param: parts[1] };
}

const routes = {
  '':            homePage,
  'notes':       notesPage,
  'note':        notePage,
  'search':      searchPage,
  'login':       loginPage,
  'register':    registerPage,
  'profile':     profilePage,
};

async function render() {
  const { name, param } = parseRoute();
  const fn = routes[name] || routes[''];
  const view = await fn(param);
  const app = document.getElementById('app');
  app.replaceChildren();  // безопасная очистка
  app.append(view);
  renderNav();
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren();
  const ul = el('ul', { class: 'nav-links' });

  const links = [
    ['#/', 'Главная'],
    ['#/notes', 'Заметки'],
    ['#/search', 'Поиск'],
  ];

  if (state.token) {
    links.push(['#/profile', 'Профиль']);
  } else {
    links.push(['#/login', 'Войти']);
    links.push(['#/register', 'Регистрация']);
  }

  for (const [href, label] of links) {
    const a = el('a', { href });
    a.textContent = label;
    ul.append(el('li', {}, a));
  }

  if (state.token) {
    const btn = el('button', { class: 'logout-btn' }, 'Выйти');
    btn.addEventListener('click', () => {
      localStorage.removeItem('token');
      state.token = null;
      state.user = null;
      window.location.hash = '#/';
      render();
    });
    ul.append(el('li', {}, btn));
  }

  nav.append(el('div', { class: 'brand' }, '◈ SPA Lab'), ul);
}

// ── Pages ─────────────────────────────────────────────────────────────────

function homePage() {
  const div = el('div', { class: 'page' });
  div.append(el('h1', {}, 'Добро пожаловать в SPA Lab'));
  div.append(el('p', {}, 'Демонстрационное single-page приложение для лабораторной работы по CSP.'));
  div.append(el('p', {}, 'Разделы: заметки, поиск, профиль.'));
  return div;
}

async function notesPage() {
  const div = el('div', { class: 'page' });
  div.append(el('h1', {}, 'Заметки'));
  try {
    const notes = await api('/api/notes');
    const list = el('ul', { class: 'note-list' });
    for (const n of notes) {
      const a = el('a', { href: `#/note/${n.id}` });
      a.textContent = n.title;
      list.append(el('li', {}, a, el('span', { class: 'muted' }, ` — ${n.author}`)));
    }
    div.append(list);
  } catch (e) {
    div.append(el('p', { class: 'error' }, e.message));
  }
  return div;
}

async function notePage(id) {
  const div = el('div', { class: 'page' });
  try {
    const note = await api(`/api/notes/${id}`);
    div.append(el('h1', {}, note.title));
    div.append(el('p', { class: 'muted' }, `Автор: ${note.author} · ${note.createdAt}`));
    div.append(el('p', {}, note.body));

    div.append(el('h2', {}, 'Комментарии'));
    const list = await api(`/api/notes/${id}/comments`);
    const ul = el('ul', { class: 'comment-list' });
    for (const c of list) {
      ul.append(el('li', {}, el('strong', {}, c.author), ': ', c.body));
    }
    if (!list.length) ul.append(el('li', { class: 'muted' }, 'Комментариев нет'));
    div.append(ul);

    if (state.token) {
      const form = el('form', { class: 'comment-form' });
      const ta = el('textarea', { name: 'body', placeholder: 'Комментарий', required: true });
      form.append(ta, el('button', { type: 'submit' }, 'Отправить'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api(`/api/notes/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: ta.value }) });
          render();
        } catch (err) { alert(err.message); }
      });
      div.append(form);
    } else {
      div.append(el('p', { class: 'muted' }, 'Войдите, чтобы оставить комментарий'));
    }
  } catch (e) {
    div.append(el('p', { class: 'error' }, e.message));
  }
  return div;
}

/**
 * ✅ ФИКС: параметр q больше не интерпретируется как HTML.
 * Используем createTextNode / append — данные отображаются как текст.
 */
function searchPage() {
  const div = el('div', { class: 'page' });
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';

  if (q) {
    const banner = el('div', { class: 'search-banner' });
    banner.append(document.createTextNode('Результаты поиска по запросу: '));
    banner.append(el('strong', {}, q));   // ✅ q как текст, не как HTML
    div.append(banner);
  }

  const form = el('form', { class: 'search-form' });
  const input = el('input', { name: 'q', placeholder: 'Что искать...', value: q });
  form.append(input, el('button', { type: 'submit' }, 'Найти'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newQ = input.value;
    window.history.pushState({}, '', `/?q=${encodeURIComponent(newQ)}#/search`);
    render();
  });
  div.append(form);

  return div;
}

function loginPage() {
  const div = el('div', { class: 'page' });
  div.append(el('h1', {}, 'Вход'));
  const form = el('form', { class: 'auth-form' });
  const u = el('input', { name: 'username', placeholder: 'Логин', required: true });
  const p = el('input', { name: 'password', type: 'password', placeholder: 'Пароль', required: true });
  const err = el('p', { class: 'error' });
  form.append(u, p, err, el('button', { type: 'submit' }, 'Войти'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: u.value, password: p.value })
      });
      localStorage.setItem('token', data.token);
      state.token = data.token;
      state.user = data.user;
      window.location.hash = '#/';
      render();
    } catch (e) { err.textContent = e.message; }
  });
  div.append(form);
  div.append(el('p', { class: 'muted' }, 'Демо: admin / admin123 · alice / alice123'));
  return div;
}

function registerPage() {
  const div = el('div', { class: 'page' });
  div.append(el('h1', {}, 'Регистрация'));
  const form = el('form', { class: 'auth-form' });
  const u = el('input', { name: 'username', placeholder: 'Логин', required: true });
  const p = el('input', { name: 'password', type: 'password', placeholder: 'Пароль', required: true });
  const em = el('input', { name: 'email', type: 'email', placeholder: 'Email' });
  const b = el('input', { name: 'bio', placeholder: 'О себе' });
  const err = el('p', { class: 'error' });
  form.append(u, p, em, b, err, el('button', { type: 'submit' }, 'Создать аккаунт'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ username: u.value, password: p.value, email: em.value, bio: b.value })
      });
      localStorage.setItem('token', data.token);
      state.token = data.token;
      window.location.hash = '#/';
      render();
    } catch (e) { err.textContent = e.message; }
  });
  div.append(form);
  return div;
}

async function profilePage() {
  const div = el('div', { class: 'page' });
  div.append(el('h1', {}, 'Профиль'));

  if (!state.token) {
    div.append(el('p', {}, 'Вы не авторизованы. ', el('a', { href: '#/login' }, 'Войти')));
    return div;
  }

  try {
    const me = await api('/api/me');
    div.append(el('p', {}, `Логин: ${me.username}`));
    div.append(el('p', {}, `Email: ${me.email || '—'}`));
    div.append(el('p', {}, `О себе: ${me.bio || '—'}`));
    div.append(el('p', { class: 'muted' }, '🔒 JWT хранится в localStorage (в продакшене рекомендуется httpOnly cookie).'));
  } catch (e) {
    div.append(el('p', { class: 'error' }, e.message));
  }
  return div;
}

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
render();
