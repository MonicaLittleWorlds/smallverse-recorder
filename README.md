# SmallVerse Mission Recorder

A personal, open-source Chrome extension for teaching reusable SmallVerse recordings by playing: **Record → play the mission → Stop → replay later**. Record another mission without writing another script.

**Status: v0.3 preview.** Automated tests cover recording, replay control flow, imports, and visual matching. A real SmallVerse mission has **not yet been successfully replayed with this extension**. The earlier observed playthrough was not recorded by this program. It is not a general AI player and does not infer missing steps or solve new missions independently.

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

## Automatic shared-library sync

Published missions appear automatically in the library and the replay selector. The extension checks the catalog when its controls/library open, on install/update, at Chrome startup, and approximately every 30 minutes while Chrome is running. Chrome may defer alarms while sleeping. Opening the UI has a one-minute cooldown; **Sync now** forces a check. New syncs wait while recording or replaying.

- Public downloads require no GitHub sign-in. All installations use this repository's catalog.
- New/changed versions display **Review required**. Open **Review / Copy**, inspect the inputs and timing markers, check the review box, and choose **Use shared version** before replay.
- Author, revision, checksum, and last-sync time identify the shared copy. Updating the file invalidates approval for the older version.
- **Save personal copy** preserves your edits separately. Sync never overwrites personal recordings, imports, or copies.
- Cached missions remain available offline. Failed downloads keep the last good version; withdrawn catalog entries are retained with a Withdrawn label and excluded from the replay selector.
- Nothing downloads executable code or starts replay automatically. Sharing a JSON file outside the catalog does not automatically distribute it.

The catalog is initially empty: the earlier observed playthrough was not a recording made by this program.

## Share to GitHub

1. Open a recording's **Review / Share** screen, review the text/visual targets, and confirm its timer markers. Add starting instructions and required items. Check the public-sharing review box.
2. Choose **Share to GitHub**. The extension downloads the reviewed JSON and opens a prefilled issue in this repository.
3. Sign in to GitHub if needed, **attach the downloaded JSON**, and submit the issue. These are explicit steps on GitHub; the button does not silently publish the recording or store a GitHub write token.
4. A maintainer reviews the submission and adds the recording to the catalog. Once that change is merged to `main`, everyone's extension receives it at the next sync.

**Export JSON** and file import remain available. Public exports exclude local IDs and shared-download metadata but include mission inputs, typed text, small visual targets, space URLs, and timer markers. Review them before publishing. Public Git history and attachments may persist after deletion.

Maintainers can publish a reviewed file with `npm run add-recording -- --file /path/mission.json --slug easter-island --author GitHubName --revision 1`, then review/commit/push the result. The helper validates the mission and timing and generates the catalog checksum. See the [publishing guide](recordings/README.md).

A normal download is not an administrator version. Repository permissions determine who can merge catalog changes. This release does not add a password or user-access service.

## Known limits

- A recording is a demonstrated input sequence with checkpoints, not AI training or autonomous exploration. It cannot recover from every deviation.
- Canvas targets use a recent pre-click screenshot (up to 1.4 seconds old). Fast camera motion or immediate clicks on newly appeared objects may capture no usable target. Pause briefly before important clicks when teaching a mission.
- Blank/repeated terrain can be ambiguous. Visual matching is intentionally conservative.
- Recording spans one loaded game page. A full page navigation/reload stops and saves the session. Use separate recordings for such transitions.
- No capture inside cross-origin iframes. No OS dialogs, browser shortcuts, or Ctrl/Command keyboard combinations. Pasting into a supported text field is captured through its resulting value.
- Hover-only motions are not recorded. Drag movements are sampled about every 65 ms. Rapid interactions or games requiring exact hardware timing need validation.
- Objective extraction relies on visible dialog headings and paragraphs. Unsupported/missing objective markup cannot supply a reliable checkpoint.
- Removing steps can break a recording: review adjacent key releases, Enter presses, and pointer releases. There is no automatic repair of arbitrary edits.
- Personal recordings are not uploaded automatically. Share to GitHub prepares a download and submission; contributors attach and submit it, then maintainers publish it to the catalog.

## Permissions and local data

| Permission | Purpose |
|---|---|
| `debugger` | Trusted mouse/keyboard replay, screenshots, and standard game viewport. Chrome gives this permission broad capabilities; this extension's code only attaches to validated SmallVerse space URLs. |
| `alarms` | Periodic public catalog checks while Chrome runs. |
| `storage`, `unlimitedStorage` | Save mission recordings, including small visual templates, locally. |
| `scripting`, `activeTab` | Install the recorder in an already-open game tab and identify the selected tab. |
| SmallVerse host access | Capture inputs and read mission dialogs on game pages. |
| `raw.githubusercontent.com` host access | Read this repository's public shared catalog/files on automatic sync or Sync now. Chrome host permissions are broader than individual repository paths; the code restricts downloads to the hard-coded repository and validated file paths. |

No analytics, cookies API, private account inspection, remote code, AI calls, or automatic publishing. Full screenshots are processed in memory; only small grayscale click patches are stored. Mission recordings can still include personal game chat and private-space URLs: review before publishing. This project is independent of SmallVerse; check the game's rules before using automation on an account.

## Development

```sh
npm run check
npm test
```

No npm dependencies are required. Twenty-six tests exercise sync/version review, offline cache preservation, personal-copy isolation, sharing submission preparation, catalog publishing, and the three-minute hold (including cancellation, pause and fallback), marker validation/portability, content capture, field flushing before Enter, password exclusion, trusted-event filtering, durable saving, exact URL restrictions, viewport configuration, DOM-target replay, pause/stop behavior, export sanitization, import validation, and matching/refusal of image targets. Tests use simulated Chrome APIs and DOM events, not a live browser or game.

- `extension/content.js`: input capture and DOM checkpoint/target extraction.
- `extension/background.js`: capture, persistence, viewport, playback and sharing reads.
- `extension/core.js`: format validation and visual matching.
- `extension/popup.*`: recording/replay controls.
- `extension/library.*`: review, export/import and public catalog.

License: [MIT](LICENSE). Contributions and demonstrated mission recordings are welcome. Do not submit account data, access tokens, private conversations, or recordings you do not have permission to share.
