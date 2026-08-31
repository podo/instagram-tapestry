# Instagram for Tapestry

This connector shows Instagram posts in Tapestry using your own logged-in
`instagram.com` browser session. It does not ask for your password and does not
use a Meta developer app.

## Setup

1. Run `node scripts/instagram-cookie-helper.mjs` from the repository root, log
   in to Instagram in the temporary browser window, then press Enter in the
   terminal. The helper copies a minimal `sessionid=...; csrftoken=...;
   ds_user_id=...` cookie header to the clipboard without printing the secret
   values.
2. If you prefer to do it manually, open `instagram.com` in a browser where you
   are logged in, inspect a request to `www.instagram.com/api/v1/...`, and copy
   either the full `Cookie` request header or the individual `sessionid`,
   `csrftoken`, and `ds_user_id` cookie values.
3. Create a Tapestry feed with this connector. Feed Finder can prefill a value
   from `@username`, `#hashtag`, Instagram profile URLs, hashtag URLs, and post
   URLs.
4. Paste the full cookie header into **Cookie Header**, or paste the individual
   values into **sessionid Cookie**, **csrftoken Cookie**, and optionally
   **ds_user_id Cookie**.
5. Set **Source Mode** to **Profiles**, **Hashtag**, **For You**,
   **Following**, or **Favorites**.

The cookies are entered during feed setup and are not included in the connector
bundle. Treat them like passwords. Do not commit them, paste them into issues,
or include them in screenshots.

## Features

- No Meta developer account or API key
- Profile feeds using Instagram web-session endpoints
- Hashtag feeds from the web-session tag responses when Instagram returns them
- For You, Following, and Favorites feed attempts using the logged-in session
- Native post-style Tapestry items with author identity and avatar
- Native photo, video, Reel, and carousel attachments in source order
- Captions kept as a smaller text block after the media surface in Tapestry
- Smaller caption rendering with linked `@mentions`, `#hashtags`, and URLs
- Optional metrics for likes, comments, views, and plays
- Optional location and metrics as body meta under Author (not annotations)
- Like, Favorite, Save, and Repost actions with stateful remove actions
- Comments context action for expanding visible comments inside Tapestry
- Current-batch refresh with bounded pagination per profile, hashtag, or home feed
- Feed Finder support for common Instagram inputs

## Reliability Notes

This connector uses Instagram's private web-session endpoints. Instagram can
change response shapes, require a checkpoint, expire cookies, rate-limit the
account, or block automated requests. If the feed stops loading, refresh the
cookies by logging in again through the helper or your browser.

Like, Favorite, Save, and Repost actions use the same logged-in session and
change your Instagram account when selected. The connector does not publish
new posts, send messages, follow accounts, or fetch private data outside what
your logged-in web session can already read.

Profile feeds try the feed-by-username endpoint first because username-to-ID
profile lookup is often more brittle. The connector still includes fallbacks for
other response shapes, but private Instagram web endpoints are not stable
contracts.

Tapestry displays native media attachments in the item preview and detail view,
and shows only the first four timeline thumbnails. This connector supplies
photos, videos, Reels, and carousel entries as native attachments in their
Instagram order. It uses preview-safe inline HTML only as a fallback for
older or incomplete runtimes. Normal posts are not marked with a content
warning unless Instagram returns an explicit sensitive media flag.

## Development and Tests

Open the directory containing `local.instagram.timeline` as the Connectors Folder
in Tapestry Loom. Use Loom with your own cookies for live verification.

Run the mocked tests and build the installable connector with:

```sh
node tests/plugin.test.js
bash scripts/build.sh
```
