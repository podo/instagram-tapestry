// local.instagram.timeline

const instagramBase = "https://www.instagram.com";
const apiBase = `${instagramBase}/api/v1`;
const instagramIconUrl = "https://static.cdninstagram.com/rsrc.php/yw/r/icwX0xAk0pz.webp";
const defaultIgAppId = "936619743392459";
const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const maximumSources = 25;
const maximumPagesPerSource = 10;

function verify() {
  verifyAsync().then(processVerification).catch(processError);
}

function load() {
  loadAsync().then(processResults).catch(processError);
}

function performAction(actionId, actionValue, item) {
  performActionAsync(actionId, actionValue, item)
    .then(result => actionComplete(result, null))
    .catch(error => actionComplete(null, error));
}

async function performActionAsync(actionId, actionValue, item) {
	const value = parseActionValue(actionValue);
	const mediaId = value.mediaId || value.id;
	if (actionId === "favorite" || actionId === "unfavorite") {
		if (!item) throw new Error("Could not update a favorite without an item.");
		return toggleFavorite(item, mediaId || item.uri, actionId === "favorite");
	}

	if (!["comments", "like", "unlike", "save", "unsave", "repost", "unrepost"].includes(actionId)) {
		throw new Error(`Unsupported Instagram action: ${actionId}`);
	}
	if (!mediaId) throw new Error(`Could not determine the Instagram media ID for ${actionId}.`);

	const credentials = normalizedCredentials();
	const postUrl = value.url || (item && item.uri) || `${instagramBase}/p/${mediaId}/`;
	if (actionId === "comments") {
		const page = await mediaCommentsPage(mediaId, credentials);
		const comments = commentsToItems(page.comments, postUrl);
		return item ? [item].concat(comments) : comments;
	}

	await performMediaAction(actionId, mediaId, credentials);
	return toggleRemoteAction(item, actionId);
}

async function verifyAsync() {
  const credentials = normalizedCredentials();
  const mode = normalizedSourceMode();
  const result = {
    displayName: `Instagram · ${sourceLabel()}`,
    icon: instagramIconUrl
  };

  let page = null;
  if (mode === "profiles") {
    const profiles = normalizedProfiles();
    if (profiles.length === 0) throw new Error("Enter one or more Instagram usernames.");
    page = await profileFeedPage(profiles[0], 1, null, credentials);
    if (profiles.length === 1) {
      const profile = profileFromPage(page, profiles[0]);
      result.displayName = `Instagram · @${profile.username || profiles[0]}`;
      if (profile.avatar) result.icon = profile.avatar;
    }
  }
  else if (mode === "hashtag") {
    const tags = normalizedHashtags();
    if (tags.length === 0) throw new Error("Enter one or more Instagram hashtags.");
    page = await hashtagFeedPage(tags[0], 1, null, credentials);
    if (tags.length === 1) result.displayName = `Instagram · #${tags[0]}`;
  }
  else {
    page = await homeFeedPage(1, null, credentials, mode);
    result.displayName = `Instagram · ${sourceLabel()}`;
  }

  const accountIdentity = await currentAccountIdentity(credentials);
  if (accountIdentity) result.accountIdentity = accountIdentity;
  return result;
}

async function loadAsync() {
  const credentials = normalizedCredentials();
  const mode = normalizedSourceMode();
  if (mode === "profiles") return loadProfileFeeds(credentials);
  if (mode === "hashtag") return loadHashtagFeeds(credentials);
  return loadHomeFeed(credentials, mode);
}

async function loadProfileFeeds(credentials) {
  const profiles = normalizedProfiles();
  if (profiles.length === 0) throw new Error("Enter one or more Instagram usernames.");
  return loadSources(profiles, "profile", credentials, (profile, limit, cursor) => (
    profileFeedPage(profile, limit, cursor, credentials)
  ));
}

async function loadHashtagFeeds(credentials) {
  const tags = normalizedHashtags();
  if (tags.length === 0) throw new Error("Enter one or more Instagram hashtags.");
  return loadSources(tags, "hashtag", credentials, (tag, limit, cursor) => (
    hashtagFeedPage(tag, limit, cursor, credentials)
  ));
}

async function loadHomeFeed(credentials, variant) {
  return loadSources(["home"], "home", credentials, (source, limit, cursor) => (
    homeFeedPage(limit, cursor, credentials, variant)
  ));
}

async function loadSources(sources, kind, credentials, fetchPage) {
  const limit = normalizedBatchSize();
  const posts = [];

  for (const source of sources) {
    const sourcePosts = [];
    let cursor = null;
    let pageCount = 0;

    do {
      const page = await fetchPage(source, limit, cursor);
      for (const post of page.items || []) {
        if (!post || !post.id) continue;
        if (!includePost(post)) continue;
        sourcePosts.push(post);
      }

      cursor = page.nextCursor;
      pageCount += 1;
    } while (
      cursor
      && sourcePosts.length < limit
      && pageCount < maximumPagesPerSource
    );

    posts.push(...sourcePosts.slice(0, limit));
  }

  return postsToItems(posts);
}

async function profileFeedPage(username, count, cursor, credentials) {
  const parameters = [["count", count]];
  if (cursor) parameters.push(["max_id", cursor]);

  const url = `${apiBase}/feed/user/${encodeURIComponent(username)}/username/?${encodeQuery(parameters)}`;
  try {
    const json = await requestJson(url, "GET", null, webHeaders(credentials, `${instagramBase}/${username}/`), "ProfileFeed");
    const items = normalizeMediaItems(json, { sourceKind: "profile", sourceValue: username });
    return {
      items,
      nextCursor: nextCursorFromResponse(json),
      profile: profileFromItems(items, username)
    };
  }
  catch (error) {
    if (!isFallbackProfileError(error)) throw error;
    return profileWebInfoPage(username, credentials);
  }
}

