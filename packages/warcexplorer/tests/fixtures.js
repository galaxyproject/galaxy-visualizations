import { gzipSync } from "node:zlib";

export function warcRecord({ index = 1, type = "response", uri = `https://archive.example/${index}`, contentType = "text/plain", payload = `Archived payload ${index}`, httpEncoding, warcVersion = "1.1" } = {}) {
  let body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (httpEncoding === "gzip") body = gzipSync(body);
  if (type === "response" || type === "request") {
    const headers = Buffer.from(`${type === "request" ? "GET / HTTP/1.1" : "HTTP/1.1 200 OK"}\r\nContent-Type: ${contentType}\r\nContent-Length: ${body.length}\r\n${httpEncoding ? `Content-Encoding: ${httpEncoding}\r\n` : ""}\r\n`);
    body = Buffer.concat([headers, body]);
  }
  return Buffer.concat([
    Buffer.from(`WARC/${warcVersion}\r\nWARC-Type: ${type}\r\nWARC-Record-ID: <urn:uuid:record-${index}>\r\nWARC-Target-URI: ${uri}\r\nWARC-Date: 2026-10-21T00:00:00Z\r\nContent-Type: ${type === "response" || type === "request" ? "application/http; msgtype=" + type : contentType}\r\nContent-Length: ${body.length}\r\n\r\n`),
    body,
    Buffer.from("\r\n\r\n"),
  ]);
}

export function archive(records = [warcRecord(), warcRecord({ index: 2, type: "metadata" }), warcRecord({ index: 3 })], layout = "members") {
  if (layout === "plain") return Buffer.concat(records);
  if (layout === "single") return gzipSync(Buffer.concat(records));
  return Buffer.concat(records.map(record => gzipSync(record)));
}

export const hostileHtml = `<!doctype html><html><head><!-- <head> -->
<meta http-equiv="refresh" content="0;url=https://live.example/refresh">
<base href="https://live.example/"><link rel="stylesheet" href="https://live.example/sheet">
<style>body{background-image:url(https://live.example/css)}</style></head>
<body onload="parent.hacked=true"><h1>Archived heading</h1>
<script>parent.hacked=true;fetch('https://live.example/script')</script>
<img src="https://live.example/image" onerror="parent.hacked=true">
<iframe src="https://live.example/frame"></iframe>
<svg onload="parent.hacked=true"></svg>
<a href="https://live.example/link" target="_top">Archived link</a>
<form action="https://live.example/form"><button>Submit</button></form></body></html>`;
