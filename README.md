# SmallVerse Mission Recorder

A personal, open-source Chrome extension for teaching reusable SmallVerse recordings by playing: **Record → play the mission → Stop → replay later**. Record another mission without writing another script.

**Status: v0.2 preview.** Automated tests cover recording, replay control flow, imports, and visual matching. A real SmallVerse mission has **not yet been successfully replayed with this extension**. The earlier observed playthrough was not recorded by this program. It is not a general AI player and does not infer missing steps or solve new missions independently.

## Install in Chrome

1. Download the repository ZIP using **Code → Download ZIP**, then extract it, or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the **`extension` folder**, not the repository root.
4. Pin **SmallVerse Mission Recorder** from Chrome's Extensions menu.
5. Open or refresh your SmallVerse game tab. This only needs to be done once after loading/updating the extension.

There is no build step, paid service, API key, or server. Node.js is only needed to run the developer tests. Updates are manual: replace/pull the source, click Reload on the extension, then refresh the game tab. Export important recordings before uninstalling: Chrome removes extension storage on uninstall.

## Record a mission

1. Go to a known starting location and mission state. Record from **before accepting the mission** if you want acceptance included in replay.
2. Click the extension, enter the mission name, then **Start recording**. Chrome displays its debugging banner.
3. The game is rendered at **1440 × 757 CSS pixels**, based on the original user's game view. Smaller browser windows fit that game view into their available space. Display pixel density is normalized to 1 for screenshot matching; the physical monitor resolution does not need to match.
4. Play normally. Mouse presses/releases, dragging, wheel input, keyboard actions, game text entry, and objective dialog changes are saved. The objective's Continue button does **not** need to be clicked unless the game actually requires it.
5. Use the small **Stop** control, **Escape**, or **Alt+Shift+S**. Steps save locally as you play.
6. Open **Mission library → Review / Export**. Add starting instructions, in-game zoom, camera direction, prerequisites, and any timing constraints. Review text and visual patches.

Only record intended gameplay. Game chat typing is recorded because some missions require phrases; private messages typed during recording would also be captured. Password and common payment fields are excluded, but the recorder cannot recognize every possible secret typed into ordinary chat.

## Three-minute minimum

Replay requires **180 seconds minimum** from a verified post-acceptance objective to the marked finishing action. It uses a monotonic elapsed-time clock. If the finishing action is reached at 2:40, replay waits 20 seconds, then rechecks the objective/target before sending that action. If the minimum has already elapsed, no extra delay is added. Pauses count toward elapsed mission time, but a paused replay does not resume itself.

In **Review**, select:

1. **Start timer after this objective**: the first objective visible after mission acceptance. A click on a labeled `Accept this mission` control can suggest the subsequent objective automatically; verify it.
2. **Wait before this action**: an input that could complete the mission. For an arrival trigger, choose the movement that enters the final area. Do not select a reward dialog or an action after completion.
3. Confirm **These markers are correct for this mission**, then Save.

The recorder does not infer the finishing trigger from watching pixels. Correct markers are necessary; there is no claim of a server-verified timer. Start is deliberately conservative: the clock starts after the selected objective is observed, not before mission acceptance. If recording began mid-mission, select a known active objective and replay waits a fresh three minutes from that point.

Missing/unreviewed/invalid markers block replay. Removing a marked step requires setup again. The hold is before a complete input action, never in the middle of a pressed mouse/key gesture. Stop cancels the hold. Coordinate fallback cannot skip the timer.

New exports use recording format **2**, including the timing markers. Version 1 files can be imported, but need timer setup before replay. Older v0.1 extensions reject format 2 rather than silently ignoring its timing requirements; update the extension to share these recordings.

## Replay

1. Open the same space, reset/restart the mission as needed, and return to the recorded starting position, camera direction, and **in-game zoom**. Required items and abilities must also be available.
2. Choose the saved mission, check the starting-state box, then **Replay selected**.
3. Keep the game available and watch the first replay. Opening DevTools or another tool that attaches a debugger may disconnect the extension.
4. Replay preserves timing and waits for the recorded mission text. Semantic page controls are located by labels/text; canvas clicks use small grayscale visual targets.
5. If a visual target is missing, changed, too plain, or ambiguous, replay pauses. Restore the view and choose **Pause / Resume** to retry. **Use recorded position once** is an explicit fallback for one paused pointer action; use it only when the view matches.
6. **Alt+Shift+P** pauses/resumes. A requested pause waits for a held mouse/key action to finish; **Escape** or **Alt+Shift+S** stops immediately and releases held inputs. An interrupted gesture may require restarting from the beginning.