async function profileWebInfoPage(username, credentials) {
  const url = `${apiBase}/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const json = await requestJson(url, "GET", null, webHeaders(credentials, `${instagramBase}/${username}/`), "ProfileInfo");
  const user = json && json.data && json.data.user ? json.data.user : null;
  const items = normalizeMediaItems(json, { sourceKind: "profile", sourceValue: username, profileUser: user });
  return {
    items,
    nextCursor: graphqlPageCursor(user && user.edge_owner_to_timeline_media),
    profile: user ? normalizeProfile(user, username) : profileFromItems(items, username)
  };
}

async function hashtagFeedPage(tag, count, cursor, credentials) {
  const parameters = [
    ["rank_token", rankToken(credentials)],
    ["count", count]
  ];
  if (cursor) parameters.push(["max_id", cursor]);

  const url = `${apiBase}/feed/tag/${encodeURIComponent(tag)}/?${encodeQuery(parameters)}`;
  try {
    const json = await requestJson(url, "GET", null, webHeaders(credentials, `${instagramBase}/explore/tags/${tag}/`), "HashtagFeed");
    return {
      items: normalizeMediaItems(json, { sourceKind: "hashtag", sourceValue: tag }),
      nextCursor: nextCursorFromResponse(json)
    };
  }
  catch (error) {
    if (!isFallbackProfileError(error)) throw error;
    return hashtagWebInfoPage(tag, credentials);
  }
}

async function hashtagWebInfoPage(tag, credentials) {
  const url = `${apiBase}/tags/web_info/?tag_name=${encodeURIComponent(tag)}`;
  const json = await requestJson(url, "GET", null, webHeaders(credentials, `${instagramBase}/explore/tags/${tag}/`), "HashtagInfo");
  return {
    items: normalizeMediaItems(json, { sourceKind: "hashtag", sourceValue: tag }),
    nextCursor: graphqlPageCursor(json && json.data && json.data.hashtag && json.data.hashtag.edge_hashtag_to_media)
  };
}

async function homeFeedPage(count, cursor, credentials, variant) {
  const feedVariant = normalizedHomeVariant(variant);
  const form = [
    ["is_prefetch", "0"],
    ["feed_view_info", ""],
    ["seen_posts", ""],
    ["reason", cursor ? "pagination" : "cold_start_fetch"],
    ["is_pull_to_refresh", cursor ? "0" : "1"],
    ["_csrftoken", credentials.csrf]
  ];
  if (cursor) form.push(["max_id", cursor]);
  if (feedVariant) form.push(["feed_type", feedVariant]);

  const headers = webHeaders(credentials, `${instagramBase}/`);
  headers["Content-Type"] = "application/x-www-form-urlencoded";
  const endpoint = feedVariant
    ? `${apiBase}/feed/timeline/?variant=${encodeURIComponent(feedVariant)}`
    : `${apiBase}/feed/timeline/`;
  const json = await requestJson(endpoint, "POST", encodeQuery(form), headers, "HomeFeed");
  return {
    items: normalizeMediaItems(json, { sourceKind: "home", sourceValue: "home" }),
    nextCursor: nextCursorFromResponse(json)
  };
}

async function mediaCommentsPage(mediaId, credentials) {
  const parameters = [["can_support_threading", "true"]];
  const url = `${apiBase}/media/${encodeURIComponent(mediaId)}/comments/?${encodeQuery(parameters)}`;
  const json = await requestJson(url, "GET", null, webHeaders(credentials, `${instagramBase}/`), "Comments");
  return {
    comments: normalizeComments(json && json.comments ? json.comments : [])
  };
}

async function currentAccountIdentity(credentials) {
  try {
    const url = `${apiBase}/accounts/current_user/?edit=true`;
    const json = await requestJson(url, "GET", null, webHeaders(credentials, `${instagramBase}/accounts/edit/`), "CurrentUser");
    const user = (json && json.user) || (json && json.data && json.data.user);
    if (!user) return null;
    const profile = normalizeProfile(user, credentials.userId || "instagram");
    return createIdentity(
      profile.name || profile.username || "Instagram",
      profile.username ? `@${profile.username}` : null,
      profile.avatar,
      profile.username ? `${instagramBase}/${profile.username}/` : instagramBase
    );
  }
  catch (error) {
    console.log(`Unable to load Instagram account identity: ${error.message || error}`);
    return null;
  }
}

function normalizeMediaItems(json, context) {
  const posts = [];
  collectPrivateItems(json, context, posts);
  collectGraphqlItems(json, context, posts);
  collectSectionItems(json, context, posts);
  return sortPostsNewestFirst(dedupePosts(posts));
}

function collectPrivateItems(json, context, posts) {
  const directItems = Array.isArray(json && json.items) ? json.items : [];
  for (const raw of directItems) {
    const post = normalizePrivateMedia(raw, context);
    if (post) posts.push(post);
  }

  const feedItems = Array.isArray(json && json.feed_items) ? json.feed_items : [];
  for (const entry of feedItems) {
    const raw = entry && (entry.media_or_ad || entry.media || entry.item);
    const post = normalizePrivateMedia(raw, context);
    if (post) posts.push(post);
  }
}

function collectGraphqlItems(json, context, posts) {
  const data = json && json.data ? json.data : {};
  const user = data.user || context.profileUser;
  collectGraphqlEdges(user && user.edge_owner_to_timeline_media, context, user, posts);

  const hashtag = data.hashtag || {};
  collectGraphqlEdges(hashtag.edge_hashtag_to_media, context, null, posts);
  collectGraphqlEdges(hashtag.edge_hashtag_to_top_posts, context, null, posts);
}

function collectGraphqlEdges(connection, context, profileUser, posts) {
  const edges = connection && Array.isArray(connection.edges) ? connection.edges : [];
  for (const edge of edges) {
    const post = normalizeGraphqlMedia(edge && edge.node, { ...context, profileUser: profileUser || context.profileUser });
    if (post) posts.push(post);
  }
}

function collectSectionItems(json, context, posts) {
  const sections = Array.isArray(json && json.sections) ? json.sections : [];
  for (const section of sections) {
    const content = section && section.layout_content ? section.layout_content : {};
    const buckets = [
      content.medias,
      content.fill_items,
      content.one_by_two_item && content.one_by_two_item.clips && content.one_by_two_item.clips.items,
      content.two_by_two_item && content.two_by_two_item.channel && content.two_by_two_item.channel.media
    ];

    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const entry of bucket) {
        const raw = entry && (entry.media || entry.item || entry);
        const post = normalizePrivateMedia(raw, context);
        if (post) posts.push(post);
      }
    }
  }
}

function normalizePrivateMedia(raw, context) {
  const media = raw && (raw.media || raw.media_or_ad || raw);
  if (!media || typeof media !== "object") return null;

  const id = stringId(media.pk || media.id || media.media_id || media.code);
  const code = cleanShortcode(media.code || media.shortcode);
  if (!id && !code) return null;

  const user = media.user || media.owner || context.profileUser || {};
  const profile = normalizeProfile(user, context.sourceKind === "profile" ? context.sourceValue : null);
  const date = unixDate(media.taken_at || (media.caption && media.caption.created_at) || media.device_timestamp);
  const caption = captionText(media.caption) || stringValue(media.caption_text || media.text);
  const attachments = mediaAttachmentsFromPrivate(media, profile.name || profile.username || "Instagram");

  return {
    id: id || code,
    mediaId: stringId(media.id || media.pk || id || code),
    code,
    url: instagramPostUrl(code, media),
    date,
    text: caption,
    authorName: profile.name || profile.username || "Instagram",
    authorUsername: profile.username,
    authorAvatar: profile.avatar,
    authorUrl: profile.username ? `${instagramBase}/${profile.username}/` : instagramBase,
    attachments,
    typeLabel: mediaTypeLabel(media),
    location: normalizeLocation(media.location),
    likes: finiteNumber(media.like_count),
    comments: finiteNumber(media.comment_count),
    views: finiteNumber(media.view_count),
    plays: finiteNumber(media.play_count || media.video_play_count),
    liked: booleanValue(
      media.has_liked,
      media.user_has_liked,
      media.viewer && media.viewer.has_liked,
      media.viewer && media.viewer.liked
    ),
    saved: booleanValue(
      media.has_viewer_saved,
      media.has_saved,
      media.user_has_saved,
      media.is_saved,
      media.viewer && media.viewer.has_saved,
      media.viewer && media.viewer.saved
    ),
    reposted: booleanValue(
      media.has_viewer_reposted,
      media.has_reposted,
      media.user_has_reposted,
      media.is_reposted,
      media.viewer && media.viewer.has_reposted,
      media.viewer && media.viewer.reposted
    ),
    sourceKind: context.sourceKind,
    sourceValue: context.sourceValue,
    contentWarning: mediaContentWarning(media)
  };
}

function normalizeGraphqlMedia(node, context) {
  if (!node || typeof node !== "object") return null;
  const code = cleanShortcode(node.shortcode || node.code);
  const id = stringId(node.id || code);
  if (!id && !code) return null;

  const user = node.owner || context.profileUser || {};
  const profile = normalizeProfile(user, context.sourceKind === "profile" ? context.sourceValue : null);
  const caption = graphqlCaptionText(node);
  const attachments = mediaAttachmentsFromGraphql(node, profile.name || profile.username || "Instagram");

  return {
    id,
    mediaId: id,
    code,
    url: instagramPostUrl(code, node),
    date: unixDate(node.taken_at_timestamp || node.taken_at),
    text: caption,
    authorName: profile.name || profile.username || "Instagram",
    authorUsername: profile.username,
    authorAvatar: profile.avatar,
    authorUrl: profile.username ? `${instagramBase}/${profile.username}/` : instagramBase,
    attachments,
    typeLabel: graphqlTypeLabel(node),
    location: normalizeLocation(node.location),
    likes: finiteNumber(node.edge_media_preview_like && node.edge_media_preview_like.count),
    comments: finiteNumber(node.edge_media_to_comment && node.edge_media_to_comment.count),
    views: finiteNumber(node.video_view_count),
    plays: finiteNumber(node.video_play_count),
    liked: booleanValue(
      node.viewer_has_liked,
      node.has_liked,
      node.viewer && node.viewer.has_liked,
      node.viewer && node.viewer.liked
    ),
    saved: booleanValue(
      node.has_viewer_saved,
      node.has_saved,
      node.user_has_saved,
      node.is_saved,
      node.viewer && node.viewer.has_saved,
      node.viewer && node.viewer.saved
    ),
    reposted: booleanValue(
      node.viewer_has_reposted,
      node.has_viewer_reposted,
      node.has_reposted,
      node.user_has_reposted,
      node.is_reposted,
      node.viewer && node.viewer.has_reposted,
      node.viewer && node.viewer.reposted
    ),
    sourceKind: context.sourceKind,
    sourceValue: context.sourceValue,
    contentWarning: mediaContentWarning(node)
  };
}

function normalizeProfile(user, fallbackUsername) {
  const username = cleanUsername(
    user && (
      user.username
      || user.handle
      || (user.owner && user.owner.username)
      || fallbackUsername
    )
  );
  const name = stringValue(
    user && (
      user.full_name
      || user.name
      || user.fullName
      || username
    )
  );
  const avatar = firstUrl(
    user && (
      user.profile_pic_url
      || user.profile_pic_url_hd
      || user.profilePicture
      || user.profile_pic
    )
  );
  return {
    username,
    name,
    avatar
  };
}

function profileFromPage(page, fallbackUsername) {
  if (page && page.profile) return page.profile;
  return profileFromItems(page && page.items, fallbackUsername);
}

function profileFromItems(items, fallbackUsername) {
  const first = Array.isArray(items) && items.length > 0 ? items[0] : null;
  return {
    username: first && first.authorUsername ? first.authorUsername : cleanUsername(fallbackUsername),
    name: first && first.authorName ? first.authorName : cleanUsername(fallbackUsername),
    avatar: first && first.authorAvatar ? first.authorAvatar : null
  };
}

function mediaAttachmentsFromPrivate(media, authorName) {
  const entries = Array.isArray(media.carousel_media) && media.carousel_media.length > 0
    ? media.carousel_media
    : [media];
  return entries.map(entry => mediaAttachmentFromPrivate(entry, authorName)).filter(Boolean).slice(0, 10);
}

function mediaAttachmentFromPrivate(entry, authorName) {
  if (!entry || typeof entry !== "object") return null;
  const isVideo = Number(entry.media_type) === 2 || Array.isArray(entry.video_versions);
  const image = bestImageUrl(entry);
  const video = bestVideoUrl(entry);
  const hasPlayableVideo = isVideo && Boolean(video);
  const url = hasPlayableVideo ? video : image;
  if (!isMediaUrl(url)) return null;

  const size = mediaSize(entry, isVideo);
  return {
    url,
    thumbnail: hasPlayableVideo ? image : null,
    mimeType: mediaMimeType(url, hasPlayableVideo),
    width: size.width,
    height: size.height,
    altText: stringValue(entry.accessibility_caption || entry.alt_text) || (isVideo ? `Video from ${authorName}` : `Image from ${authorName}`)
  };
}

function mediaAttachmentsFromGraphql(node, authorName) {
  const children = node && node.edge_sidecar_to_children && Array.isArray(node.edge_sidecar_to_children.edges)
    ? node.edge_sidecar_to_children.edges.map(edge => edge && edge.node)
    : [node];
  return children.map(child => mediaAttachmentFromGraphql(child, authorName)).filter(Boolean).slice(0, 10);
}

function mediaAttachmentFromGraphql(node, authorName) {
  if (!node || typeof node !== "object") return null;
  const isVideo = Boolean(node.is_video || node.video_url);
  const image = firstUrl(node.display_url || node.thumbnail_src || node.thumbnail_resources && largestThumbnail(node.thumbnail_resources));
  const video = firstUrl(node.video_url);
  const hasPlayableVideo = isVideo && Boolean(video);
  const url = hasPlayableVideo ? video : image;
  if (!isMediaUrl(url)) return null;

  const width = finiteNumber(node.dimensions && node.dimensions.width);
  const height = finiteNumber(node.dimensions && node.dimensions.height);
  return {
    url,
    thumbnail: hasPlayableVideo ? image : null,
    mimeType: mediaMimeType(url, hasPlayableVideo),
    width,
    height,
    altText: stringValue(node.accessibility_caption || node.alt_text) || (isVideo ? `Video from ${authorName}` : `Image from ${authorName}`)
  };
}

function postsToItems(posts) {
  return sortPostsNewestFirst(dedupePosts(posts)).map(postToItem);
}

function postToItem(post) {
  const item = Item.createWithUriDate(post.url, post.date || new Date());
  const mediaAttachments = postMediaAttachments(post);
  const body = postBody(post, mediaAttachments.length === 0 && postMediaEntries(post).length > 0);
  if (body) item.body = body;
  if (post.contentWarning) item.contentWarning = post.contentWarning;

  const attachments = mediaAttachments.length > 0 ? mediaAttachments : postFallbackAttachments(post);
  if (attachments.length > 0) item.attachments = attachments;

  // Assign author last — matches X/Bluesky and Loom identity quirks.
  item.author = postIdentity(post);
  item.actions = postActions(post);
  return item;
}

function postBody(post, useInlineMedia = false) {
  const parts = [];
  const meta = postMetaHtml(post);
  const visual = useInlineMedia ? postVisualHtml(post) : "";
  const caption = captionHtml(post && post.text ? post.text : "");
  if (meta) parts.push(meta);
  if (visual) parts.push(visual);
  if (caption) parts.push(caption);
  return parts.join("");
}

function postIdentity(post) {
  return createIdentity(
    post.authorName || post.authorUsername || "Instagram",
    post.authorUsername ? `@${post.authorUsername}` : null,
    post.authorAvatar,
    post.authorUrl || instagramBase
  );
}

function postMetaHtml(post) {
  const blocks = [];
  // Loom renders native annotations above Service. Keep location + metrics under Author.
  if (showLocation() && post.location) {
    blocks.push(`<p class="instagram-meta-location"><small>${escapeHtml(`Location: ${post.location}`)}</small></p>`);
  }
  if (showMetrics()) {
    const text = metricsTextFromCounts(metricsCountsForPost(post));
    if (text) blocks.push(metricsMetaHtml(text));
  }
  return blocks.join("");
}

function metricsMetaHtml(text) {
  return `<p class="instagram-meta-metrics"><small>${escapeHtml(text)}</small></p>`;
}

function metricsCountsForPost(post) {
  return {
    likes: finiteNumber(post && post.likes),
    comments: finiteNumber(post && post.comments),
    views: finiteNumber(post && post.views),
    plays: finiteNumber(post && post.plays)
  };
}

function metricsTextFromCounts(metrics) {
  const details = [];
  if (metrics.likes > 0) details.push(`${formatCount(metrics.likes)} likes`);
  if (metrics.comments > 0) details.push(`${formatCount(metrics.comments)} comments`);
  if (metrics.views > 0) details.push(`${formatCount(metrics.views)} views`);
  if (metrics.plays > 0) details.push(`${formatCount(metrics.plays)} plays`);
  return details.join(" - ");
}

function parseMetricsFromText(text) {
  const value = String(text || "");
  const metrics = { likes: 0, comments: 0, views: 0, plays: 0 };
  const likes = value.match(/([\d,.]+)\s+likes?/i);
  const comments = value.match(/([\d,.]+)\s+comments?/i);
  const views = value.match(/([\d,.]+)\s+views?/i);
  const plays = value.match(/([\d,.]+)\s+plays?/i);
  if (likes) metrics.likes = Number(String(likes[1]).replace(/,/g, "")) || 0;
  if (comments) metrics.comments = Number(String(comments[1]).replace(/,/g, "")) || 0;
  if (views) metrics.views = Number(String(views[1]).replace(/,/g, "")) || 0;
  if (plays) metrics.plays = Number(String(plays[1]).replace(/,/g, "")) || 0;
  if (!likes && !comments && !views && !plays) return null;
  return metrics;
}

function adjustEngagementBodyMetrics(body, actionId) {
  const html = String(body || "");
  const match = html.match(/<p class="instagram-meta-metrics">([\s\S]*?)<\/p>/i);
  if (!match) return body;

  const inner = String(match[1] || "").replace(/<\/?small>/gi, "");
  const metrics = parseMetricsFromText(htmlDecode(inner));
  if (!metrics) return body;

  if (actionId === "like") metrics.likes += 1;
  else if (actionId === "unlike") metrics.likes = Math.max(0, metrics.likes - 1);
  else return body;

  const nextText = metricsTextFromCounts(metrics);
  if (!nextText) return html.replace(match[0], "");
  return html.replace(match[0], metricsMetaHtml(nextText));
}

function postFallbackAttachments(post) {
  const attachments = [];
  if ((!showMedia() || postMediaEntries(post).length === 0 || typeof MediaAttachment === "undefined") && typeof LinkAttachment !== "undefined") {
    const link = LinkAttachment.createWithUrl(post.url);
    link.type = "website";
    link.title = post.authorUsername ? `Instagram post by @${post.authorUsername}` : "Instagram post";
    link.siteName = "Instagram";
    attachments.push(link);
  }

  return attachments;
}

function postMediaAttachments(post) {
  const media = postMediaEntries(post);
  if (media.length === 0 || typeof MediaAttachment === "undefined") return [];

  return media.map(entry => {
    const attachment = MediaAttachment.createWithUrl(entry.url);
    if (entry.thumbnail) attachment.thumbnail = entry.thumbnail;
    if (entry.mimeType) attachment.mimeType = entry.mimeType;
    if (entry.altText) attachment.text = entry.altText;
    if (entry.width > 0 && entry.height > 0) {
      attachment.aspectSize = { width: entry.width, height: entry.height };
    }
    return attachment;
  });
}

function postVisualHtml(post) {
  const media = postMediaEntries(post);
  if (media.length === 0) return "";

  const first = media[0];

  // Loom's timeline preview only understands a small HTML subset. Keep the
  // first image/video inside a paragraph so it remains visible in the card.
  let html = `<p class="instagram-visual">${mediaElementHtml(first, true)}</p>`;
  if (media.length > 1) {
    const thumbnails = media.slice(1, 7).map(entry => mediaThumbHtml(entry)).join("");
    if (thumbnails) {
      html += `<p class="instagram-carousel-strip">${thumbnails}</p>`;
    }
  }
  return html;
}

function postMediaEntries(post) {
  if (!showMedia() || !post || !Array.isArray(post.attachments)) return [];
  return post.attachments.filter(media => media && isMediaUrl(media.url));
}

function mediaElementHtml(media, primary) {
  const label = escapeAttribute(media.altText || "Instagram media");
  const style = primary
    ? "display:block;width:100%;height:auto;max-height:640px;object-fit:contain;background:#000;"
    : "display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#000;border-radius:4px;";
  if (/^video/i.test(media.mimeType || "")) {
    const poster = media.thumbnail ? ` poster="${escapeAttribute(media.thumbnail)}"` : "";
    return `<video controls preload="metadata" src="${escapeAttribute(media.url)}"${poster} aria-label="${label}" style="${style}">${escapeHtml(media.altText || "Instagram video")}</video>`;
  }
  return `<img src="${escapeAttribute(media.url)}" alt="${label}" style="${style}">`;
}

function mediaThumbHtml(media) {
  const thumbnail = media.thumbnail || media.url;
  if (!isMediaUrl(thumbnail)) return "";
  const label = escapeAttribute(media.altText || "Instagram carousel media");
  return `<img src="${escapeAttribute(thumbnail)}" alt="${label}" style="display:inline-block;width:31%;height:auto;max-height:180px;object-fit:cover;margin:0 1% 1% 0;">`;
}

function postActions(post) {
  if (!post || !post.mediaId) return {};
  const value = JSON.stringify({
    mediaId: post.mediaId,
    url: post.url
  });
  const actions = {};

  if (post.liked === true) actions.unlike = value;
  else actions.like = value;

  if (isFavorite(post.mediaId)) actions.unfavorite = value;
  else actions.favorite = value;

  if (post.saved === true) actions.unsave = value;
  else actions.save = value;

  if (post.reposted === true) actions.unrepost = value;
  else actions.repost = value;

  actions.comments = value;
  return actions;
}

async function performMediaAction(actionId, mediaId, credentials) {
  const paths = {
    like: [`/web/likes/${encodeURIComponent(mediaId)}/like/`, `/media/${encodeURIComponent(mediaId)}/like/`],
    unlike: [`/web/likes/${encodeURIComponent(mediaId)}/unlike/`, `/media/${encodeURIComponent(mediaId)}/unlike/`],
    save: [`/web/save/${encodeURIComponent(mediaId)}/save/`, `/media/${encodeURIComponent(mediaId)}/save/`],
    unsave: [`/web/save/${encodeURIComponent(mediaId)}/unsave/`, `/media/${encodeURIComponent(mediaId)}/unsave/`],
    repost: [`/web/media/${encodeURIComponent(mediaId)}/repost/`, `/media/${encodeURIComponent(mediaId)}/repost/`],
    unrepost: [`/web/media/${encodeURIComponent(mediaId)}/unrepost/`, `/media/${encodeURIComponent(mediaId)}/unrepost/`]
  }[actionId];
  if (!paths) throw new Error(`Unsupported Instagram media action: ${actionId}`);

  let lastError = null;
  for (const path of paths) {
    try {
      const headers = webHeaders(credentials, `${instagramBase}/`);
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const parameters = encodeQuery([["_csrftoken", credentials.csrf]]);
      await requestJson(`${apiBase}${path}`, "POST", parameters, headers, actionId);
      return;
    }
    catch (error) {
      lastError = error;
      if (error.instagramStatus !== 404) throw error;
    }
  }
  throw lastError || new Error(`Instagram could not perform ${actionId}.`);
}

function toggleRemoteAction(item, actionId) {
  if (!item) return item;
  const replacements = {
    like: "unlike",
    unlike: "like",
    save: "unsave",
    unsave: "save",
    repost: "unrepost",
    unrepost: "repost"
  };
  const replacement = replacements[actionId];
  if (!replacement) return item;

  const actions = { ...(item.actions || {}) };
  delete actions[actionId];
  actions[replacement] = actionValueForItem(item);
  item.actions = actions;
  if (actionId === "like" || actionId === "unlike") {
    item.body = adjustEngagementBodyMetrics(item.body, actionId);
  }
  return item;
}

function toggleFavorite(item, mediaId, shouldFavorite) {
  const key = String(mediaId || item.uri || "");
  const favorites = readFavoriteIds();
  const index = favorites.indexOf(key);
  if (shouldFavorite && index < 0) favorites.push(key);
  if (!shouldFavorite && index >= 0) favorites.splice(index, 1);
  if (typeof setItem === "function") setItem("instagram.favoriteIds", JSON.stringify(favorites));

  const actions = { ...(item.actions || {}) };
  delete actions.favorite;
  delete actions.unfavorite;
  actions[shouldFavorite ? "unfavorite" : "favorite"] = actionValueForItem(item);
  item.actions = actions;
  return item;
}

function actionValueForItem(item) {
  const actions = item && item.actions ? item.actions : {};
  for (const key of ["like", "unlike", "save", "unsave", "repost", "unrepost", "favorite", "unfavorite", "comments"]) {
    if (actions[key]) return actions[key];
  }
  return JSON.stringify({ url: item && item.uri });
}

function isFavorite(mediaId) {
  return readFavoriteIds().includes(String(mediaId || ""));
}

function readFavoriteIds() {
  if (typeof getItem !== "function") return [];
  const stored = getItem("instagram.favoriteIds");
  if (Array.isArray(stored)) return stored.map(value => String(value));
  if (typeof stored !== "string" || !stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(value => String(value)) : [];
  }
  catch (error) {
    return [];
  }
}

function normalizeComments(comments) {
  const normalized = [];
  for (const comment of comments || []) {
    const item = normalizeComment(comment, false);
    if (item) normalized.push(item);

    const children = Array.isArray(comment && comment.preview_child_comments)
      ? comment.preview_child_comments
      : [];
    for (const child of children) {
      const childItem = normalizeComment(child, true);
      if (childItem) normalized.push(childItem);
    }
  }
  return normalized;
}

function normalizeComment(comment, isReply) {
  if (!comment || typeof comment !== "object") return null;
  const id = stringId(comment.pk || comment.id);
  const user = normalizeProfile(comment.user || {}, null);
  const text = stringValue(comment.text);
  if (!id && !text) return null;

  return {
    id: id || text,
    text,
    date: unixDate(comment.created_at_utc || comment.created_at),
    authorName: user.name || user.username || "Instagram",
    authorUsername: user.username,
    authorAvatar: user.avatar,
    likes: finiteNumber(comment.comment_like_count || comment.like_count),
    isReply
  };
}

function commentsToItems(comments, postUrl) {
  const items = [];
  for (const comment of comments || []) {
    const uri = `${postUrl}#comment-${encodeURIComponent(comment.id)}`;
    const item = Item.createWithUriDate(uri, comment.date || new Date());
    const meta = showMetrics() && comment.likes > 0
      ? metricsMetaHtml(`${formatCount(comment.likes)} likes`)
      : "";
    const body = meta + paragraphsHtml(comment.text);
    if (body) item.body = body;
    item.author = createIdentity(
      comment.authorName || comment.authorUsername || "Instagram",
      comment.authorUsername ? `@${comment.authorUsername}` : null,
      comment.authorAvatar,
      comment.authorUsername ? `${instagramBase}/${comment.authorUsername}/` : instagramBase
    );

    if (comment.isReply) item.annotations = [Annotation.createWithText("Reply")];
    items.push(item);
  }
  return items;
}

