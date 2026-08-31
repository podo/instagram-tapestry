# Instagram Tapestry Item Design

This connector uses the Instagram post as the unit of information. Card chrome
follows the X/Threads Loom pattern: Service · feed type, then Author, then body
meta under Author (location and metrics), then caption, media, and actions.

## Item information architecture

1. Service · feed type: verify `displayName` such as `Instagram · For You`,
   `Instagram · Following`, `Instagram · #tag`, or `Instagram · @user`.
2. Author identity: profile avatar (profile picture), display name, `@username`,
   and Instagram profile link.
3. Location (optional, `show_location`): `Location: …` as body meta under Author.
4. Metrics (optional, `show_metrics`): likes, comments, views, and plays as body
   meta under Author, below location, in `<small>`.
5. Caption: linked mentions, hashtags, and URLs.
6. Primary visual: native `MediaAttachment` objects (photo, carousel slides, or
   video/Reel). Preview-safe HTML media is only a fallback when native
   attachments are unavailable. Loom places native attachments under the HTML
   body.
7. Actions: Like, Favorite, Save, Repost, and Comments. Stateful actions expose
   their matching remove action after completion. Like/unlike bumps the body
   metrics line.

Post type labels (`Photo` / `Video` / `Carousel` / `Reel`) are not shown on the
card. Native annotations stay empty for feed posts so nothing sits above Service.

## Variants and states

- Photos, videos, Reels, and carousels use native media attachments.
- Posts without media retain the caption and a link attachment.
- Content is only marked sensitive when Instagram explicitly reports a
  sensitivity flag.
- For You, Following, Favorites, Profiles, and Hashtag are separate source
  modes. Each refresh loads the current requested batch and paginates until the
  batch is filled or Instagram stops returning a cursor.
- Comments keep a `Reply` annotation when nested; comment likes live in body
  meta when metrics are enabled.

## Loom done checklist

- Selected card reads: Service · feed → Author (profile pic) → location →
  metrics → caption → media → actions.
- `show_location` and `show_metrics` independently hide those body meta lines.
- At least the configured batch size is returned when Instagram has enough
  items.
- Like, Favorite, Save, Repost, and Comments are present and testable without
  exposing cookie values.
- Carousel and video posts remain understandable when their secondary media is
  unavailable.
- The same hierarchy remains usable at desktop and mobile widths.
