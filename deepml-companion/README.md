# Deep-ML Roaming Companion

A Chrome extension that turns Deep-ML's study assistant into a small, draggable helper that sits next to your code.

## Install (once)

1. Unzip this folder somewhere permanent, for example `Documents/deepml-companion`. Chrome loads it from there, so don't delete or move it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `deepml-companion` folder (the one with `manifest.json` in it).
5. Open any Deep-ML problem. The bot is in its usual corner. Drag it.

## Update to a new release

Replace the files in the same folder (or let Claude write them there), then click the circular reload icon on the extension's card in `chrome://extensions` and refresh the Deep-ML tab.

## Release 1 (v0.1.0): what it does

| Action | How |
| --- | --- |
| Move the bot | Drag it. Drop within ~90px of the editor's right edge and it snaps there. Position is remembered. |
| Open / focus the chat | Click the bot, or press Alt+K (Option+K on Mac). |
| Compact chat | Opens as a 360px popover beside the bot instead of the big corner window. |
| Give it your code | Click **Attach code** above the popover. It pastes your code with line numbers, your cursor line and any selection. |
| Line marks | When an answer says "line 7" or "lines 5-8", those lines get an orange mark in the editor. Typing clears them. Toggle with **Mark lines**. |

## Known limits

- Deep-ML hides the bot while its chat is open, so you move it when the chat is closed.
- Line marks only appear when the answer writes "line N". Attach code asks it to.
- The chat's own resize handles are overridden by the compact size.
- If Deep-ML renames the assistant's `aria-label`, update the two selectors at the top of `content.js`.

## Roadmap

| Release | Feature | Needs from you |
| --- | --- | --- |
| R1 v0.1 | Move bot, compact popover, Attach code, line marks, Alt+K | Install |
| R2 v0.2 | Drag the open popover by its header; bot stays visible while open | Nothing |
| R3 v0.3 | Own popover with intent chips (Find my bug, Check approach, Syntax, Next step, Interview style, Concept) and a Hint / Full toggle, answered by your own model | An API key, typed into the extension's options page |
| R4 v0.4 | Structured answers: exact line marks and the small answer card | Nothing |
| R5 v0.5 | Write a comment into the code with Keep / Undo | Nothing |
| R6 v0.6 | Interview-style rewrite as an inline diff, Apply or keep yours | Nothing |
| R7 v0.7 | Same companion on LeetCode | Nothing |