function requestJson(url, method, body, headers, action) {
  return requestText(url, method, body, headers, action).then(text => parseJsonResponse(text, action));
}

async function requestText(url, method, body, headers, action) {
  let text;
  try {
    text = await sendRequest(url, method, body, headers, true);
  }
  catch (error) {
    throw normalizedRequestError(error, action);
  }

  const wrapped = statusWrappedResponse(text);
  if (wrapped) {
    if (wrapped.status >= 400) throw statusError(wrapped.status, wrapped.body, wrapped.headers, action);
    return typeof wrapped.body === "string" ? wrapped.body : JSON.stringify(wrapped.body);
  }

  return typeof text === "string" ? text : JSON.stringify(text);
}

function statusWrappedResponse(value) {
  if (value && typeof value === "object" && typeof value.status === "number" && Object.prototype.hasOwnProperty.call(value, "body")) {
    return value;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.status === "number" && Object.prototype.hasOwnProperty.call(parsed, "body")) {
      return parsed;
    }
  }
  catch (error) {
    return null;
  }
  return null;
}

function statusError(status, body, headers, action) {
  let message = `Instagram returned HTTP ${status}.`;
  if (status === 401 || status === 403) {
    message = "Instagram rejected the session cookies. Refresh sessionid and csrftoken from a logged-in instagram.com session.";
  }
  else if (status === 404) {
    message = `Instagram could not find the requested ${action || "feed"}. Check the username, hashtag, or account visibility.`;
  }
  else if (status === 429) {
    const retryAfter = headerValue(headers, "retry-after");
    message = retryAfter
      ? `Instagram rate limit reached. Try again in ${retryAfter} seconds.`
      : "Instagram rate limit reached. Try again later.";
  }

  const detail = responseMessage(body);
  if (detail && status !== 401 && status !== 403) message += ` ${detail}`;

  const error = new Error(message);
  error.instagramStatus = status;
  return error;
}

