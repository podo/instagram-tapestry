import assert from "node:assert";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "..");
const connectorDir = join(projectDir, "local.instagram.timeline");
const outputDir = join(projectDir, "output", "playwright");
const pluginSource = readFileSync(join(connectorDir, "plugin.js"), "utf8");

mkdirSync(outputDir, { recursive: true });

function loadPlaywright() {
  try {
    return require("playwright");
  }
  catch (error) {
    return require("/Users/podo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
  }
}

function imageData(label, first = "#e1306c", second = "#f77737") {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${first}"/>
          <stop offset="1" stop-color="${second}"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <circle cx="260" cy="230" r="150" fill="rgba(255,255,255,.23)"/>
      <rect x="520" y="220" width="430" height="430" rx="54" fill="rgba(255,255,255,.16)"/>
      <text x="74" y="790" font-family="Arial, sans-serif" font-size="82" font-weight="800" fill="white">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const avatarOpenAI = imageData("OA", "#111111", "#4da3ff");
const avatarSam = imageData("SA", "#202020", "#8bc6ff");

function fixturePost() {
  return {
    pk: "3330000000000000001",
    id: "3330000000000000001_12345",
    code: "COPENAI123",
    media_type: 8,
    product_type: "feed",
    taken_at: 1787904000,
    caption: {
      text: "Launching <AI> research with @sama and #machinelearning\nhttps://example.com/story",
      created_at: 1787904000
    },
    user: {
      username: "openai",
      full_name: "OpenAI",
      profile_pic_url: avatarOpenAI
    },
    carousel_media: [
      {
        media_type: 1,
        original_width: 1200,
        original_height: 900,
        image_versions2: {
          candidates: [{ url: imageData("Research preview"), width: 1200, height: 900 }]
        },
        accessibility_caption: "Research preview alt text"
      },
      {
        media_type: 2,
        original_width: 1080,
        original_height: 1920,
        image_versions2: {
          candidates: [{ url: imageData("Reel thumbnail", "#405de6", "#833ab4"), width: 1080, height: 1920 }]
        },
        video_versions: [{ url: "https://cdn.example.test/reel.mp4", width: 1080, height: 1920 }],
        accessibility_caption: "Reel video alt text"
      }
    ],
    like_count: 12890,
    comment_count: 342,
    view_count: 55000,
    play_count: 78000,
    location: { name: "San Francisco, California" }
  };
}

function makeContext() {
  const state = new Map();
  const context = {
    console,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    String,
    URL,
    encodeURIComponent,
    sessionid: "session-cookie",
    csrftoken: "csrf-cookie",
    ds_user_id: "12345",
    cookie_header: "",
    source_mode: "Profiles",
    instagram_sources: "openai",
    include_reels: "on",
    show_metrics: "on",
    show_media: "on",
    show_location: "on",
    batch_size: "12",
    ig_app_id: "",
    sendRequest: async (url) => {
      if (url.includes("/accounts/current_user/")) {
        return JSON.stringify({ user: { username: "podo", full_name: "Podo", profile_pic_url: avatarOpenAI } });
      }
      if (url.includes("/media/") && url.includes("/comments/")) {
        return JSON.stringify({
          comments: [
            {
              pk: "9001",
              text: "This looks excellent #ai",
              created_at_utc: 1787904100,
              comment_like_count: 12,
              user: { username: "sama", full_name: "Sam Altman", profile_pic_url: avatarSam },
              preview_child_comments: [
                {
                  pk: "9002",
                  text: "reply from @openai",
                  created_at_utc: 1787904200,
                  comment_like_count: 3,
                  user: { username: "openai", full_name: "OpenAI", profile_pic_url: avatarOpenAI }
                }
              ]
            }
          ]
        });
      }
      if (url.includes("/feed/user/openai/username/")) {
        return JSON.stringify({ items: [fixturePost()] });
      }
      return JSON.stringify({});
    },
    processVerification: value => { context.verification = value; },
    processResults: value => { context.results = value; },
    processError: error => { context.error = error; },
    actionComplete: (value, error) => {
      context.actionResult = value;
      context.actionError = error;
    },
    getItem: key => state.get(key) || null,
    setItem: (key, value) => state.set(key, value),
    Item: { createWithUriDate: (uri, date) => ({ uri, date }) },
    Identity: { createWithName: name => ({ name }) },
    Annotation: { createWithText: text => ({ text }) },
    MediaAttachment: { createWithUrl: url => ({ url, kind: "media" }) },
    LinkAttachment: { createWithUrl: url => ({ url, kind: "link" }) }
  };

  vm.createContext(context);
  vm.runInContext(pluginSource, context);
  return context;
}

async function settle() {
  for (let index = 0; index < 5; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

function renderPage(item, comments) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Instagram Tapestry Render</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      background: #f2f2f4;
      color: #1f1f23;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f2f2f4; }
    .shell { max-width: 760px; margin: 0 auto; padding: 32px 18px 48px; }
    .timeline-title { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; font-size: 18px; font-weight: 700; }
    .ig-dot { width: 28px; height: 28px; border-radius: 9px; background: radial-gradient(circle at 32% 110%, #feda75 0 24%, #fa7e1e 32%, #d62976 55%, #962fbf 74%, #4f5bd5 100%); }
    .card, .comment { background: #fff; border: 1px solid #d7d7dc; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(20,20,30,.04); }
    .card { border-left: 5px solid #e1306c; }
    .head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .avatar-ring { width: 48px; height: 48px; padding: 2px; border-radius: 999px; background: conic-gradient(#feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75); }
    .avatar-ring img, .comment img { width: 100%; height: 100%; border-radius: inherit; border: 2px solid #fff; object-fit: cover; display: block; }
    .who { min-width: 0; flex: 1; }
    .name { font-weight: 750; line-height: 1.2; }
    .userline { color: #666875; font-size: 13px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .post-body { background: #fff; }
    .post-body p { margin: 0; }
    .post-body .instagram-visual { position: relative; min-height: 360px; background: #111; display: flex; align-items: center; justify-content: center; border-top: 2px solid #111; }
    .post-body .instagram-visual:first-child { border-top: 0; }
    .post-body .instagram-visual img, .post-body .instagram-visual video { width: 100%; max-height: 560px; object-fit: contain; display: block; background: #111; }
    .post-body p:not(.instagram-visual) { padding: 12px 16px 0; font-size: 13px; line-height: 1.4; color: #303038; }
    .post-body .instagram-caption small { font-size: 13px; line-height: 1.4; }
    .post-body a { color: #0b63ce; text-decoration: none; font-weight: 620; }
    .video-badge, .count-badge { position: absolute; right: 12px; top: 12px; border-radius: 999px; background: rgba(0,0,0,.68); color: #fff; padding: 6px 9px; font-size: 12px; font-weight: 700; }
    .count-badge { left: 12px; right: auto; }
    .content { padding: 14px 16px 16px; }
    .annotations { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 2px; }
    .pill { border: 1px solid #dedee4; border-radius: 999px; padding: 5px 9px; color: #595b66; font-size: 12px; background: #fafafa; }
    .actions { display: flex; align-items: center; justify-content: space-between; margin-top: 13px; padding-top: 12px; border-top: 1px solid #ececf0; }
    .glyphs { display: flex; gap: 13px; color: #202126; font-size: 22px; }
    button { border: 1px solid #cfd0d7; border-radius: 7px; background: #fff; color: #202126; padding: 7px 11px; font-weight: 700; cursor: pointer; }
    .comments { display: none; margin-top: 14px; gap: 10px; flex-direction: column; }
    .comments.open { display: flex; }
    .comment { display: grid; grid-template-columns: 40px 1fr; gap: 10px; padding: 12px; }
    .comment.reply { margin-left: 34px; }
    .comment .avatar { width: 40px; height: 40px; border-radius: 999px; }
    .comment .body { font-size: 14px; line-height: 1.4; }
    .comment .meta { color: #666875; font-size: 12px; margin-top: 5px; }
    @media (max-width: 640px) {
      .shell { padding: 16px 10px 28px; }
      .post-body .instagram-visual { min-height: 310px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <h1 class="timeline-title"><span class="ig-dot"></span><span>Instagram in Tapestry</span></h1>
    ${renderPost(item)}
    <section id="comments" class="comments" data-testid="comments-panel">
      ${comments.slice(1).map(renderComment).join("")}
    </section>
  </main>
  <script>
    document.querySelector('[data-testid="comments-toggle"]').addEventListener('click', () => {
      document.querySelector('[data-testid="comments-panel"]').classList.toggle('open');
    });
  </script>
</body>
</html>`;
}

function renderPost(item) {
  const annotations = item.annotations || [];
  return `<article class="card" data-testid="post-card">
    <header class="head">
      <div class="avatar-ring"><img src="${attr(item.author.avatar)}" alt=""></div>
      <div class="who">
        <div class="name" data-testid="author">${escapeHtml(item.author.name)}</div>
        <div class="userline">${escapeHtml(item.author.username)} · Instagram</div>
      </div>
    </header>
    <div class="post-body" data-testid="post-body">${item.body || ""}</div>
    <div class="content">
      <div class="annotations">
        ${annotations.map(annotation => `<span class="pill">${escapeHtml(annotation.text)}</span>`).join("")}
      </div>
      <div class="actions">
        <div class="glyphs" aria-label="Instagram action glyphs"><span>♡</span><span>⌕</span><span>↗</span><span>□</span></div>
        <button type="button" data-testid="comments-toggle">Comments</button>
      </div>
    </div>
  </article>`;
}

function renderComment(comment) {
  const isReply = (comment.annotations || []).some(annotation => annotation.text === "Reply");
  const metrics = (comment.annotations || []).map(annotation => annotation.text).join(" · ");
  return `<article class="comment${isReply ? " reply" : ""}" data-testid="comment-card">
    <div class="avatar"><img src="${attr(comment.author.avatar || "")}" alt=""></div>
    <div>
      <div class="body"><strong>${escapeHtml(comment.author.username || comment.author.name)}</strong> ${comment.body || ""}</div>
      <div class="meta">${escapeHtml(metrics)}</div>
    </div>
  </article>`;
}

function attr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch({ headless: true });
  }
  catch (firstError) {
    try {
      return await chromium.launch({ channel: "chrome", headless: true });
    }
    catch (secondError) {
      throw new Error(`Could not launch Chromium or local Chrome. ${firstError.message}`);
    }
  }
}

const context = makeContext();
vm.runInContext("load()", context);
await settle();
assert.ifError(context.error);
assert.equal(context.results.length, 1);

const item = context.results[0];
assert.equal(item.contentWarning, undefined);
vm.runInContext(`performAction("comments", ${JSON.stringify(item.actions.comments)}, results[0])`, context);
await settle();
assert.ifError(context.actionError);
assert.equal(context.actionResult.length, 3);

const htmlPath = join(outputDir, "instagram-render.html");
const screenshotPath = join(outputDir, "instagram-render-mobile.png");
const desktopScreenshotPath = join(outputDir, "instagram-render-desktop.png");
const commentsScreenshotPath = join(outputDir, "instagram-comments.png");
writeFileSync(htmlPath, renderPage(item, context.actionResult));

const { chromium } = loadPlaywright();
const browser = await launchBrowser(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(htmlPath).toString());
  await page.waitForSelector('[data-testid="post-card"]');

  assert.equal(await page.locator('[data-testid="post-card"]').count(), 1);
  assert.match(await page.locator('[data-testid="author"]').innerText(), /OpenAI/);
  const bodyText = await page.locator('[data-testid="post-body"]').innerText();
  assert.match(bodyText, /Launching <AI> research/);
  assert.match(bodyText, /@sama/);
  assert.match(bodyText, /#machinelearning/);
  assert.match(await page.locator("body").innerText(), /12,890 likes/);
  assert.match(await page.locator("body").innerText(), /Location: San Francisco/);

  const mediaBox = await page.locator('[data-testid="post-body"] .instagram-visual').first().boundingBox();
  assert.ok(mediaBox && mediaBox.width > 300 && mediaBox.height > 300, "media grid should be visible");
  assert.equal(await page.locator('[data-testid="post-body"] img').count(), 1);
  assert.equal(await page.locator('[data-testid="post-body"] video').count(), 1);
  const firstVisualIndex = await page.locator('[data-testid="post-body"]').evaluate(element => element.innerHTML.indexOf("instagram-visual"));
  const captionIndex = await page.locator('[data-testid="post-body"]').evaluate(element => element.innerHTML.indexOf("Launching"));
  assert.ok(firstVisualIndex >= 0 && captionIndex > firstVisualIndex, "caption should render after visual media");
  assert.equal(await page.locator('[data-testid="post-body"] .instagram-caption small').count(), 1);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await page.click('[data-testid="comments-toggle"]');
  await page.waitForSelector('[data-testid="comment-card"]');
  assert.equal(await page.locator('[data-testid="comment-card"]').count(), 2);
  assert.match(await page.locator('[data-testid="comments-panel"]').innerText(), /Sam Altman|@sama/);
  assert.match(await page.locator('[data-testid="comments-panel"]').innerText(), /reply from @openai/);
  await page.screenshot({ path: commentsScreenshotPath, fullPage: true });

  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto(pathToFileURL(htmlPath).toString());
  await page.waitForSelector('[data-testid="post-card"]');
  const desktopBox = await page.locator('[data-testid="post-card"]').boundingBox();
  assert.ok(desktopBox && desktopBox.width > 680 && desktopBox.height > 650, "desktop card should be visible and fully laid out");
  assert.equal(await page.locator('[data-testid="post-body"] img').count(), 1);
  assert.equal(await page.locator('[data-testid="post-body"] video').count(), 1);
  await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
}
finally {
  await browser.close();
}

console.log(JSON.stringify({
  htmlPath,
  screenshotPath,
  desktopScreenshotPath,
  commentsScreenshotPath,
  itemCount: context.results.length,
  contextItemCount: context.actionResult.length
}, null, 2));
