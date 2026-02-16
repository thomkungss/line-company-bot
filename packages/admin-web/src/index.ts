import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import { config } from './config';
import { getPermissions } from '@company-bot/shared';
import { companiesRouter } from './routes/companies';
import { documentsRouter } from './routes/documents';
import { versionsRouter } from './routes/versions';
import { permissionsRouter } from './routes/permissions';
import { chatLogsRouter } from './routes/chat-logs';
import { syncRouter } from './routes/sync';

const app = express();

// Signed cookies (survive server restarts)
app.use(cookieParser(config.sessionSecret));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create auth token from username+secret (deterministic, no server state)
function createAuthToken(): string {
  return crypto.createHmac('sha256', config.sessionSecret).update('authenticated').digest('hex');
}

function isAuthenticated(req: express.Request): boolean {
  return req.signedCookies?.auth_token === createAuthToken();
}

// Auth middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (isAuthenticated(req)) {
    next();
    return;
  }
  if (req.path === '/api/login' || req.path === '/login' || req.path.startsWith('/assets/')) {
    next();
    return;
  }
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.redirect('/login');
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.adminUsername && password === config.adminPassword) {
    res.cookie('auth_token', createAuthToken(), {
      signed: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.clearCookie('admin_user');
  res.json({ success: true });
});

// ===== Admin User Selection Endpoints =====

/** GET /api/admin-users — list users with role admin or super_admin */
app.get('/api/admin-users', async (req, res) => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const permissions = await getPermissions();
    const adminUsers = permissions
      .filter(p => p.role === 'admin' || p.role === 'super_admin')
      .map(p => ({ lineUserId: p.lineUserId, displayName: p.displayName, role: p.role }));
    res.json(adminUsers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/select-user — store selected admin user in signed cookie */
app.post('/api/select-user', (req, res) => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { lineUserId } = req.body;
  if (!lineUserId) { res.status(400).json({ error: 'lineUserId is required' }); return; }
  res.cookie('admin_user', lineUserId, {
    signed: true,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  });
  res.json({ success: true });
});

/** GET /api/me — get current admin user info from cookie */
app.get('/api/me', async (req, res) => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const lineUserId = req.signedCookies?.admin_user;
  if (!lineUserId) { res.json({ selected: false }); return; }
  try {
    const permissions = await getPermissions();
    const user = permissions.find(p => p.lineUserId === lineUserId);
    if (!user) { res.json({ selected: false }); return; }
    res.json({ selected: true, displayName: user.displayName, role: user.role, lineUserId: user.lineUserId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// LINE Login callback — verify access token, check admin role, set cookies
app.get('/api/line-login', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) { res.status(400).send('Missing token'); return; }

    // Verify token with LINE Profile API
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profileRes.ok) { res.status(401).send('Invalid LINE token'); return; }

    const profile = await profileRes.json() as { userId: string; displayName: string };

    // Check permissions — only admin/super_admin allowed
    const permissions = await getPermissions();
    const user = permissions.find(p => p.lineUserId === profile.userId);
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      res.status(403).send('ไม่มีสิทธิ์เข้าถึง — เฉพาะ admin เท่านั้น');
      return;
    }

    // Set auth cookies (same as password login)
    res.cookie('auth_token', createAuthToken(), {
      signed: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
    res.cookie('admin_user', profile.userId, {
      signed: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.redirect('/');
  } catch (err: any) {
    console.error('LINE login error:', err.message);
    res.status(500).send('Login failed');
  }
});

// Public routes (no auth required)
app.get('/login', (_req, res) => {
  const html = require('fs').readFileSync(path.join(__dirname, 'frontend', 'login.html'), 'utf-8');
  const liffUrl = config.liffId
    ? `https://liff.line.me/${config.liffId}/admin-login.html?callback=${encodeURIComponent(config.baseUrl + '/api/line-login')}`
    : '';
  res.type('html').send(html.replace('__LIFF_LOGIN_URL__', liffUrl));
});
app.use('/assets', express.static(path.join(__dirname, 'frontend', 'assets')));
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Auth gate for everything else
app.use(requireAuth);

// API routes
app.use('/api/companies', companiesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/chat-logs', chatLogsRouter);
app.use('/api/sync', syncRouter);


// Frontend pages
app.use(express.static(path.join(__dirname, 'frontend')));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`Admin Web running on port ${config.port}`);
});