function normalizedRequestError(error, action) {
  const message = error && error.message ? error.message : String(error);
  if (/\b(401|403)\b/.test(message)) return statusError(401, null, null, action);
  if (/\b404\b/.test(message)) return statusError(404, null, null, action);
  if (/\b429\b/.test(message)) return statusError(429, null, null, action);
  return error instanceof Error ? error : new Error(message);
}

function parseJsonResponse(text, action) {
  let json;
  try {
    json = JSON.parse(String(text || ""));
  }
  catch (error) {
    throw new Error(`Instagram returned a non-JSON response for ${action || "the feed"}. Refresh cookies if this is a login page.`);
  }

  const message = responseMessage(json);
  if (requiresCheckpoint(json, message)) {
    throw new Error("Instagram requires a checkpoint or challenge. Open instagram.com in your browser, complete the prompt, then refresh the cookies.");
  }

  if (json && json.status === "fail") {
    throw new Error(message || `Instagram returned a failed ${action || "feed"} response.`);
  }

  return json;
}

function requiresCheckpoint(json, message) {
  const text = `${message || ""} ${json && json.error_type ? json.error_type : ""}`;
  return /checkpoint|challenge|required login|login_required|consent/i.test(text);
}

function responseMessage(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    }
    catch (error) {
      return normalizedWhitespace(value).slice(0, 180);
    }
  }
  if (!parsed || typeof parsed !== "object") return "";
  const raw = parsed.message || parsed.error || parsed.error_message || parsed.feedback_message;
  return raw ? normalizedWhitespace(String(raw)) : "";
}

