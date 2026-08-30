#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

const args = new Set(process.argv.slice(2));
const port = Number(process.env.INSTAGRAM_TAPESTRY_DEBUG_PORT || 9333);
const shouldPrint = args.has("--print");
const keepBrowser = args.has("--keep-browser");

if (typeof WebSocket !== "function") {
  throw new Error("This helper requires Node.js 22 or newer for WebSocket support.");
}

const browserPath = browserExecutable();
if (!browserPath) {
  throw new Error("Could not find Chrome, Chrome Canary, Brave, or Edge. Set INSTAGRAM_TAPESTRY_BROWSER to a Chromium executable.");
}

const profileDir = mkdtempSync(join(tmpdir(), "instagram-tapestry-browser-"));
const browser = spawn(browserPath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--new-window",
  "https://www.instagram.com/"
], {
  detached: true,
  stdio: "ignore"
});
browser.unref();

try {
  await waitForCdp(port);
  console.log("A temporary browser window is open at instagram.com.");
  console.log("Log in there, then return here. No cookie values will be printed unless you pass --print.");

  const rl = createInterface({ input, output });
  await rl.question("Press Enter after Instagram is fully logged in...");
  rl.close();

  const target = await pageTarget(port);
  const session = await cdpSession(target.webSocketDebuggerUrl);
  let cookies;
  try {
    await session.call("Network.enable").catch(() => {});
    cookies = await allCookies(session);
  }
  finally {
    session.close();
  }

  const sessionId = cookieValue(cookies, "sessionid");
  const csrf = cookieValue(cookies, "csrftoken");
  const userId = cookieValue(cookies, "ds_user_id");
  if (!sessionId || !csrf) {
    throw new Error("Could not find both sessionid and csrftoken. Confirm the temporary browser is logged in to instagram.com.");
  }

  const parts = [`sessionid=${sessionId}`, `csrftoken=${csrf}`];
  if (userId) parts.push(`ds_user_id=${userId}`);
  const header = parts.join("; ");
  const copied = copyToClipboard(header);
  if (copied) {
    const userIdStatus = userId ? `; ds_user_id length=${userId.length}` : "";
    console.log(`Copied Cookie Header to clipboard. sessionid length=${sessionId.length}; csrftoken length=${csrf.length}${userIdStatus}.`);
  }
  else {
    console.log(`Found cookies. sessionid length=${sessionId.length}; csrftoken length=${csrf.length}.`);
    console.log("Could not copy to clipboard; rerun with --print if you need to show the header in the terminal.");
  }

  if (shouldPrint) {
    console.log(header);
  }
}
finally {
  if (!keepBrowser) {
    try {
      process.kill(-browser.pid);
    }
    catch (error) {
      // The user may have already closed the browser.
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
}

function browserExecutable() {
  if (process.env.INSTAGRAM_TAPESTRY_BROWSER && existsSync(process.env.INSTAGRAM_TAPESTRY_BROWSER)) {
    return process.env.INSTAGRAM_TAPESTRY_BROWSER;
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ];
  return candidates.find(existsSync) || null;
}

async function waitForCdp(debugPort) {
  const url = `http://127.0.0.1:${debugPort}/json/version`;
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    }
    catch (error) {
      // Keep waiting until Chromium opens the debugging endpoint.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for the browser debugging endpoint on port ${debugPort}.`);
}

async function pageTarget(debugPort) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) throw new Error(`Could not list browser tabs: HTTP ${response.status}`);
  const targets = await response.json();
  const target = targets.find(item => item.type === "page" && /^https:\/\/(www\.)?instagram\.com\//i.test(item.url || ""))
    || targets.find(item => item.type === "page");
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error("Could not find a browser tab to inspect.");
  }
  return target;
}

async function allCookies(session) {
  try {
    const result = await session.call("Network.getAllCookies");
    return result.cookies || [];
  }
  catch (error) {
    const result = await session.call("Storage.getCookies", { urls: ["https://www.instagram.com", "https://instagram.com"] });
    return result.cookies || [];
  }
}

function cookieValue(cookies, name) {
  const cookie = cookies.find(item => item.name === name && /(^|\.)instagram\.com$/i.test(item.domain || ""));
  return cookie ? cookie.value : null;
}

function copyToClipboard(value) {
  const result = spawnSync("pbcopy", { input: value });
  return result.status === 0;
}

function cdpSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;

    ws.addEventListener("open", () => {
      resolve({
        call(method, params = {}) {
          const id = nextId;
          nextId += 1;
          const payload = { id, method, params };
          return new Promise((callResolve, callReject) => {
            pending.set(id, { resolve: callResolve, reject: callReject });
            ws.send(JSON.stringify(payload));
          });
        },
        close() {
          ws.close();
        }
      });
    });

    ws.addEventListener("message", event => {
      const message = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8"));
      if (!message.id || !pending.has(message.id)) return;
      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        callbacks.reject(new Error(message.error.message || JSON.stringify(message.error)));
      }
      else {
        callbacks.resolve(message.result || {});
      }
    });

    ws.addEventListener("error", () => {
      reject(new Error("Browser debugging WebSocket failed."));
    });
  });
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
