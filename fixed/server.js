/**
 * SPA Lab — FIXED version
 * 1. Отдаёт index.html с корректным Content-Security-Policy заголовком.
 * 2. Генерирует случайный nonce на каждый запрос.
 * 3. Подставляет nonce в HTML вместо плейсхолдера __NONCE__.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'insecure-jwt-secret';

app.use(express.json());

// ── Отдача index.html со строгим CSP ──────────────────────────────────────
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    const nonce = crypto.randomBytes(16).toString('base64');

    const csp = [
      `default-src 'self'`,
      `script-src 'nonce-${nonce}'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data:`,
      `font-src 'self'`,
      `connect-src 'self'`,
      `object-src 'none'`,
      `base-uri 'none'`,
      `form-action 'self'`,
      `frame-ancestors 'none'`,
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');

    const html = INDEX_HTML.replace(/__NONCE__/g, nonce);
    return res.type('html').send(html);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── In-memory storage ─────────────────────────────────────────────────────
const users = new Map();
const notes = [];
const comments = new Map();
let noteId = 1;
let commentId = 1;

users.set('admin', { username: 'admin', password: 'admin123', email: 'admin@lab.local', bio: 'Lab administrator' });
users.set('alice', { username: 'alice', password: 'alice123', email: 'alice@lab.local', bio: 'Just a user' });

notes.push({
  id: noteId++,
  author: 'admin',
  title: 'Welcome to SPA Lab',
  body: 'Это демонстрационное приложение для лабораторной работы по CSP.',
  createdAt: new Date().toISOString()
});
notes.push({
  id: noteId++,
  author: 'alice',
  title: 'My first note',
  body: 'Hello world! This is my very first note here.',
  createdAt: new Date().toISOString()
});

// ── Auth middleware ───────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Auth API ──────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { username, password, email, bio } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (users.has(username)) return res.status(409).json({ error: 'User already exists' });

  users.set(username, { username, password, email: email || '', bio: bio || '' });
  const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, user: { username, email: email || '', bio: bio || '' } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.get(username);
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, user: { username, email: user.email, bio: user.bio } });
});

app.get('/api/me', auth, (req, res) => {
  const u = users.get(req.user.sub);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ username: u.username, email: u.email, bio: u.bio });
});

// ── Notes API ─────────────────────────────────────────────────────────────
app.get('/api/notes', (_req, res) => res.json(notes));

app.get('/api/notes/:id', (req, res) => {
  const n = notes.find(x => x.id === Number(req.params.id));
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json(n);
});

app.post('/api/notes', auth, (req, res) => {
  const { title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  const n = { id: noteId++, author: req.user.sub, title, body, createdAt: new Date().toISOString() };
  notes.push(n);
  res.status(201).json(n);
});

// ── Comments API ──────────────────────────────────────────────────────────
app.get('/api/notes/:id/comments', (req, res) => {
  res.json(comments.get(Number(req.params.id)) || []);
});

app.post('/api/notes/:id/comments', auth, (req, res) => {
  const id = Number(req.params.id);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  if (!comments.has(id)) comments.set(id, []);
  const c = { id: commentId++, author: req.user.sub, body, createdAt: new Date().toISOString() };
  comments.get(id).push(c);
  res.status(201).json(c);
});

app.listen(PORT, () => {
  console.log(`[fixed] SPA lab listening on http://0.0.0.0:${PORT}`);
  console.log(`[fixed] CSP with per-request nonce enabled`);
});
