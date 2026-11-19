# SmallVerse Mission Recorder

A personal, open-source Chrome extension for teaching reusable SmallVerse recordings by playing: **Record → play the mission → Stop → replay later**. Record another mission without writing another script.

**Status: v0.6 preview; community publishing service connected.** Automated tests cover recording, replay control flow, imports, and visual matching. A real SmallVerse mission has **not yet been successfully replayed with this extension**. The earlier observed playthrough was not recorded by this program. It is not a general AI player and does not infer missing steps or solve new missions independently.

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

For new recordings, use the on-page controls while playing:

1. After accepting the mission and seeing its active objective, click **Mission accepted**. (An observed labeled acceptance button can also set the subsequent objective automatically.)
2. Immediately before beginning the final task, click **Final task starts here**, then perform that task normally.
3. Stop recording. If both markers are valid, the recording saves with its timer already confirmed. Replay preserves the sequence and waits before the first action of the final task until three minutes have elapsed. The last recorded click is not guessed to be the completion action, since it might only close a reward popup.

Existing recordings or missing markers still need the following **Review** setup:

1. **Start timer after this objective**: the first objective visible after mission acceptance. A click on a labeled `Accept this mission` control can suggest the subsequent objective automatically; verify it.
2. **Wait before this action**: an input that could complete the mission. For an arrival trigger, choose the movement that enters the final area. Do not select a reward dialog or an action after completion.
3. Confirm **These markers are correct for this mission**, then Save.

The recorder does not infer the finishing trigger from watching pixels. Correct markers are necessary; there is no claim of a server-verified timer. Start is deliberately conservative: the clock starts after the selected objective is observed, not before mission acceptance. If recording began mid-mission, select a known active objective and replay waits a fresh three minutes from that point.

Missing/unreviewed/invalid markers block replay. Removing a marked step requires setup again. The hold is before a complete input action, never in the middle of a pressed mouse/key gesture. Stop cancels the hold. Coordinate fallback cannot skip the timer.

New exports use recording format **3**, including optional popup transitions and timing markers. Versions 1 and 2 can still be imported; legacy recordings need reviewed timing markers before replay. Older extensions reject format 3; update before importing new shared recordings.

## Optional task popups

When recording stops, complete Continue/OK clicks followed by a new objective are learned as optional popup steps. Replay matches the recorded dialog title and text, dismisses it with its recorded button, and waits for the next objective. If that objective is already visible without the popup, replay skips the dismissal and its recorded waiting delay. An unfamiliar dialog pauses playback without being clicked. A missing popup alone is not evidence that the task advanced.

In **Review**, use **Detect optional popups** for older recordings, **Make optional** for a reviewed dismissal, or **Make required** to restore the original steps. Review changes and confirm timing markers before saving. Acceptance, purchases, reward buttons, drags, and timing-marked steps are not automatically made optional. Canvas-only popups and dialogs without readable headings cannot be learned automatically. The popup must have been observed during a recording; this does not discover unseen mission branches.

Optional steps never contain or skip the mission timer markers. The three-minute hold still applies before the marked finishing action.

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
2. Connect GitHub, then choose **Share to GitHub**. The configured publishing service uploads the reviewed JSON and updates the shared catalog in one commit.
3. Other installations receive it on their next sync and must review it before replay. Exact retry uploads do not create duplicate entries.

The community publishing service is configured at https://smallverse-mission-sharing.jwmorrow96.workers.dev. Connect GitHub from the library before sharing. Export JSON remains available.

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
- Personal recordings are uploaded only when you explicitly choose Share to GitHub after review. A configured service publishes them to the public catalog; the publishing credential remains on the service.

## Permissions and local data

| Permission | Purpose |
|---|---|
| `identity` | User-initiated GitHub sign-in through the configured publishing service. |
| Publishing service host access | Upload explicitly reviewed mission JSON to the owner-configured HTTPS service. |
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


## One-click community publishing (v0.5)

The Share button now uses a GitHub sign-in service to upload the reviewed JSON and update the catalog in one commit. Every signed-in contributor can publish without repository editing access. Duplicate retries reuse the existing contribution; concurrent catalog changes are preserved. Downloaded missions still require local review before replay.

The service is deployed and GitHub sign-in was verified in the installed Chrome extension. A real recording upload and second-installation sync have not yet been verified. See `publisher/README.md` for maintenance and deployment instructions. The owner creates the hosting account once; other users only sign in with GitHub. Never put a publishing token in the extension. Automatic sharing is limited to 1 MB and five new recordings per account per UTC day. Updated recording contents are published as separate contributions.

### Finding saved missions

Type any part of a mission name in the recorder search field, select a matching mission, confirm the starting state and choose Replay. Search ignores capitalization and includes active shared missions. The library also searches personal and shared recordings by name. No results means Replay stays disabled.

### Recording interruptions

A lost debugger connection no longer ends recording: clicks, typing and objective changes keep saving, and the toolbar warns that visual capture is unavailable. Unlabelled canvas clicks made during that interval may require manual target review on replay. An active recording also sends a heartbeat while waiting. Stop or Escape ends recording; closing the game tab, leaving SmallVerse, reaching the step limit, or closing Chrome still interrupts it. A generic loading notification no longer stops recording. A real page reload can still lose inputs during the reload; contentReady restores the toolbar afterward. Keep the game page open. Continue recording can append at a matching saved objective and creates a backup first; it cannot reconstruct missing gameplay.

### Replay modes and capture

Recorded-position playback is the default: all pointer clicks and drags, including named buttons and optional popup dismissals with saved positions, use saved coordinates without per-click confirmation. Text fields still resolve by their recorded labels; typing, Enter and wheel events replay in sequence. Objective checks and the three-minute hold remain enabled. Match the initial camera, zoom, avatar position and mission state. Uncheck the position option to use visual matching for canvas targets. Missing or ambiguous targets then pause playback.

Version 0.6.4 fixes Chrome rejecting non-surface screenshots. Capture uses the supported surface mode with an explicit viewport clip and captureBeyondViewport disabled. A live Chrome capture check succeeded at 720×379 matching resolution on November 19, 2026. Capture errors are now shown while inputs continue saving. Old recordings with zero visual targets cannot gain those missing images retroactively. Full gameplay replay and long-running capture stability remain to be verified.