function isFallbackProfileError(error) {
  const status = error && error.instagramStatus;
  const message = error && error.message ? error.message : "";
  return status === 400 || status === 404 || /unexpected|non-JSON|could not find|rejected/i.test(message);
}

function webHeaders(credentials, referer) {
  return {
    "User-Agent": browserUserAgent,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "X-CSRFToken": credentials.csrf,
    "X-IG-App-ID": normalizedIgAppId(),
    "X-ASBD-ID": "129477",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": instagramBase,
    "Referer": referer || instagramBase,
    "Cookie": credentials.cookie
  };
}

function normalizedCredentials() {
  const parsedCookie = parseCookieHeader(stringInput("cookie_header"));
  const sessionId = stringInput("sessionid").trim() || parsedCookie.sessionid;
  const csrf = stringInput("csrftoken").trim() || parsedCookie.csrftoken;
  const userId = stringInput("ds_user_id").trim() || parsedCookie.ds_user_id || "";
  if (!sessionId || !csrf) {
    throw new Error("Enter sessionid and csrftoken, or paste a full Cookie header containing both values.");
  }

  return {
    sessionId,
    csrf,
    userId,
    cookie: completeCookieHeader(stringInput("cookie_header"), sessionId, csrf, userId)
  };
}

function parseCookieHeader(value) {
  const cookies = {};
  const header = String(value || "").replace(/^cookie:\s*/i, "");
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const val = part.slice(index + 1).trim();
    if (key) cookies[key] = val;
  }
  return cookies;
}

