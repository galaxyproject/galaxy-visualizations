const getMimeType = (path) => {
  const mimeMap = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.jsonp': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  };
  const ext = path.slice(path.lastIndexOf('.')).split('?')[0];
  return mimeMap[ext] || 'text/plain';
};

// In-memory file storage
const virtualFS = new Map();

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'ADD_FILE') {
    virtualFS.set(event.data.path, event.data.content);
  }
});

self.addEventListener('fetch', (event) => {
  // Only permit GET requests from same origin
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    // Only permit access to files provided in fs
    const path = decodeURIComponent(url.pathname).split('?')[0];
    if (virtualFS.has(path)) {
        const mime = getMimeType(path);
        const content = virtualFS.get(path);
        const response = new Response(content, {
            headers: { 'Content-Type': mime }
        });
        event.respondWith(response);
    }
  }
});
