---
aliases:
  - TFM
  - Telegram-flavored Markdown
---
# Telegram-flavored Markdown

Telegram-flavored Markdown (TFM) represents **content** of a Telegram message.

Basic formatting features are mapped to corresponding text entities: **bold**, _italic_, `monospace`, ~~strikethrough~~, [link](http://example.com).

## Media

TFM-formatted message MAY include up to 10 consecutive media items using HTML-like (media) tags:
- `<photo/>` for photos
- `<video/>` for videos
- `<audio/>` for audio files
- `<document/>` for general files

Rules:
- All media tags MUST have `src` attribute with source file URL.
- `<video/>` MAY have optional `start` attribute to specify video start timestamp in seconds.
- `<audio/>` MAY have optional `title` and `performer` attributes to be shown in music player.
- All media tags MUST be either leading (go before content) or trailing (go after content). Position of media items only affects caption position for photos and videos.
- Photos and videos MAY be mixed together, audios and documents MUST NOT.
