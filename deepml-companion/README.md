# Deep-ML Roaming Companion

A Chrome extension that puts a draggable bot on Deep-ML. Click it, ask about your code in a small box, and Deep-ML's own assistant answers. No API keys.

## Install (once)

1. Clone this repo. Chrome loads the extension from that folder, so don't delete or move it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `deepml-companion` folder (the one with `manifest.json` in it).
5. Open any Deep-ML problem and click the bot.

## Update to a new release

`git pull`, click the circular reload icon on the extension's card in `chrome://extensions`, then refresh the Deep-ML tab.

## How to use (v0.3.0)

| Do this | What happens |
| --- | --- |
| Click the bot, or press Alt+K (Option+K on Mac) | A small box opens next to it. |
| Type a question and press Enter | Your code goes along automatically, numbered as in your editor. The answer appears in the box. |
| Select lines first | The box shows "Lines 7-11 selected" and the question is about those lines. |
| Mention a line, e.g. "is line 12 right?" | The editor jumps there right away, and that line's text is sent along. |
| The answer points at a line | The editor scrolls there, puts the cursor on it and flashes it. Every "line N" in the answer is clickable. |
| Drag the bot or the box header | Both move together. Drop the bot near the editor's right edge to snap it there. |
| Click the expand icon in the box | Opens Deep-ML's full chat if you want the whole conversation. |

## How it works

- Deep-ML's assistant runs in the background, hidden. The extension types your question and the context into it, waits for the answer, and shows it in the box.
- Each question carries your numbered code (up to 300 lines) and a short instruction: answer briefly, refer to code as "line N", and end with `GOTO: N`. The extension reads that last line, removes it, and moves the editor.
- While an answer is loading, clicks elsewhere on the page don't close Deep-ML's hidden chat. Closing it would cancel the answer.

## Known limits

- Your questions and the attached code also appear in Deep-ML's own chat history (expand icon).
- If Deep-ML renames its assistant's buttons, update the selectors at the top of `content.js`.

## Releases

| Release | Feature | Status |
| --- | --- | --- |
| R1 v0.1 | Draggable bot, compact chat | Done |
| R2 v0.2 | Bot visible while the chat is open; drag the chat header | Done |
| R3 v0.3 | Compact ask box, automatic code and selection context, editor jumps to the line | Done |
| R4 v0.4 | Interview-style review pop-up after your tests pass | Next |
| R5 | Put a comment from the answer into your code, Keep / Undo | |
| R6 | On-device Gemini Nano for instant syntax answers | |
| R7 | LeetCode support on Gemini Nano | |
