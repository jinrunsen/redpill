#!/usr/bin/env node
/**
 * REDPILL API Text Filter Proxy
 *
 * 拦截 Claude API 请求/响应，对敏感文本进行双向替换：
 * - 请求（发送前）：daneed → 4d3a86bb5ec8
 * - 响应（接收后）：4d3a86bb5ec8 → daneed
 *
 * 用法：
 *   node hooks/redpill-api-filter.js &
 *   export ANTHROPIC_BASE_URL=http://127.0.0.1:18923
 *
 * 或通过 settings.json SessionStart hook 自动启动。
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// ── 配置 ─────────────────────────────────────────────────────────────────────

const LISTEN_PORT = parseInt(process.env.REDPILL_FILTER_PORT || '18923', 10);
const UPSTREAM_BASE = process.env.REDPILL_UPSTREAM_API || 'https://api.anthropic.com';

// 替换规则：[原文, 替代文本]
// 请求方向：原文 → 替代文本
// 响应方向：替代文本 → 原文
const FILTER_RULES = [
  ['daneed', '4d3a86bb5ec8'],
];

// ── 替换函数 ─────────────────────────────────────────────────────────────────

function applyRequestFilters(text) {
  let result = text;
  for (const [original, replacement] of FILTER_RULES) {
    result = result.replaceAll(original, replacement);
  }
  return result;
}

function applyResponseFilters(text) {
  let result = text;
  for (const [original, replacement] of FILTER_RULES) {
    result = result.replaceAll(replacement, original);
  }
  return result;
}

// ── 代理服务器 ───────────────────────────────────────────────────────────────

const server = http.createServer((clientReq, clientRes) => {
  // 收集请求 body
  const chunks = [];
  clientReq.on('data', (chunk) => chunks.push(chunk));
  clientReq.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf-8');

    // 对请求 body 做正向替换（daneed → hash）
    const filteredBody = applyRequestFilters(rawBody);

    // 构造上游请求
    const upstream = new URL(clientReq.url, UPSTREAM_BASE);
    const isHttps = upstream.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers = { ...clientReq.headers };
    // 修正 host 和 content-length
    headers['host'] = upstream.host;
    if (filteredBody) {
      headers['content-length'] = Buffer.byteLength(filteredBody);
    }
    // 移除可能导致问题的 headers
    delete headers['transfer-encoding'];

    const proxyReq = transport.request({
      hostname: upstream.hostname,
      port: upstream.port || (isHttps ? 443 : 80),
      path: upstream.pathname + upstream.search,
      method: clientReq.method,
      headers,
    }, (proxyRes) => {
      const isStreaming = proxyRes.headers['content-type']?.includes('text/event-stream');

      if (isStreaming) {
        // SSE 流式响应：逐块替换
        // 复制响应头，移除 content-length（替换后长度可能变化）
        const resHeaders = { ...proxyRes.headers };
        delete resHeaders['content-length'];
        clientRes.writeHead(proxyRes.statusCode, resHeaders);

        proxyRes.on('data', (chunk) => {
          const text = chunk.toString('utf-8');
          const filtered = applyResponseFilters(text);
          clientRes.write(filtered);
        });

        proxyRes.on('end', () => {
          clientRes.end();
        });
      } else {
        // 非流式响应：收集完整 body 后替换
        const resChunks = [];
        proxyRes.on('data', (chunk) => resChunks.push(chunk));
        proxyRes.on('end', () => {
          const resBody = Buffer.concat(resChunks).toString('utf-8');
          const filteredRes = applyResponseFilters(resBody);

          const resHeaders = { ...proxyRes.headers };
          resHeaders['content-length'] = Buffer.byteLength(filteredRes);
          clientRes.writeHead(proxyRes.statusCode, resHeaders);
          clientRes.end(filteredRes);
        });
      }
    });

    proxyReq.on('error', (err) => {
      console.error(`[redpill-api-filter] upstream error: ${err.message}`);
      clientRes.writeHead(502);
      clientRes.end(`Proxy error: ${err.message}`);
    });

    proxyReq.write(filteredBody);
    proxyReq.end();
  });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.error(`[redpill-api-filter] listening on http://127.0.0.1:${LISTEN_PORT}`);
  console.error(`[redpill-api-filter] upstream: ${UPSTREAM_BASE}`);
  console.error(`[redpill-api-filter] rules: ${FILTER_RULES.map(r => `"${r[0]}" ↔ "${r[1]}"`).join(', ')}`);
});

// 优雅退出
process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });

// 写 PID 文件供关闭用
const fs = require('fs');
const path = require('path');
const pidFile = path.join(require('os').tmpdir(), 'redpill-api-filter.pid');
fs.writeFileSync(pidFile, String(process.pid));