function completeCookieHeader(header, sessionId, csrf, userId) {
  const trimmed = String(header || "").replace(/^cookie:\s*/i, "").trim();
  const cookies = parseCookieHeader(trimmed);
  const parts = trimmed ? trimmed.split(";").map(part => part.trim()).filter(Boolean) : [];
  if (!cookies.sessionid) parts.push(`sessionid=${sessionId}`);
  if (!cookies.csrftoken) parts.push(`csrftoken=${csrf}`);
  if (userId && !cookies.ds_user_id) parts.push(`ds_user_id=${userId}`);
  return parts.join("; ");
}

function nextCursorFromResponse(json) {
  return stringValue(
    json && (
      json.next_max_id
      || json.next_max_id_str
      || json.next_min_id
      || json.pagination_token
      || json.next_page_token
    )
  ) || null;
}

function graphqlPageCursor(connection) {
  const pageInfo = connection && connection.page_info ? connection.page_info : {};
  return pageInfo.has_next_page && pageInfo.end_cursor ? String(pageInfo.end_cursor) : null;
}

function captionText(caption) {
  if (!caption) return "";
  if (typeof caption === "string") return caption;
  return stringValue(caption.text || caption.caption || caption.content);
}

function graphqlCaptionText(node) {
  const connection = node && node.edge_media_to_caption;
  const edges = connection && Array.isArray(connection.edges) ? connection.edges : [];
  const first = edges.length > 0 ? edges[0] : null;
  return stringValue(first && first.node && first.node.text);
}

