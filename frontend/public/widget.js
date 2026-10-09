/**
 * Fagoon Agent Chat Widget — standalone, dependency-free embed script.
 *
 * Usage (on any third-party site):
 *   <script
 *     src="https://your-fagoon-host/widget.js"
 *     data-api-base="https://your-fagoon-host"
 *     data-agent-slug="my-agent-slug"
 *     data-api-key="agapi_xxxxxxxxxxxx"
 *     data-agent-name="Support Bot"
 *     async
 *   ></script>
 *
 * Or point straight at the endpoint instead of base+slug:
 *     data-endpoint="https://your-fagoon-host/api/v1/agent-api/my-agent-slug/chat"
 *
 * Optional (invalid values fall back to safe defaults):
 *   data-brand-color      hex colour, "#rgb" or "#rrggbb" (data-primary-color is the legacy alias)
 *   data-logo-url         https:// image shown in the header
 *   data-welcome-message  plain text, max 300 characters
 *   data-position         "bottom-right" | "bottom-left"
 *
 * The conversation id is kept in localStorage for 24 hours from when the
 * conversation started, so a page reload continues the same conversation.
 * If storage is blocked the widget still works, just without that memory.
 */
(function () {
  "use strict";

  var currentScript = document.currentScript;
  if (!currentScript) {
    // Fallback for browsers/loaders that don't set currentScript (e.g. async injection
    // after the fact) — grab the last <script src="*widget.js"> on the page.
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/widget\.js(\?|$)/.test(scripts[i].src)) {
        currentScript = scripts[i];
        break;
      }
    }
  }

  var cfg = (currentScript && currentScript.dataset) || {};

  var API_KEY = cfg.apiKey || "";
  var ENDPOINT =
    cfg.endpoint ||
    (cfg.apiBase && cfg.agentSlug
      ? cfg.apiBase.replace(/\/$/, "") + "/api/v1/agent-api/" + cfg.agentSlug + "/chat"
      : "");
  var DEFAULT_COLOR = "#4f46e5";
  var DEFAULT_WELCOME_MESSAGE = "Hi! How can I help you today?";
  var WELCOME_MAX_LENGTH = 300;

  // Only "#rgb" / "#rrggbb" — the value is interpolated into CSS, so nothing else is allowed through.
  function sanitizeColor(value) {
    var v = typeof value === "string" ? value.trim() : "";
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : "";
  }

  function sanitizeHttpsUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      var url = new URL(value.trim());
      return url.protocol === "https:" ? url.href : "";
    } catch (e) {
      return "";
    }
  }

  // Plain text only (always inserted with textContent). Strips control characters
  // other than newlines and truncates to WELCOME_MAX_LENGTH characters.
  function sanitizeText(value, maxLength) {
    if (typeof value !== "string") return "";
    var v = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
    if (v.length > maxLength) {
      var cut = maxLength - 1;
      var code = v.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut--; // don't split a surrogate pair (emoji)
      v = v.slice(0, cut) + "…";
    }
    return v;
  }

  var AGENT_NAME = cfg.agentName || "Chat";
  var WELCOME_MESSAGE = sanitizeText(cfg.welcomeMessage, WELCOME_MAX_LENGTH) || DEFAULT_WELCOME_MESSAGE;
  var PRIMARY_COLOR = sanitizeColor(cfg.brandColor) || sanitizeColor(cfg.primaryColor) || DEFAULT_COLOR;
  var LOGO_URL = sanitizeHttpsUrl(cfg.logoUrl);
  var POSITION = cfg.position === "bottom-left" ? "bottom-left" : "bottom-right";
  var REQUEST_TIMEOUT_MS = 60000;

  var configError = "";
  if (!API_KEY) configError = "Missing data-api-key on the widget script tag.";
  else if (!ENDPOINT) configError = "Missing data-endpoint (or data-api-base + data-agent-slug) on the widget script tag.";
  if (configError) {
    console.error("[fagoon-widget] " + configError);
  }

  var ERROR_MESSAGES = {
    400: "That message couldn't be sent — please rephrase and try again.",
    401: "This chat widget is misconfigured (invalid API key). Please contact the site owner.",
    403: "This chat is currently unavailable.",
    404: "This chat endpoint could not be found. Please contact the site owner.",
    429: "You're sending messages a bit too fast — please wait a moment and try again.",
    504: "The assistant is taking too long to respond. Please try again in a moment.",
  };
  var DEFAULT_ERROR_MESSAGE = "Something went wrong on our end. Please try again in a moment.";
  var NETWORK_ERROR_MESSAGE = "Couldn't reach the chat service. Please check your connection and try again.";
  var TIMEOUT_ERROR_MESSAGE = "That request took too long and was cancelled. Please try again.";
  var CONFIG_ERROR_MESSAGE = "This chat widget isn't configured correctly. Please contact the site owner.";
  var CAP_REACHED_MESSAGE = "Our assistant is unavailable right now, please contact us directly.";
  var CONVERSATION_EXPIRED_MESSAGE = "This conversation has expired. Please send your message again to start a new one.";

  // Conversation id survives page reloads for 24h from when the conversation started.
  // Every storage access is guarded: localStorage can be missing or throw (private
  // mode, blocked third-party storage, sandboxed iframes) and the widget must still work.
  var CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;
  var STORAGE_KEY = "fagoon-widget:conversation:" + ENDPOINT;

  function getStorage() {
    try {
      return window.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  function loadConversationId() {
    try {
      var storage = getStorage();
      if (!storage) return null;
      var saved = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved.id === "string" && typeof saved.expiresAt === "number" && saved.expiresAt > Date.now()) {
        return saved.id;
      }
      storage.removeItem(STORAGE_KEY);
    } catch (e) {}
    return null;
  }

  function saveConversationId(id) {
    try {
      var storage = getStorage();
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify({ id: id, expiresAt: Date.now() + CONVERSATION_TTL_MS }));
    } catch (e) {}
  }

  function clearConversationId() {
    conversationId = null;
    try {
      var storage = getStorage();
      if (storage) storage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  var conversationId = ENDPOINT ? loadConversationId() : null;
  var inFlight = false;

  var host = document.createElement("div");
  host.id = "fagoon-widget-host";
  var shadow = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".fw-root{position:fixed;" + (POSITION === "bottom-left" ? "left:20px" : "right:20px") + ";bottom:20px;z-index:2147483000}" +
    ".fw-bubble{width:60px;height:60px;border-radius:50%;background:" + PRIMARY_COLOR + ";border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .15s ease}" +
    ".fw-bubble:hover{transform:scale(1.06)}" +
    ".fw-bubble svg{width:28px;height:28px}" +
    ".fw-panel{position:absolute;bottom:74px;" + (POSITION === "bottom-left" ? "left:0" : "right:0") + ";width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden}" +
    ".fw-panel.fw-open{display:flex}" +
    ".fw-header{background:" + PRIMARY_COLOR + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex:0 0 auto}" +
    ".fw-header-brand{display:flex;align-items:center;gap:8px;min-width:0}" +
    ".fw-logo{width:24px;height:24px;border-radius:4px;object-fit:contain;background:#fff;flex:0 0 auto}" +
    ".fw-header-title{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".fw-close{background:none;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;padding:4px;opacity:.9}" +
    ".fw-close:hover{opacity:1}" +
    ".fw-messages{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f7f7f8}" +
    ".fw-msg{max-width:80%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}" +
    ".fw-msg-user{align-self:flex-end;background:" + PRIMARY_COLOR + ";color:#fff;border-bottom-right-radius:3px}" +
    ".fw-msg-bot{align-self:flex-start;background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-bottom-left-radius:3px}" +
    ".fw-msg-bot ul,.fw-msg-bot ol{margin:4px 0;padding-left:18px}" +
    ".fw-msg-bot li{margin:2px 0}" +
    ".fw-msg-error{align-self:flex-start;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-bottom-left-radius:3px}" +
    ".fw-msg-typing{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:3px;padding:11px 14px;display:flex;gap:4px}" +
    ".fw-dot{width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:fw-blink 1.2s infinite ease-in-out}" +
    ".fw-dot:nth-child(2){animation-delay:.2s}.fw-dot:nth-child(3){animation-delay:.4s}" +
    "@keyframes fw-blink{0%,80%,100%{opacity:.3}40%{opacity:1}}" +
    ".fw-input-row{flex:0 0 auto;display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}" +
    ".fw-input{flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:9px 11px;font-size:13.5px;max-height:80px;outline:none}" +
    ".fw-input:focus{border-color:" + PRIMARY_COLOR + "}" +
    ".fw-send{background:" + PRIMARY_COLOR + ";border:none;color:#fff;border-radius:10px;width:38px;height:38px;flex:0 0 auto;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
    ".fw-send:disabled{opacity:.5;cursor:not-allowed}" +
    ".fw-send svg{width:17px;height:17px}";
  shadow.appendChild(style);

  var root = document.createElement("div");
  root.className = "fw-root";

  var bubble = document.createElement("button");
  bubble.className = "fw-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.type = "button";
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "fw-panel";

  var header = document.createElement("div");
  header.className = "fw-header";
  var headerTitle = document.createElement("div");
  headerTitle.className = "fw-header-title";
  headerTitle.textContent = AGENT_NAME;
  var headerBrand = document.createElement("div");
  headerBrand.className = "fw-header-brand";
  if (LOGO_URL) {
    var logo = document.createElement("img");
    logo.className = "fw-logo";
    logo.alt = "";
    logo.referrerPolicy = "no-referrer";
    logo.addEventListener("error", function () {
      logo.remove();
    });
    logo.src = LOGO_URL;
    headerBrand.appendChild(logo);
  }
  headerBrand.appendChild(headerTitle);
  var closeBtn = document.createElement("button");
  closeBtn.className = "fw-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.textContent = "×";
  header.appendChild(headerBrand);
  header.appendChild(closeBtn);

  var messages = document.createElement("div");
  messages.className = "fw-messages";

  var inputRow = document.createElement("div");
  inputRow.className = "fw-input-row";
  var input = document.createElement("textarea");
  input.className = "fw-input";
  input.setAttribute("rows", "1");
  input.setAttribute("placeholder", "Type a message…");
  var sendBtn = document.createElement("button");
  sendBtn.className = "fw-send";
  sendBtn.type = "button";
  sendBtn.setAttribute("aria-label", "Send message");
  sendBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>';
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(inputRow);

  root.appendChild(panel);
  root.appendChild(bubble);
  shadow.appendChild(root);

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Minimal, safe Markdown -> HTML for bot replies. Escapes everything first
  // (so this is never a vector for injected HTML/scripts), then recognizes
  // just what LLM responses commonly use: **bold**, "- "/"* " bullet lists,
  // "1. " numbered lists, and line breaks. Not a full Markdown parser.
  function formatMessage(text) {
    var lines = escapeHtml(text).split("\n");
    var parts = [];
    var listType = null;
    var listItems = [];

    function flushList() {
      if (listType) {
        parts.push("<" + listType + ">" + listItems.join("") + "</" + listType + ">");
        listType = null;
        listItems = [];
      }
    }

    function inline(line) {
      return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var bulletMatch = line.match(/^\s*[*-]\s+(.+)/);
      var numberedMatch = line.match(/^\s*\d+\.\s+(.+)/);

      if (bulletMatch) {
        if (listType !== "ul") { flushList(); listType = "ul"; }
        listItems.push("<li>" + inline(bulletMatch[1]) + "</li>");
      } else if (numberedMatch) {
        if (listType !== "ol") { flushList(); listType = "ol"; }
        listItems.push("<li>" + inline(numberedMatch[1]) + "</li>");
      } else {
        flushList();
        parts.push(inline(line));
      }
    }
    flushList();
    return parts.join("<br>");
  }

  // plainText forces textContent even for bot-styled messages (used for the
  // site-supplied welcome message, which is never rendered as HTML).
  function addMessage(text, kind, plainText) {
    var el = document.createElement("div");
    el.className = "fw-msg " + (kind === "user" ? "fw-msg-user" : kind === "error" ? "fw-msg-error" : "fw-msg-bot");
    if (kind === "bot" && !plainText) {
      // Only LLM-generated replies get rendered as (escaped, constrained) HTML.
      el.innerHTML = formatMessage(text);
    } else {
      el.textContent = text; // user input and static error strings stay plain text.
    }
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function addTypingIndicator() {
    var el = document.createElement("div");
    el.className = "fw-msg-typing";
    el.innerHTML = '<span class="fw-dot"></span><span class="fw-dot"></span><span class="fw-dot"></span>';
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function setBusy(busy) {
    inFlight = busy;
    sendBtn.disabled = busy;
    input.disabled = busy;
  }

  function friendlyErrorFor(response, code) {
    if (code === "chat_cap_reached" || response.status === 402) return CAP_REACHED_MESSAGE;
    if (code === "conversation_not_found") return CONVERSATION_EXPIRED_MESSAGE;
    if (ERROR_MESSAGES[response.status]) {
      var msg = ERROR_MESSAGES[response.status];
      if (response.status === 429) {
        var retryAfter = response.headers.get("Retry-After");
        if (retryAfter) msg += " (try again in " + retryAfter + "s)";
      }
      return msg;
    }
    return DEFAULT_ERROR_MESSAGE;
  }

  function sendMessage(text) {
    if (inFlight) return;
    if (configError) {
      addMessage(text, "user");
      addMessage(CONFIG_ERROR_MESSAGE, "error");
      return;
    }

    addMessage(text, "user");
    setBusy(true);
    var typingEl = addTypingIndicator();

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller
      ? setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    var body = { message: text };
    if (conversationId) body.conversation_id = conversationId;

    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!response.ok) {
          // Structured errors carry {"detail": {"code": "..."}}; anything else has no code.
          return response
            .json()
            .catch(function () {
              return null;
            })
            .then(function (payload) {
              var detail = payload && payload.detail;
              throw { kind: "http", response: response, code: detail && typeof detail === "object" ? detail.code : null };
            });
        }
        return response.json().catch(function () {
          throw { kind: "parse" };
        });
      })
      .then(function (data) {
        typingEl.remove();
        if (data && data.conversation_id && data.conversation_id !== conversationId) {
          conversationId = data.conversation_id;
          saveConversationId(conversationId);
        }
        addMessage((data && data.response) || "", "bot");
      })
      .catch(function (err) {
        typingEl.remove();
        if (err && err.name === "AbortError") {
          addMessage(TIMEOUT_ERROR_MESSAGE, "error");
        } else if (err && err.kind === "http") {
          if (err.code === "conversation_not_found") clearConversationId();
          addMessage(friendlyErrorFor(err.response, err.code), "error");
        } else if (err && err.kind === "parse") {
          addMessage(DEFAULT_ERROR_MESSAGE, "error");
        } else {
          // fetch() itself rejected: offline, DNS failure, CORS rejection, etc.
          addMessage(NETWORK_ERROR_MESSAGE, "error");
        }
      })
      .then(function () {
        setBusy(false);
        input.focus();
      });
  }

  function handleSend() {
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "auto";
    sendMessage(text);
  }

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 80) + "px";
  });

  var opened = false;
  function openPanel() {
    opened = true;
    panel.classList.add("fw-open");
    bubble.setAttribute("aria-label", "Close chat");
    if (!messages.childElementCount) {
      if (configError) addMessage(CONFIG_ERROR_MESSAGE, "error");
      else addMessage(WELCOME_MESSAGE, "bot", true);
    }
    input.focus();
  }
  function closePanel() {
    opened = false;
    panel.classList.remove("fw-open");
    bubble.setAttribute("aria-label", "Open chat");
  }
  bubble.addEventListener("click", function () {
    if (opened) closePanel();
    else openPanel();
  });
  closeBtn.addEventListener("click", closePanel);

  function mount() {
    document.body.appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
