# Instagram Tapestry Item Design

This connector uses the Instagram post as the unit of information. The timeline
card follows Instagram's visual reading order while preserving Tapestry's native
identity, annotations, and action model.

## Item information architecture

1. Author identity: profile avatar, display name, `@username`, and Instagram
   profile link.
2. Primary visual: the first photo, carousel slide, or video/Reel poster. The
   visual must be at the start of `item.body` using Tapestry preview-safe
   `<p>`/`<img>` HTML.
3. Carousel context: additional slide thumbnails and a `Carousel - 1 / N`
   label when applicable.
4. Caption: smaller text after the visual, with linked mentions, hashtags, and
   URLs.
5. Metadata: media type, location, likes, comments, views, and plays as
   Tapestry annotations.
6. Actions: Like, Favorite, Save, Repost, and Comments. Stateful actions expose
   their matching remove action after completion.

## Variants and states

- Photos show the primary image before the caption.
- Videos and Reels show their video element or poster before the caption.
- Carousels show the first slide first, then a compact slide strip and count.
- Posts without media retain the caption and a link attachment.
- Content is only marked sensitive when Instagram explicitly reports a
  sensitivity flag.
- For You, Following, Favorites, Profiles, and Hashtag are separate source
  modes. Each refresh loads the current requested batch and paginates until the
  batch is filled or Instagram stops returning a cursor.

## Loom done checklist

- The selected item card visibly starts with media, followed by smaller caption
  text and then metadata.
- At least the configured batch size is returned when Instagram has enough
  items.
- Like, Favorite, Save, Repost, and Comments are present and testable without
  exposing cookie values.
- Carousel and video posts remain understandable when their secondary media is
  unavailable.
- The same hierarchy remains usable at desktop and mobile widths.
