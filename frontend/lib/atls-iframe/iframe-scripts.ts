/**
 * Generate the JavaScript code that gets injected into the blob: URL iframe.
 * This script:
 * 1. Waits for a MessageChannel handshake from the parent
 * 2. Overrides window.fetch to route through the channel
 * 3. Overrides window.WebSocket to route through the channel
 */
export function generateIframeBootstrapScript(nonce: string): string {
  return `
(function() {
  "use strict";
  var NONCE = ${JSON.stringify(nonce)};
  var parentPort = null;
  var pendingFetches = new Map();
  var wsInstances = new Map();
  var idCounter = 0;

  function nextId() { return "req_" + (++idCounter); }

  // --- MessageChannel handshake ---
  window.addEventListener("message", function onHandshake(event) {
    if (event.data && event.data.type === "bridge-handshake" && event.data.nonce === NONCE) {
      parentPort = event.ports[0];
      parentPort.onmessage = handleParentMessage;
      window.removeEventListener("message", onHandshake);
    }
  });

  function handleParentMessage(event) {
    var msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === "fetch-response") {
      var resolver = pendingFetches.get(msg.id);
      if (resolver) {
        pendingFetches.delete(msg.id);
        var response = new Response(msg.body, {
          status: msg.status,
          statusText: msg.statusText,
          headers: msg.headers,
        });
        resolver.resolve(response);
      }
    } else if (msg.type === "ws-open-result") {
      var ws = wsInstances.get(msg.id);
      if (ws) {
        if (msg.success) {
          ws._readyState = 1;
          ws.dispatchEvent(new Event("open"));
        } else {
          ws._readyState = 3;
          ws.dispatchEvent(new CloseEvent("close", { code: 1006, reason: msg.error || "" }));
        }
      }
    } else if (msg.type === "ws-frame-to-iframe") {
      var ws = wsInstances.get(msg.id);
      if (ws) {
        ws.dispatchEvent(new MessageEvent("message", { data: msg.data }));
      }
    } else if (msg.type === "ws-close") {
      var ws = wsInstances.get(msg.id);
      if (ws) {
        ws._readyState = 3;
        wsInstances.delete(msg.id);
        ws.dispatchEvent(new CloseEvent("close", { code: msg.code || 1000, reason: msg.reason || "" }));
      }
    } else if (msg.type === "ws-error") {
      var ws = wsInstances.get(msg.id);
      if (ws) {
        ws.dispatchEvent(new Event("error"));
      }
    }
  }

  // --- Fetch Override ---
  window.fetch = function(input, init) {
    if (!parentPort) {
      return Promise.reject(new Error("Admin bridge not ready"));
    }
    var url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    var method = (init && init.method) || "GET";
    var headers = {};
    if (init && init.headers) {
      var h = new Headers(init.headers);
      h.forEach(function(v, k) { headers[k] = v; });
    }
    var body = (init && init.body) ? String(init.body) : null;
    var id = nextId();

    return new Promise(function(resolve, reject) {
      pendingFetches.set(id, { resolve: resolve, reject: reject });
      parentPort.postMessage({
        type: "fetch-request",
        id: id,
        nonce: NONCE,
        url: url,
        method: method,
        headers: headers,
        body: body,
      });
      setTimeout(function() {
        if (pendingFetches.has(id)) {
          pendingFetches.delete(id);
          reject(new Error("Fetch timeout"));
        }
      }, 30000);
    });
  };

  // --- WebSocket Override ---
  function ShimmedWebSocket(url, protocols) {
    var target = new EventTarget();
    var id = nextId();
    var ws = Object.create(ShimmedWebSocket.prototype);
    ws._id = id;
    ws._readyState = 0;
    ws._url = url;
    ws.addEventListener = target.addEventListener.bind(target);
    ws.removeEventListener = target.removeEventListener.bind(target);
    ws.dispatchEvent = target.dispatchEvent.bind(target);
    ws.onopen = null;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onerror = null;
    ["open","close","message","error"].forEach(function(type) {
      ws.addEventListener(type, function(e) {
        var handler = ws["on" + type];
        if (typeof handler === "function") handler.call(ws, e);
      });
    });

    wsInstances.set(id, ws);

    if (parentPort) {
      parentPort.postMessage({
        type: "ws-open",
        id: id,
        nonce: NONCE,
        url: url,
        protocols: Array.isArray(protocols) ? protocols : protocols ? [protocols] : [],
      });
    }

    return ws;
  }
  ShimmedWebSocket.prototype.send = function(data) {
    if (this._readyState !== 1) throw new DOMException("Not connected", "InvalidStateError");
    if (parentPort) {
      parentPort.postMessage({
        type: "ws-frame-to-parent",
        id: this._id,
        data: data,
      });
    }
  };
  ShimmedWebSocket.prototype.close = function(code, reason) {
    this._readyState = 2;
    if (parentPort) {
      parentPort.postMessage({
        type: "ws-close",
        id: this._id,
        code: code || 1000,
        reason: reason || "",
      });
    }
  };
  Object.defineProperty(ShimmedWebSocket.prototype, "readyState", {
    get: function() { return this._readyState; }
  });
  Object.defineProperty(ShimmedWebSocket.prototype, "url", {
    get: function() { return this._url; }
  });
  ShimmedWebSocket.CONNECTING = 0;
  ShimmedWebSocket.OPEN = 1;
  ShimmedWebSocket.CLOSING = 2;
  ShimmedWebSocket.CLOSED = 3;

  window.WebSocket = ShimmedWebSocket;
})();
`;
}
