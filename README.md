# Instagram for Tapestry

A personal, read-only Tapestry connector for Instagram posts using your own
logged-in `instagram.com` browser session cookies.

This connector does not use a Meta developer app, Facebook Login, OAuth app, or
paid API tier. It uses the same kind of private web-session approach as the X
connector in this workspace, so it is intentionally read-only and best suited
for personal use.

Download or build `InstagramTapestry.tapestry`, install it in Tapestry, and
configure a feed with profile usernames, hashtags, or your home feed. It renders
photos, carousels, videos, Reels, captions, author avatars, locations, counts,
and a context action for comments.

For easier setup, run `node scripts/instagram-cookie-helper.mjs` from the
repository root. It opens a temporary browser login session and copies the
minimal Instagram cookie header needed by the connector.

See [local.instagram.timeline/README.md](local.instagram.timeline/README.md) for
setup, security notes, and development instructions.
