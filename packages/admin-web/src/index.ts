import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import { config } from './config';
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
  res.json({ success: true });
});

// Static frontend (login page accessible without auth)
app.use('/login', express.static(path.join(__dirname, 'frontend', 'login.html')));
app.use('/assets', express.static(path.join(__dirname, 'frontend', 'assets')));

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