function mediaTypeLabel(media) {
  if (isReel(media)) return "Reel";
  if (Number(media.media_type) === 8 || Array.isArray(media.carousel_media)) return "Carousel";
  if (Number(media.media_type) === 2 || Array.isArray(media.video_versions)) return "Video";
  return "Photo";
}

function graphqlTypeLabel(node) {
  if (node && node.__typename === "GraphSidecar") return "Carousel";
  if (node && (node.is_video || node.__typename === "GraphVideo")) return "Video";
  return "Photo";
}

function isReel(media) {
  const productType = stringValue(media && media.product_type).toLowerCase();
  return /clips|reel/.test(productType) || Boolean(media && media.clips_metadata);
}

function mediaContentWarning(media) {
  if (!media) return null;
  if (media.is_sensitive_media === true || media.sensitive_media === true || media.is_sensitive === true) {
    return "Sensitive content";
  }
  const sensitivity = media.sensitivity_friction_info || media.sensitive_content_info || {};
  if (sensitivity.should_have_sensitivity_friction === true || sensitivity.is_sensitive === true) {
    return "Sensitive content";
  }
  return null;
}

function normalizeLocation(location) {
  if (!location) return "";
  return stringValue(location.name || location.short_name || location.city || location.address);
}

function instagramPostUrl(code, media) {
  if (!code) return instagramBase;
  const path = isReel(media) ? "reel" : "p";
  return `${instagramBase}/${path}/${code}/`;
}

function cleanShortcode(value) {
  const text = stringValue(value).trim();
  return /^[A-Za-z0-9_-]+$/.test(text) ? text : "";
}

function bestImageUrl(entry) {
  const candidates = entry && entry.image_versions2 && Array.isArray(entry.image_versions2.candidates)
    ? entry.image_versions2.candidates
    : [];
  if (candidates.length > 0) return firstUrl(largestCandidate(candidates).url);
  return firstUrl(
    entry && (
      entry.thumbnail_url
      || entry.display_url
      || entry.image_url
      || entry.url
    )
  );
}

function bestVideoUrl(entry) {
  const candidates = entry && Array.isArray(entry.video_versions) ? entry.video_versions : [];
  if (candidates.length === 0) return firstUrl(entry && entry.video_url);
  return firstUrl(largestCandidate(candidates).url);
}

function largestThumbnail(thumbnails) {
  return largestCandidate(thumbnails).src || largestCandidate(thumbnails).url;
}

function largestCandidate(candidates) {
  const filtered = (candidates || []).filter(candidate => candidate && (candidate.url || candidate.src));
  if (filtered.length === 0) return {};
  return filtered.sort((left, right) => (
    finiteNumber(right.width) * finiteNumber(right.height)
    - finiteNumber(left.width) * finiteNumber(left.height)
  ))[0] || {};
}

function mediaSize(entry, isVideo) {
  let candidate = null;
  if (isVideo && Array.isArray(entry && entry.video_versions) && entry.video_versions.length > 0) {
    candidate = largestCandidate(entry.video_versions);
  }
  if ((!candidate || !candidate.width || !candidate.height) && Array.isArray(entry && entry.image_versions2 && entry.image_versions2.candidates)) {
    candidate = largestCandidate(entry.image_versions2.candidates);
  }

  return {
    width: finiteNumber((candidate && candidate.width) || (entry && (entry.original_width || entry.width))),
    height: finiteNumber((candidate && candidate.height) || (entry && (entry.original_height || entry.height)))
  };
}

function mediaMimeType(url, isVideo) {
  if (isVideo) return "video/mp4";
  if (/^data:image\/([a-z0-9.+-]+)/i.test(url || "")) {
    const match = String(url).match(/^data:image\/([a-z0-9.+-]+)/i);
    return `image/${match[1].toLowerCase()}`;
  }
  const format = mediaFormat(url);
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "png" || format === "gif" || format === "webp") return `image/${format}`;
  return "image";
}

function mediaFormat(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    const match = path.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : null;
  }
  catch (error) {
    return null;
  }
}

function firstUrl(value) {
  const text = stringValue(value).trim();
  return isMediaUrl(text) || isWebUrl(text) ? text : "";
}

function isMediaUrl(value) {
  return isWebUrl(value) || /^data:(image|video|audio)\//i.test(String(value || ""));
}

function isWebUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function includePost(post) {
  if (!includeReels() && post && post.typeLabel === "Reel") return false;
  return true;
}

function normalizedSourceMode() {
  const value = normalizedChoice(stringInput("source_mode"));
  if (value === "hashtag") return "hashtag";
  if (value === "home" || value === "for you" || value === "for_you" || value === "foryou") return "for_you";
  if (value === "following") return "following";
  if (value === "favorites" || value === "favourites") return "favorites";
  return "profiles";
}

function normalizedHomeVariant(mode) {
  if (mode === "following") return "following";
  if (mode === "favorites") return "favorites";
  return "";
}

function normalizedProfiles() {
  return stringInput("instagram_sources")
    .split(/[,\s]+/)
    .map(cleanUsername)
    .filter(Boolean)
    .slice(0, maximumSources);
}

function normalizedHashtags() {
  return stringInput("instagram_sources")
    .split(/[,\s]+/)
    .map(cleanHashtag)
    .filter(Boolean)
    .slice(0, maximumSources);
}

function cleanUsername(value) {
  if (!value) return "";
  let username = String(value).trim();
  username = username.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "");
  username = username.replace(/^@/, "");
  username = username.split(/[/?#]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(username) ? username : "";
}

function cleanHashtag(value) {
  if (!value) return "";
  let tag = String(value).trim();
  tag = tag.replace(/^https?:\/\/(?:www\.)?instagram\.com\/explore\/tags\//i, "");
  tag = tag.replace(/^#/, "");
  tag = tag.split(/[/?#]/)[0];
  return /^[A-Za-z0-9_]{1,80}$/.test(tag) ? tag : "";
}

function sourceLabel() {
  const mode = normalizedSourceMode();
  if (mode === "for_you") return "For You";
  if (mode === "following") return "Following";
  if (mode === "favorites") return "Favorites";
  if (mode === "hashtag") {
    const tags = normalizedHashtags();
    if (tags.length === 0) return "Hashtag";
    if (tags.length <= 2) return tags.map(tag => `#${tag}`).join(", ");
    return `#${tags[0]} + ${tags.length - 1}`;
  }

  const profiles = normalizedProfiles();
  if (profiles.length === 0) return "Profiles";
  if (profiles.length <= 2) return profiles.map(profile => `@${profile}`).join(", ");
  return `@${profiles[0]} + ${profiles.length - 1}`;
}

function normalizedBatchSize() {
  const value = parseInt(stringInput("batch_size"), 10);
  return [12, 24, 48].includes(value) ? value : 24;
}

function normalizedIgAppId() {
  return stringInput("ig_app_id").trim() || defaultIgAppId;
}

function includeReels() {
  return normalizedChoice(stringInput("include_reels")) !== "off";
}

function showMetrics() {
  return normalizedChoice(stringInput("show_metrics")) !== "off";
}

function showMedia() {
  return normalizedChoice(stringInput("show_media")) !== "off";
}

function showLocation() {
  return normalizedChoice(stringInput("show_location")) !== "off";
}

function normalizedChoice(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function stringInput(name) {
  if (typeof globalThis !== "undefined" && typeof globalThis[name] === "string") {
    return globalThis[name];
  }
  return "";
}

function rankToken(credentials) {
  const user = credentials && credentials.userId ? credentials.userId : "0";
  return `${user}_${Date.now()}`;
}

function parseActionValue(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  catch (error) {
    return {};
  }
}

function paragraphsHtml(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  const paragraphs = value
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${linkifiedText(part).replace(/\n/g, "<br>")}</p>`);
  return paragraphs.join("");
}

function captionHtml(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  const paragraphs = value
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p class="instagram-caption"><small>${linkifiedText(part).replace(/\n/g, "<br>")}</small></p>`);
  return paragraphs.join("");
}

function linkifiedText(text) {
  let escaped = escapeHtml(String(text || ""));
  escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
    const clean = match.replace(/[.,;:!?)]$/, "");
    const suffix = match.slice(clean.length);
    return `<a href="${clean}">${clean}</a>${suffix}`;
  });
  escaped = escaped.replace(/(^|[\s(])@([A-Za-z0-9._]{1,30})/g, (match, prefix, username) => (
    `${prefix}<a href="${instagramBase}/${username}/">@${username}</a>`
  ));
  escaped = escaped.replace(/(^|[\s(])#([A-Za-z0-9_]{1,80})/g, (match, prefix, tag) => (
    `${prefix}<a href="${instagramBase}/explore/tags/${tag}/">#${tag}</a>`
  ));
  return escaped;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function normalizedWhitespace(value) {
  return htmlDecode(String(value || "").replace(/\s+/g, " ").trim());
}

function createIdentity(name, username, avatar, uri) {
  const identity = Identity.createWithName(name || "Instagram");
  if (username) identity.username = username;
  if (uri) identity.uri = uri;
  // Profile picture on the author row (not the feed/service icon).
  if (avatar != null) identity.avatar = avatar;
  return identity;
}

function formatCount(value) {
  const number = finiteNumber(value);
  if (number < 1000) return String(number);
  return number.toLocaleString("en-US");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function booleanValue(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

function stringId(value) {
  if (value == null) return "";
  const text = String(value);
  return text ? text : "";
}

function stringValue(value) {
  if (value == null) return "";
  return String(value);
}

function compareIds(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) return 0;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    return a > b ? 1 : -1;
  }
  return a > b ? 1 : -1;
}

function unixDate(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    const milliseconds = number > 1000000000000 ? number : number * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : new Date();
}

function sortPostsNewestFirst(posts) {
  return posts.slice().sort((left, right) => {
    const time = (right.date ? right.date.getTime() : 0) - (left.date ? left.date.getTime() : 0);
    if (time !== 0) return time;
    return compareIds(right.id, left.id);
  });
}

function dedupePosts(posts) {
  return dedupeBy(posts, post => post && (post.id || post.url));
}

function dedupeBy(items, keyForItem) {
  const seen = {};
  const result = [];
  for (const item of items || []) {
    const key = keyForItem(item);
    if (!key || seen[key]) continue;
    seen[key] = true;
    result.push(item);
  }
  return result;
}

function encodeQuery(parameters) {
  return parameters
    .filter(pair => pair && pair[1] != null)
    .map(pair => `${encodeURIComponent(pair[0])}=${encodeURIComponent(String(pair[1]))}`)
    .join("&");
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return null;
  const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : null;
}
