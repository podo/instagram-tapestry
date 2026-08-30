const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const connectorDir = path.join(__dirname, "..", "local.instagram.timeline");
const source = fs.readFileSync(
  path.join(connectorDir, "plugin.js"),
  "utf8"
);

function readConnectorJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(connectorDir, fileName), "utf8"));
}

function regexFromPattern(pattern) {
  const lastSlash = pattern.lastIndexOf("/");
  return new RegExp(pattern.slice(1, lastSlash), pattern.slice(lastSlash + 1) || "i");
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
      <circle cx="280" cy="240" r="140" fill="rgba(255,255,255,.25)"/>
      <rect x="520" y="240" width="420" height="420" rx="46" fill="rgba(255,255,255,.18)"/>
      <text x="80" y="790" font-family="Arial, sans-serif" font-size="86" font-weight="700" fill="white">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const avatarOpenAI = imageData("OA", "#111111", "#4da3ff");
const avatarPodo = imageData("PD", "#005c53", "#9fd8cb");

function photoEntry(label = "Photo", overrides = {}) {
  return {
    media_type: 1,
    original_width: 1200,
    original_height: 900,
    image_versions2: {
      candidates: [
        { url: imageData(label), width: 1200, height: 900 },
        { url: imageData(`${label} small`), width: 480, height: 360 }
      ]
    },
    accessibility_caption: `${label} alt text`,
    ...overrides
  };
}

function videoEntry(label = "Reel", overrides = {}) {
  return {
    media_type: 2,
    original_width: 1080,
    original_height: 1920,
    image_versions2: {
      candidates: [
        { url: imageData(`${label} thumbnail`, "#405de6", "#833ab4"), width: 1080, height: 1920 }
      ]
    },
    video_versions: [
      { url: `https://cdn.example.test/${label.toLowerCase()}.mp4`, width: 1080, height: 1920 },
      { url: `https://cdn.example.test/${label.toLowerCase()}-small.mp4`, width: 540, height: 960 }
    ],
    accessibility_caption: `${label} video alt text`,
    ...overrides
  };
}

function mediaItem(username = "openai", overrides = {}) {
  const upper = username.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const id = overrides.pk || (username === "openai" ? "3330000000000000001" : "3330000000000000002");
  return {
    pk: id,
    id: `${id}_12345`,
    code: overrides.code || `C${upper}123`,
    media_type: overrides.media_type ?? 8,
    product_type: overrides.product_type || "feed",
    taken_at: overrides.taken_at || 1787904000,
    caption: {
      text: overrides.caption || "Launching <AI> research with @sama and #machinelearning\nhttps://example.com/story",
      created_at: overrides.taken_at || 1787904000
    },
    user: {
      username,
      full_name: overrides.full_name || (username === "openai" ? "OpenAI" : "National Geographic"),
      profile_pic_url: overrides.profile_pic_url || avatarOpenAI
    },
    carousel_media: overrides.carousel_media || [
      photoEntry("Research preview"),
      videoEntry("Reel")
    ],
    like_count: overrides.like_count ?? 12890,
    comment_count: overrides.comment_count ?? 342,
    view_count: overrides.view_count ?? 55000,
    play_count: overrides.play_count ?? 78000,
    location: overrides.location || { name: "San Francisco, California" },
    ...overrides
  };
}

function profileFeedBody(username = "openai", items = null, cursor = "|next|") {
  return {
    items: items || [mediaItem(username)],
    next_max_id: cursor,
    more_available: Boolean(cursor)
  };
}

function hashtagFeedBody(tag = "ai") {
  return {
    items: [
      mediaItem("openai", {
        pk: "3330000000000000101",
        code: `HASH${tag.toUpperCase()}`,
        caption: `A hashtag post for #${tag}`,
        media_type: 1,
        carousel_media: null
      })
    ]
  };
}

function homeFeedBody() {
  return {
    feed_items: [
      {
        media_or_ad: mediaItem("openai", {
          pk: "3330000000000000201",
          code: "HOME123"
        })
      }
    ]
  };
}

function profileInfoBody(username = "openai") {
  return {
    data: {
      user: {
        username,
        full_name: "OpenAI",
        profile_pic_url: avatarOpenAI,
        edge_owner_to_timeline_media: {
          edges: [
            {
              node: {
                id: "3330000000000000301",
                shortcode: "WEBINFO123",
                taken_at_timestamp: 1787905000,
                display_url: imageData("Web info"),
                dimensions: { width: 1080, height: 1080 },
                owner: { username, full_name: "OpenAI", profile_pic_url: avatarOpenAI },
                edge_media_to_caption: { edges: [{ node: { text: "Fallback web profile post #ai" } }] },
                edge_media_preview_like: { count: 7 },
                edge_media_to_comment: { count: 2 }
              }
            }
          ],
          page_info: { has_next_page: false }
        }
      }
    }
  };
}

function commentsBody() {
  return {
    comments: [
      {
        pk: "9001",
        text: "This looks excellent #ai",
        created_at_utc: 1787904100,
        comment_like_count: 12,
        user: {
          username: "sama",
          full_name: "Sam Altman",
          profile_pic_url: imageData("SA", "#111111", "#8bc6ff")
        },
        preview_child_comments: [
          {
            pk: "9002",
            text: "reply from @openai",
            created_at_utc: 1787904200,
            comment_like_count: 3,
            user: {
              username: "openai",
              full_name: "OpenAI",
              profile_pic_url: avatarOpenAI
            }
          }
        ]
      }
    ]
  };
}

function makeContext(overrides = {}) {
  const state = new Map();
  const calls = [];
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
    instagram_sources: "openai, natgeo",
    include_reels: "on",
    show_metrics: "on",
    show_media: "on",
    show_location: "on",
    batch_size: "12",
    ig_app_id: "",
    profileBodies: {},
    tagBody: hashtagFeedBody("ai"),
    homeBody: homeFeedBody(),
    commentsBody: commentsBody(),
    currentUser: {
      user: {
        username: "podo",
        full_name: "Podo",
        profile_pic_url: avatarPodo
      }
    },
    sendRequest: async (url, method, parameters, headers) => {
      calls.push({ url, method, parameters, headers });
      if (url.includes("/accounts/current_user/")) return JSON.stringify(context.currentUser);
      if (url.includes("/media/") && url.includes("/comments/")) return JSON.stringify(context.commentsBody);
      if (url.includes("/feed/tag/")) return JSON.stringify(context.tagBody);
      if (url.includes("/feed/timeline/")) return JSON.stringify(context.homeBody);
      if (url.includes("/users/web_profile_info/")) {
        const username = new URL(url).searchParams.get("username") || "openai";
        return JSON.stringify(profileInfoBody(username));
      }
      if (url.includes("/feed/user/")) {
        const match = url.match(/\/feed\/user\/([^/]+)\/username/);
        const username = match ? decodeURIComponent(match[1]) : "openai";
        const body = context.profileBodies[username] || profileFeedBody(username, null, null);
        if (body instanceof Error) throw body;
        return JSON.stringify(body);
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
    Item: {
      createWithUriDate: (uri, date) => ({ uri, date })
    },
    Identity: {
      createWithName: name => ({ name })
    },
    Annotation: {
      createWithText: text => ({ text })
    },
    MediaAttachment: {
      createWithUrl: url => ({ url, kind: "media" })
    },
    LinkAttachment: {
      createWithUrl: url => ({ url, kind: "link" })
    },
    _state: state,
    _calls: calls,
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

async function settle() {
  for (let index = 0; index < 5; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

function apiCall(context, pattern) {
  return context._calls.find(call => call.url.includes(pattern));
}

async function run() {
  const pluginConfig = readConnectorJson("plugin-config.json");
  const uiConfig = readConnectorJson("ui-config.json");
  const discovery = readConnectorJson("discovery.json");
  const suggestions = readConnectorJson("suggestions.json");
  const actions = readConnectorJson("actions.json");
  const apps = readConnectorJson("apps.json");

  assert.strictEqual(pluginConfig.id, "local.instagram.timeline");
  assert.strictEqual(pluginConfig.icon, "https://static.cdninstagram.com/rsrc.php/yw/r/icwX0xAk0pz.webp");
  assert.strictEqual(pluginConfig.provides_attachments, false);
  assert.strictEqual(pluginConfig.minimum_app_version, "1.4");
  assert.strictEqual(pluginConfig.version, 2);
  assert.ok(uiConfig.inputs.some(input => input.name === "cookie_header"));
  assert.ok(uiConfig.inputs.some(input => input.name === "instagram_sources"));
  assert.ok(uiConfig.inputs.some(input => input.name === "ig_app_id"));
  assert.ok(discovery.sites.includes("instagram.com"));
  assert.ok(discovery.input.some(input => input.url === "https://www.instagram.com/$1/"));
  assert.ok(discovery.input.some(input => input.url === "https://www.instagram.com/explore/tags/$1/"));
  assert.ok(suggestions.variables.some(variable => variable.title === "AI Hashtag"));
  assert.ok(actions.items.some(action => action.id === "comments" && action.role === "context"));
  assert.ok(apps.apps.some(app => app.name === "Instagram" && app.template === "__URL__"));
  assert.strictEqual("@openai".match(regexFromPattern(discovery.input[0].match))[1], "openai");
  assert.strictEqual("#machinelearning".match(regexFromPattern(discovery.input[1].match))[1], "machinelearning");
  assert.strictEqual("https://www.instagram.com/openai/".match(regexFromPattern(discovery.url[0].extract))[1], "openai");
  assert.strictEqual("https://www.instagram.com/explore/tags/ai/".match(regexFromPattern(discovery.url[1].extract))[1], "ai");

  const context = makeContext();
  vm.runInContext("verify()", context);
  await settle();
  assert.ifError(context.error);
  assert.strictEqual(context.verification.displayName, "Instagram - @openai, @natgeo");
  assert.strictEqual(context.verification.accountIdentity.username, "@podo");
  assert.ok(context.verification.accountIdentity.avatar.startsWith("data:image/svg+xml"));

  const profileApi = apiCall(context, "/feed/user/openai/username/");
  assert.ok(profileApi, "verify should request profile feed by username");
  assert.strictEqual(profileApi.method, "GET");
  assert.match(profileApi.headers.Cookie, /sessionid=session-cookie/);
  assert.match(profileApi.headers.Cookie, /csrftoken=csrf-cookie/);
  assert.match(profileApi.headers.Cookie, /ds_user_id=12345/);
  assert.strictEqual(profileApi.headers["X-CSRFToken"], "csrf-cookie");
  assert.strictEqual(profileApi.headers["X-IG-App-ID"], "936619743392459");

  vm.runInContext("load()", context);
  await settle();
  assert.ifError(context.error);
  assert.strictEqual(context.results.length, 2);

  const item = context.results.find(result => result.author && result.author.username === "@openai");
  assert.ok(item, "load should return an OpenAI post");
  assert.strictEqual(item.uri, "https://www.instagram.com/p/COPENAI123/");
  assert.strictEqual(item.date.toISOString(), "2026-08-28T08:00:00.000Z");
  assert.strictEqual(item.contentWarning, undefined);
  assert.match(item.body, /^<p class="instagram-visual"><img /);
  assert.match(item.body, /<video controls preload="metadata" src="https:\/\/cdn\.example\.test\/reel\.mp4"/);
  assert.ok(item.body.indexOf("instagram-visual") < item.body.indexOf("Launching &lt;AI&gt; research"));
  assert.match(item.body, /Launching &lt;AI&gt; research/);
  assert.doesNotMatch(item.body, /<AI>/);
  assert.match(item.body, /href="https:\/\/www\.instagram\.com\/sama\/">@sama/);
  assert.match(item.body, /href="https:\/\/www\.instagram\.com\/explore\/tags\/machinelearning\/">#machinelearning/);
  assert.match(item.body, /href="https:\/\/example\.com\/story">https:\/\/example\.com\/story/);
  assert.strictEqual(item.author.name, "OpenAI");
  assert.strictEqual(item.author.username, "@openai");
  assert.strictEqual(item.author.uri, "https://www.instagram.com/openai/");
  assert.ok(item.author.avatar.startsWith("data:image/svg+xml"));
  assert.strictEqual(item.attachments, undefined);
  assert.match(item.annotations[0].text, /Carousel/);
  assert.match(item.annotations[1].text, /Location: San Francisco/);
  assert.match(item.annotations[2].text, /12,890 likes/);
  assert.match(item.annotations[2].text, /342 comments/);
  assert.match(item.annotations[2].text, /55,000 views/);
  assert.match(item.annotations[2].text, /78,000 plays/);
  assert.deepStrictEqual(JSON.parse(item.actions.comments), {
    mediaId: "3330000000000000001_12345",
    url: "https://www.instagram.com/p/COPENAI123/"
  });

  const initialState = JSON.parse(context._state.get("syncStateV1"));
  assert.strictEqual(initialState.highWaterBySource["profile:openai"], "3330000000000000001");
  assert.strictEqual(initialState.highWaterBySource["profile:natgeo"], "3330000000000000002");

  context.profileBodies.openai = profileFeedBody("openai", [
    mediaItem("openai", { pk: "3330000000000000003", code: "COPENAI999", caption: "Newer post" }),
    mediaItem("openai")
  ], "|next|");
  context.profileBodies.natgeo = profileFeedBody("natgeo", [mediaItem("natgeo")], null);
  vm.runInContext("load()", context);
  await settle();
  assert.ifError(context.error);
  assert.strictEqual(context.results.length, 1);
  assert.strictEqual(context.results[0].uri, "https://www.instagram.com/p/COPENAI999/");

  const noMedia = makeContext({ instagram_sources: "openai", show_media: "off" });
  vm.runInContext("load()", noMedia);
  await settle();
  assert.ifError(noMedia.error);
  assert.strictEqual(noMedia.results[0].attachments.length, 1);
  assert.strictEqual(noMedia.results[0].attachments[0].kind, "link");
  assert.strictEqual(noMedia.results[0].attachments[0].siteName, "Instagram");
  assert.doesNotMatch(noMedia.results[0].body, /instagram-visual/);

  const sensitive = makeContext({
    instagram_sources: "openai",
    profileBodies: {
      openai: profileFeedBody("openai", [
        mediaItem("openai", {
          is_sensitive_media: true,
          pk: "3330000000000000401",
          code: "SENSITIVE1"
        })
      ], null)
    }
  });
  vm.runInContext("load()", sensitive);
  await settle();
  assert.ifError(sensitive.error);
  assert.strictEqual(sensitive.results[0].contentWarning, "Sensitive content");

  const hashtag = makeContext({ source_mode: "Hashtag", instagram_sources: "#ai" });
  vm.runInContext("load()", hashtag);
  await settle();
  assert.ifError(hashtag.error);
  assert.ok(apiCall(hashtag, "/feed/tag/ai/"), "hashtag mode should request tag feed");
  assert.strictEqual(hashtag.results[0].uri, "https://www.instagram.com/p/HASHAI/");

  const home = makeContext({ source_mode: "Home", instagram_sources: "" });
  vm.runInContext("load()", home);
  await settle();
  assert.ifError(home.error);
  const homeApi = apiCall(home, "/feed/timeline/");
  assert.ok(homeApi, "home mode should request timeline feed");
  assert.strictEqual(homeApi.method, "POST");
  assert.match(homeApi.parameters, /reason=cold_start_fetch/);

  const comments = makeContext({ instagram_sources: "openai" });
  vm.runInContext("load()", comments);
  await settle();
  assert.ifError(comments.error);
  const original = comments.results[0];
  vm.runInContext(`performAction("comments", ${JSON.stringify(JSON.stringify(JSON.parse(original.actions.comments)))}, results[0])`, comments);
  await settle();
  assert.ifError(comments.actionError);
  assert.strictEqual(comments.actionResult.length, 3);
  assert.strictEqual(comments.actionResult[0], original);
  assert.strictEqual(comments.actionResult[1].author.username, "@sama");
  assert.match(comments.actionResult[1].body, /This looks excellent/);
  assert.match(comments.actionResult[1].annotations[0].text, /12 likes/);
  assert.strictEqual(comments.actionResult[2].author.username, "@openai");
  assert.match(comments.actionResult[2].annotations[0].text, /Reply/);

  const fallback = makeContext({
    instagram_sources: "openai",
    profileBodies: {
      openai: new Error("HTTP 404")
    }
  });
  vm.runInContext("load()", fallback);
  await settle();
  assert.ifError(fallback.error);
  assert.ok(apiCall(fallback, "/users/web_profile_info/"), "profile feed should fall back to web_profile_info");
  assert.strictEqual(fallback.results[0].uri, "https://www.instagram.com/p/WEBINFO123/");
  assert.match(fallback.results[0].body, /Fallback web profile post/);

  const missingCredentials = makeContext({ sessionid: "", csrftoken: "", cookie_header: "" });
  vm.runInContext("load()", missingCredentials);
  await settle();
  assert.ok(missingCredentials.error);
  assert.match(missingCredentials.error.message, /sessionid and csrftoken/);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
