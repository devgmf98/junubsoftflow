'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, asyncRoute } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone || null,
    company: row.company || null,
    country: row.country || null,
    city: row.city || null,
    status: row.status,
    createdAt: row.created_at,
  };
}

/* ---------- who am I ---------- */
router.get(
  '/me',
  asyncRoute(async (req, res) => {
    if (!req.session.user) return res.json({ user: null });
    const row = await db.one('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    if (!row) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    res.json({ user: publicUser(row) });
  })
);

/* ---------- login ---------- */
router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Enter both your email and password.' });
    }

    const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'That email and password do not match an account.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    }

    await db.run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };

    res.json({ user: publicUser(user) });
  })
);

/* ---------- register ---------- */
router.post(
  '/register',
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || password);

    if (!name || name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ error: 'Your password must be at least 6 characters.' });
    if (password !== confirm) return res.status(400).json({ error: 'The two passwords do not match.' });

    if (await db.one('SELECT id FROM users WHERE email = ?', [email])) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const result = await db.run(
      `INSERT INTO users (name, email, password_hash, role, phone, status, last_login_at)
       VALUES (?, ?, ?, 'customer', ?, 'active', NOW())`,
      [name, email, bcrypt.hashSync(password, 10), phone || null]
    );

    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "account", "New customer registered")', [
      result.insertId,
    ]);

    const user = await db.one('SELECT * FROM users WHERE id = ?', [result.insertId]);
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };

    res.status(201).json({ user: publicUser(user) });
  })
);

/* ---------- logout ---------- */
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('softflow.sid');
    res.json({ ok: true });
  });
});

/* ---------- profile ---------- */
router.put(
  '/profile',
  requireAuth,
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Your name cannot be empty.' });

    await db.run('UPDATE users SET name = ?, phone = ?, company = ?, country = ?, city = ? WHERE id = ?', [
      name,
      String(req.body.phone || '').trim() || null,
      String(req.body.company || '').trim() || null,
      String(req.body.country || '').trim() || null,
      String(req.body.city || '').trim() || null,
      req.session.user.id,
    ]);

    req.session.user.name = name;
    const user = await db.one('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    res.json({ user: publicUser(user) });
  })
);

/* ---------- password ---------- */
router.put(
  '/password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');
    const confirm = String(req.body.confirmPassword || '');

    const user = await db.one('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);
    if (!bcrypt.compareSync(current, user.password_hash)) {
      return res.status(400).json({ error: 'Your current password is not correct.' });
    }
    if (next.length < 6) return res.status(400).json({ error: 'The new password must be at least 6 characters.' });
    if (next !== confirm) return res.status(400).json({ error: 'The two new passwords do not match.' });

    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [
      bcrypt.hashSync(next, 10),
      req.session.user.id,
    ]);
    await db.run('INSERT INTO activity_log (user_id, type, message) VALUES (?, "account", "Password changed")', [
      req.session.user.id,
    ]);

    res.json({ ok: true });
  })
);

module.exports = router;
