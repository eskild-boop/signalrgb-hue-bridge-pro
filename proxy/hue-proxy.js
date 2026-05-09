// Local HTTP-to-HTTPS proxy for Philips Hue Bridge.
//
// Why: SignalRGB's Hue plugin runs in Qt's QML JavaScript engine, whose XMLHttpRequest
// has no API to ignore TLS errors. Hue Bridge Pro (BSB003) only serves API v2 over HTTPS
// with a self-signed cert (issuer CN=root-bridge, no SAN), so the plugin's XHR rejects
// every call. This proxy accepts plain HTTP locally and forwards HTTPS to the bridge with
// cert validation off.
//
// Configuration (env vars):
//   HUE_BRIDGE_HOST   IP address of your Hue Bridge. If unset, the proxy queries
//                     https://discovery.meethue.com for the first bridge on this LAN.
//   HUE_PROXY_PORT    TCP port to listen on. Default 18080.

const http = require('http');
const https = require('https');

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = parseInt(process.env.HUE_PROXY_PORT || '18080', 10);

function discoverBridgeIp() {
    return new Promise((resolve, reject) => {
        const req = https.get('https://discovery.meethue.com', { timeout: 8000 }, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                try {
                    const list = JSON.parse(body);
                    if (Array.isArray(list) && list[0] && list[0].internalipaddress) {
                        resolve(list[0].internalipaddress);
                    } else {
                        reject(new Error('No bridges returned by discovery.meethue.com'));
                    }
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('discovery.meethue.com timeout')));
    });
}

function startProxy(bridgeHost) {
    const BRIDGE_PORT = 443;
    const server = http.createServer((req, res) => {
        const opts = {
            hostname: bridgeHost,
            port: BRIDGE_PORT,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: bridgeHost },
            rejectUnauthorized: false,
        };
        const proxyReq = https.request(opts, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });
        proxyReq.on('error', (e) => {
            console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ERR ${e.message}`);
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end(`Proxy error: ${e.message}`);
        });
        req.pipe(proxyReq);

        proxyReq.on('response', (proxyRes) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
        });
    });

    server.listen(LISTEN_PORT, LISTEN_HOST, () => {
        console.log(`Hue proxy listening on http://${LISTEN_HOST}:${LISTEN_PORT} -> https://${bridgeHost}:${BRIDGE_PORT}`);
    });

    server.on('error', (e) => {
        console.error(`Listen error: ${e.message}`);
        process.exit(1);
    });
}

(async () => {
    let bridgeHost = process.env.HUE_BRIDGE_HOST;
    if (!bridgeHost) {
        console.log('HUE_BRIDGE_HOST not set; querying discovery.meethue.com...');
        try {
            bridgeHost = await discoverBridgeIp();
            console.log(`Discovered bridge: ${bridgeHost}`);
        } catch (e) {
            console.error(`Discovery failed: ${e.message}`);
            console.error('Set HUE_BRIDGE_HOST=<bridge IP> and restart.');
            process.exit(1);
        }
    }
    startProxy(bridgeHost);
})();
