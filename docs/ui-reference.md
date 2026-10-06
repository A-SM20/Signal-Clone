# UI reference — Signal Desktop & Signal Android

Values measured by eye from official Signal marketing screenshots (no Signal source, CSS, or assets were used):

- Desktop (light): https://signal.org/assets/images/screenshots/download-desktop-windows.png
- Desktop (macOS): https://signal.org/assets/images/screenshots/download-desktop-mac.png
- Android (dark) + iOS: https://signal.org/assets/images/screenshots/download-mobile.png
- Page: https://signal.org/download/

## Desktop layout (≥ 1024 px)

| Region | Observation | Our value |
|---|---|---|
| Nav rail | Light-grey column; hamburger at top, then Chats / Calls / Stories icons; active icon on a rounded grey pill; red count badges top-right of icons | 64 px wide, pill 40×36 r=12, badge red 16 px |
| Chat list header | "Chats" bold ~20 px; compose (pencil-square) and ⋯ icons right | 52 px tall, 20 px/700 |
| Search | Rounded grey field with magnifier; filter icon outside to the right | 32 px tall, r=8, `--surface-2` |
| Rows | 48 px round avatar, name 14 px/600, preview 13 px secondary (max 2 lines), time 12 px secondary top-right, blue unread badge bottom-right | 72 px row, 12 px padding |
| Selected row | Rounded grey rectangle inset from list edges | r=12, inset 8 px, `--selected` |
| Chat header | Avatar 32 px, name 14 px/600, right icons: video, search, ⋯ | 52 px tall, bottom divider |
| Chat background | White (light) | `--bg` |
| Outgoing bubble | Ultramarine blue, white text, time + ticks inside bottom-right | `#2C6BED`, r=18 |
| Incoming bubble | Light grey, dark text; in groups sender name in bold colour above text, 28 px avatar to the left of the cluster's last bubble | `#E9E9E9`, r=18 |
| Grouped bubbles | Corners on the sender side tighten between consecutive bubbles | 4 px inner corners |
| Reactions | Small rounded pill overlapping the bubble's bottom edge with emoji + count | 22 px tall |
| Timestamps | "25m", "18m", "5m" relative inside the bubble footer | 11 px |

## Android layout (< 768 px, dark shown)

| Region | Observation | Our value |
|---|---|---|
| Top bar | Back arrow, 32 px avatar, name, timer chip "1d" when disappearing is on | 56 px |
| Background | Near-black | `#121212` |
| Incoming bubble | Dark grey | `#3B3B3B` |
| Outgoing bubble | Ultramarine | `#2C6BED` |
| System notices | Centred, small secondary text with a leading icon ("… set the disappearing message timer to 1 day.") | 12 px, `--text-secondary` |
| Bottom tabs (list screen) | Chats / Calls / Stories with filled-pill active indicator | 64 px |

## Tokens (see `frontend/src/styles/tokens.css`)

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#FFFFFF` | `#121212` |
| `--surface` (list, rail) | `#F6F6F6` | `#1B1B1B` |
| `--surface-2` (search, inputs) | `#E9E9E9` | `#2E2E2E` |
| `--surface-hover` | `#EBEBEB` | `#262626` |
| `--selected` | `#DEDEDE` | `#3B3B3B` |
| `--text` | `#1B1B1B` | `#E9E9E9` |
| `--text-secondary` | `#5E5E5E` | `#B9B9B9` |
| `--text-tertiary` | `#848484` | `#848484` |
| `--primary` | `#2C6BED` | `#2C6BED` |
| `--bubble-out-bg` | chat colour (default `#2C6BED`) | same |
| `--bubble-in-bg` | `#E9E9E9` | `#3B3B3B` |
| `--divider` | `#DEDEDE` | `#2E2E2E` |
| `--danger` | `#E5484D` | `#F2555A` |
| Bubble radius | 18 px, grouped corners 4 px | |
| Avatars | 28 / 36 / 48 / 80 px | |
| Type | Inter; body 14 px, caption 12 px, title 20 px | |

Chat colours offered in Appearance: Ultramarine `#2C6BED`, Crimson `#CF163E`, Vermilion `#C73F0A`, Burlap `#6F6A58`, Forest `#3B7845`, Wintergreen `#1D8663`, Teal `#077D92`, Blue `#336BA3`, Indigo `#6058CA`, Violet `#9932C8`, Plum `#AA377A`, Taupe `#8F616A`, Steel `#71717F`.
