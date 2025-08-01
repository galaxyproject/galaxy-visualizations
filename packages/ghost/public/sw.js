const getMimeType = (path) => {
  const mimeMap = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.jsonp': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.html': 'text/html',
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
  const url = new URL(event.request.url);
  
  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  const path = decodeURIComponent(url.pathname).split('?')[0];
  const requestPath = path === '/' ? '/index.html' : path;
  
  // Skip system files
  if (requestPath.includes('__MACOSX/') || requestPath.includes('.DS_Store') || requestPath.startsWith('._')) {
    return;
  }

  event.respondWith(handleRequest(event, requestPath));
});

async function handleRequest(event, path) {
  // Check in-memory cache first
  if (virtualFS.has(path)) {
    const mime = getMimeType(path);
    const content = virtualFS.get(path);
    return new Response(content, {
      headers: { 'Content-Type': mime }
    });
  }

  // Fallback to network
  return fetch(event.request);
}