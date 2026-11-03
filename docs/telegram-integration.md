# Telegram integration

Pix interacts with Telegram through the HTTP Bot API, not MTProto. Deterministic code handles all incoming updates and outgoing API calls, rather than giving the agent direct access to the API.

This allows Pix to:

- Derive chat history from stored updates and API calls.
- Expose only a safe subset of operations to the agent.
- Implement custom workflows that react to events and call API methods.

## Message representation

Messages presented to the agent combine YAML frontmatter for metadata with a [[telegram-flavored-markdown]] body:

```md
---
id: 1234
date: 2026-11-22T14:32:02Z
from:
  id: 12312421
  firstName: Vladislav
reply:
  id: 1233
  quote: |
    Quoted part including **formatted text**!
---
<photo src="tg-file://nM8Dx9JY"/>
<photo src="tg-file://498f98j3"/>
<photo src="tg-file://90FDSjfd"/>
Check out **this** cat!
```

The frontmatter identifies the message, its sender, and any reply context. See [[telegram-flavored-markdown]] for content formatting and media rules, and [[tg-file-urls]] for Telegram file references.

## Sending messages

The agent sends messages using the `tg.send` tool:

| Parameter  | Optionality | Description                                                  |
| ---------- | ----------- | ------------------------------------------------------------ |
| `content`  | Required    | Message content in [[telegram-flavored-markdown]].           |
| `silently` | Optional    | Whether to send message without notification.                |
| `spoiler`  | Optional    | Whether to cover photos and videos with a spoiler animation. |
| `replyTo`  | Optional    | ID of the message being replied to.                          |

All messages are sent to the primary user; the tool has no recipient selector.

The tool parses the content and selects the appropriate Bot API method automatically.