“Replay reached the end” means the recorded inputs finished. Check SmallVerse for actual mission completion; the extension does not claim server-side completion or rewards.

## Share recordings on GitHub

Recordings stay in Chrome local storage until deliberately exported. The repository includes a public [`recordings/`](recordings/) catalog, initially empty. There is no recording from the initial observational session to upload.

- Review every typed entry, mission text, visual patch, and space URL before checking the export box.
- **Export JSON** downloads a portable recording. It contains no local recording ID, full screenshot, authentication cookie, or GitHub credential.
- Follow the [publishing guide](recordings/README.md) to upload the JSON and add it to `recordings/index.json`.
- Other users select **Browse shared missions → Download to review → Save locally**, or import a JSON file directly.
- Recordings are data, never executable JavaScript. Downloads do not automatically run. The extension needs no GitHub write token; publication uses GitHub's normal authenticated website or a Git client.

Shared recordings are portable, not guaranteed universal. Standardized view size removes one major difference; starting state, game updates, other players covering targets, animations, camera/zoom, and account prerequisites still matter.

## Known limits

- A recording is a demonstrated input sequence with checkpoints, not AI training or autonomous exploration. It cannot recover from every deviation.
- Canvas targets use a recent pre-click screenshot (up to 1.4 seconds old). Fast camera motion or immediate clicks on newly appeared objects may capture no usable target. Pause briefly before important clicks when teaching a mission.
- Blank/repeated terrain can be ambiguous. Visual matching is intentionally conservative.
- Recording spans one loaded game page. A full page navigation/reload stops and saves the session. Use separate recordings for such transitions.
- No capture inside cross-origin iframes. No OS dialogs, browser shortcuts, or Ctrl/Command keyboard combinations. Pasting into a supported text field is captured through its resulting value.
- Hover-only motions are not recorded. Drag movements are sampled about every 65 ms. Rapid interactions or games requiring exact hardware timing need validation.
- Objective extraction relies on visible dialog headings and paragraphs. Unsupported/missing objective markup cannot supply a reliable checkpoint.
- Removing steps can break a recording: review adjacent key releases, Enter presses, and pointer releases. There is no automatic repair of arbitrary edits.
- Recordings save locally, not automatically to GitHub. Export/import is the sharing boundary.

## Permissions and local data

| Permission | Purpose |
|---|---|
| `debugger` | Trusted mouse/keyboard replay, screenshots, and standard game viewport. Chrome gives this permission broad capabilities; this extension's code only attaches to validated SmallVerse space URLs. |
| `storage`, `unlimitedStorage` | Save mission recordings, including small visual templates, locally. |
| `scripting`, `activeTab` | Install the recorder in an already-open game tab and identify the selected tab. |
| SmallVerse host access | Capture inputs and read mission dialogs on game pages. |
| `raw.githubusercontent.com` host access | Read this repository's shared catalog/files when requested. Chrome host permissions are broader than individual repository paths; the code restricts downloads to the hard-coded repository and validated file paths. |

No analytics, cookies API, private account inspection, remote code, AI calls, or automatic publishing. Full screenshots are processed in memory; only small grayscale click patches are stored. Mission recordings can still include personal game chat and private-space URLs: review before publishing. This project is independent of SmallVerse; check the game's rules before using automation on an account.

## Development

```sh
npm run check
npm test
```

No npm dependencies are required. Nineteen tests exercise the three-minute hold (including cancellation, pause and fallback), marker validation/portability, content capture, field flushing before Enter, password exclusion, trusted-event filtering, durable saving, exact URL restrictions, viewport configuration, DOM-target replay, pause/stop behavior, export sanitization, import validation, and matching/refusal of image targets. Tests use simulated Chrome APIs and DOM events, not a live browser or game.

- `extension/content.js`: input capture and DOM checkpoint/target extraction.
- `extension/background.js`: capture, persistence, viewport, playback and sharing reads.
- `extension/core.js`: format validation and visual matching.
- `extension/popup.*`: recording/replay controls.
- `extension/library.*`: review, export/import and public catalog.

License: [MIT](LICENSE). Contributions and demonstrated mission recordings are welcome. Do not submit account data, access tokens, private conversations, or recordings you do not have permission to share.
