import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Proxy API requests to the backend container
// Note: We don't use app.use('/prefix') here to avoid path stripping issues with pathRewrite
app.use(createProxyMiddleware({
  pathFilter: '/julius_2026/api',
  target: 'http://backend:5000',
  changeOrigin: true,
  pathRewrite: {
    '^/julius_2026/api': '/api',
  },
}));

// Proxy uploads to the backend container
app.use(createProxyMiddleware({
  pathFilter: '/julius_2026/uploads',
  target: 'http://backend:5000',
  changeOrigin: true,
  pathRewrite: {
    '^/julius_2026/uploads': '/uploads',
  },
}));

// Serve static files from the 'dist' directory
app.use('/julius_2026', express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for React Router (Single Page Application)
// We use a negative lookahead to NOT match /api or /uploads
app.get(/^\/julius_2026\/(?!(api|uploads)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Redirect root to /julius_2026/
app.get('/', (req, res) => {
  res.redirect('/julius_2026/');
});

app.listen(PORT, () => {
  console.log(`Frontend server running on port ${PORT}`);
});
