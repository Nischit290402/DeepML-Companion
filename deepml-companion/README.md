# Deep-ML Roaming Companion

A Chrome extension that turns Deep-ML's study assistant into a small, draggable helper that sits next to your code.

## Install (once)

1. Clone this repo, or unzip the extension somewhere permanent. Chrome loads it from that folder, so don't delete or move it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `deepml-companion` folder (the one with `manifest.json` in it).
5. Open any Deep-ML problem. The bot is in its usual corner. Drag it.

## Update to a new release

`git pull` (or replace the files), click the circular reload icon on the extension's card in `chrome://extensions`, then refresh the Deep-ML tab.

## What it does (v0.2.0)

| Action | How |
| --- | --- |
| Move the bot | Drag it. Drop within ~90px of the editor's right edge and it snaps there. Position is remembered. |
| Open / focus the chat | Click the bot, or press Alt+K (Option+K on Mac). |
| Close the chat | Click the bot again. It stays visible while the chat is open. |
| Move the open chat | Drag its "STUDY @ DEEP-ML" header. The bot follows on its right side. |
| Compact chat | Opens as a 360px popover beside the bot instead of the big corner window. |
| Give it your code | Click **Attach code** above the popover. It pastes your code with line numbers, your cursor line and any selection. |
| Line marks | When an answer says "line 7" or "lines 5-8", those lines get an orange mark in the editor. Typing clears them. Toggle with **Mark lines**. |

## Known limits

- Line marks only appear when the answer writes "line N". Attach code asks it to.
- The chat's own resize handles are overridden by the compact size.
- If Deep-ML renames the assistant's `aria-label`s, update the selectors at the top of `content.js`.

## Roadmap

No API keys. Deep-ML's own assistant is the brain on Deep-ML; Chrome's on-device Gemini Nano covers LeetCode and instant answers.

| Release | Feature | Needs from you |
| --- | --- | --- |
| R1 v0.1 | Move bot, compact popover, Attach code, line marks, Alt+K | Done |
| R2 v0.2 | Bot stays visible while the chat is open; drag the chat by its header | Done |
| R3 v0.3 | Attach code also asks for a hidden one-line footer listing the lines to mark, so marks no longer depend on wording | Nothing |
| R4 v0.4 | Intent chips above the chat (Find my bug, Check approach, Syntax, Next step, Interview style, Concept) with a Hint / Full toggle | Nothing |
| R5 v0.5 | Put a comment from the answer into your code, Keep / Undo | Nothing |
| R6 v0.6 | Interview-style rewrite as an inline diff, Apply or keep yours | Nothing |
| R7 v0.7 | On-device Gemini Nano for instant syntax answers, no network | Let Chrome download the model once |
| R8 v0.8 | Same companion on LeetCode, powered by Gemini Nano | Nothing |
