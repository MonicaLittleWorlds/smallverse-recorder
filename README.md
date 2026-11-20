# SmallVerse Mission Recorder

A personal, open-source Chrome extension for teaching reusable SmallVerse recordings by playing: **Record → play the mission → Stop → replay later**. Record another mission without writing another script.

**Status: v0.7.3 preview; community publishing service connected.** Automated tests cover recording, replay control flow, imports, and visual matching. A real SmallVerse mission has **not yet been successfully replayed with this extension**. The earlier observed playthrough was not recorded by this program. It is not a general AI player and does not infer missing steps or solve new missions independently.

## Camera gestures and local animation (v0.7.3)

Continuous wheel gestures retain fractional deltas, both scroll axes, pinch modifiers and relative cursor movement after target relocation. Small cursor movement and intervening observations of the same objective no longer split a gesture and trigger image matching halfway through zooming. Different objectives, other inputs, modifier changes and gesture gaps still require a new check. Page-unit horizontal scroll uses the saved viewport width, vertical scroll its height. Named wheel targets are saved when available. Mouse drag paths retain their recorded CSS-pixel distances after relocating the starting target, independent of display pixel density.

The settling check can now recognize a small stationary animation footprint over eight frames. It learns the changing pixels in the first four frames, then requires four more frames with changes confined to that footprint (at most 2% of sampled world pixels). Widespread camera movement, a subject moving outside that area, and featureless scenes still fail. This is a bounded visual heuristic, not avatar tracking; it cannot prove arrival or handle all animations. The next target and objective must still pass their existing checks. Pause reasons now appear in the game overlay.

Automated tests cover wheel and trackpad-style deltas, pinch modifiers, drag replay at 1440×757 and 1470×956, stationary animation, walking and camera movement. A live mission using a second physical device remains unverified. Pinch is supported only when Chrome delivers it to the game as wheel input; browser/OS zoom and desktop gestures are not portable game actions. Keep the game tab visible and the window size fixed. Missing visual references and previously uncaptured inputs cannot be reconstructed from deleted recordings.

## Different display and game sizes (v0.7.2)

Adaptive replay can start with a different game viewport from the recording, including 1470×956 CSS pixels. Leave **Use exact saved positions** unchecked. Screenshots use the actual game viewport and visible targets are located again before clicking; wheel gestures use their relocated target too. Hidden-object repairs require fresh matching hover labels or landmarks before clicking a translated candidate. This does not guarantee every old recording will match at every size.

Display resolution includes space used by Chrome and the operating system, so a 1470×956 display usually has a smaller game viewport. No window resizing or viewport emulation is used. Keep the window size unchanged during each run; a mid-run resize pauses playback. Exact-position mode still requires the recorded viewport. Recovery preserves the viewport used for that playback session. Automated tests cover 1470×956 DOM and canvas target replay, Retina screenshot scaling, rejection in exact-position mode, and missing hidden-target labels. A complete live mission at this size remains unverified.

## Reload recovery (v0.7.1)

A game tab whose extension context was invalidated catches both immediate and asynchronous messaging errors, stops its stale recording/heartbeat handlers and shows a refresh notice. Reloading the extension still requires refreshing existing game tabs before the next run. Library/popup URLs with query strings or fragments remain recognized as extension controls; game pages and lookalike origins remain restricted. Startup failures in the library are displayed rather than left as unhandled errors.

## Walking and camera adaptation (v0.7.0)

Adaptive playback is now the default. Leave **Use exact saved positions** unchecked. Named controls are located at their current visible position and must settle across two observations. Canvas targets are searched across the current screenshot at 0.5×–2× their recorded size; ambiguous, missing or low-detail targets pause without clicking. The scaled click offset is preserved. This handles translation and uniform zoom, not rotation, unseen objects or major appearance changes. Since v0.7.2, adaptive replay supports a different initial viewport; no window resizing or viewport emulation is used.

After canvas clicks, recorded Walk To actions, camera controls, drags and wheel gestures, playback waits for three quiet frame intervals before the next input, up to about 40 seconds. It measures visible world motion while excluding detected dialogs, chat and toolbars. The following target and full objective are still checked. This is a visual settling heuristic: it cannot prove path completion, distinguish a blocked avatar from an arrived one, or reliably ignore every idle animation. Persistent animation or a dark/featureless scene can pause safely. Stop/Pause remain available during waiting; settling is rechecked after recovery.

Future recordings capture larger 64×64 visual references to provide more surrounding detail. Existing recordings can use adaptive mode where their references remain distinctive; no missing actions are invented. The deleted Autumn library entry is not restored automatically. Full live replay with this mode remains unverified.

Publishing now serializes mission files as lossless compact JSON. Indentation no longer consumes the 1 MB upload allowance; all actions and visual pixels are retained.

## Hover identity and scene settling (v0.6.14)

Reviewed hidden-object repairs can require the exact item title and description to appear after hovering the saved position. Playback first moves away and requires any old matching label to disappear, then hovers the target and requires two matching observations before clicking. Missing, stale, ambiguous or wrong labels pause without clicking. The full objective text must still match. This is a targeted recording repair, not an automatic guess at invisible objects.

Scene landmark checks normalize small screenshot resampling differences and wait for two consecutive matching frames (up to ten captures). They retain fixed positions and reject missing landmarks and shifted cameras. Hover repairs require an updated recording JSON; existing landmark-only repairs benefit from the settling check automatically.

## Reviewed hidden-target repairs (v0.6.13)

A repaired canvas click can carry three separated visual landmarks from a confirmed scene. Playback requires all three to match at their saved positions and the complete objective text to match before using the saved click. Black pixels alone never authorize a click; missing landmarks, camera shifts or unavailable capture pause playback. This is a targeted repair, not automatic inference of invisible objects.

## Radial menu readiness (v0.6.12)

New recordings mark non-dialog `*` buttons for radial-menu replay. Playback waits up to about 12 seconds for a unique, enabled, uncovered button near the selected item, requires its position to settle, and clicks its current center. The release follows that same position. Missing, ambiguous or distant controls pause safely; objective and minimum-time checks remain active. Existing recordings require the radial marker to be added through a reviewed JSON repair. Full live mission replay remains unverified.

## Playback recovery (v0.6.11)

Playback now keeps a local recording snapshot and progress journal. Before sending an input it marks that action pending, and after each completed step it saves the next index, timer progress and held-input state. Worker restarts restore playback **paused**. **Resume playback** reconnects and checks the space, viewport and full objective text before continuing. It never resumes automatically on browser launch.

Debugger disconnections, tab closure and navigation retain the recovery position. Generic same-space loading notifications no longer stop playback; document identity checks pause on actual reloads. A heartbeat also runs during playback and paused sessions. Explicit **Stop** cancels the saved recovery position.

If an input may have been interrupted, the recorder cannot know whether the game received it and will not repeat it automatically. Use **Resume from an objective** to select a currently visible objective whose recorded actions have not already been performed. The selected title and text must match the game. This also works for older runs that lost their position before this update. Objective-based recovery starts a fresh three-minute minimum; exact-position recovery retains previously saved timer progress and conservatively excludes worker downtime.

For Flight Log at task 7 before saying “bob, open the gates,” select **110. [7] — The radio suddenly crackles…**. Do not choose that recovery point if you have already performed its chat/actions.

## Avatar and animation tolerance (v0.6.10)

Fixed-position canvas replay can accept partially obscured references when multiple detailed regions still match at the recorded location. It requires at least four matching 8×8 regions, coverage in both directions and evidence near the click; blank areas and ambiguous repeating patterns do not establish alignment. If the first comparison fails, replay checks up to three frames before pausing. Named buttons still require the expected visible, enabled control under the saved position. This does not relocate clicks or disable checkpoint/viewport checks.

Existing recordings use the updated check automatically. A view with insufficient unchanged detail still pauses; complete mission replay is not guaranteed. Private regression checks cover the observed start-icon, TV and file failures, including shifted and scaled negative examples.

Personal recordings can be replaced from **Review / Share → Replace from JSON** while replay/recording is stopped. Replacement keeps the selected mission name and saves the prior recording as a separate **before repair** backup. Shared originals cannot be replaced this way.

## Camera recording and fixed-position replay (v0.6.9)

Drag recording listens at the window capture phase and includes browser-coalesced movement samples. Horizontal/vertical wheel events and pinch-wheel modifiers are retained. Continuous wheel gestures verify alignment at their start, then replay their deltas; the next gesture or click checks alignment again. Game camera buttons are recorded as ordinary controls. Browser chrome zoom shortcuts are not supported.

Fixed-position replay verifies named controls directly under their saved coordinates, including covered/disabled checks. Canvas clicks still require a matching visual reference. Faint references use stricter pixel and pattern checks; completely flat canvas references remain blocked. New low-detail captures expand to a larger reference region. Existing recordings benefit from the playback fixes without changing their steps, but missing actions or flat canvas evidence cannot be reconstructed. No completed end-to-end mission replay has been verified yet.

After updating, reload the extension in Chrome Extensions and refresh the game tab while recording/replay is stopped so the new capture code is active.

## Update notifications

Starting with v0.6.8, the recorder and Mission library show **Update available** with a **Download update** link when a newer stable GitHub release is published. Checks run on opening the controls, at Chrome startup, and periodically, with a six-hour cache. Offline checks preserve the last known update and retry after an hour. Download the ZIP, extract and replace your local extension files, then reload in `chrome://extensions` when recording/replay is stopped. Updates are never installed automatically. Older versions need this update installed once before they can display future notices.

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
3. The recorder saves the actual game viewport without resizing your window. Keep the game tab active and its window size unchanged during recording. Display pixel density is accounted for during screenshot capture; physical monitor resolution does not need to match for adaptive playback.
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
| `debugger` | Trusted mouse/keyboard replay. Chrome gives this permission broad capabilities; this extension's code only attaches to validated SmallVerse space URLs. |
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

No npm dependencies are required. Automated tests exercise sync/version review, offline cache preservation, personal-copy isolation, sharing submission preparation, catalog publishing, and the three-minute hold (including cancellation, pause and fallback), marker validation/portability, content capture, field flushing before Enter, password exclusion, trusted-event filtering, durable saving, exact URL restrictions, viewport configuration, DOM-target replay, pause/stop behavior, export sanitization, import validation, and matching/refusal of image targets. Tests use simulated Chrome APIs and DOM events, not a live browser or game.

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

### Version 0.6.6 alignment checks

Position replay now verifies a detailed visual reference at each saved click and wheel location before sending that action. Missing references or a changed view pause playback. Recording preserves every delivered drag sample, and playback keeps the held mouse button and final drag endpoint. Old recordings with no visual targets need re-recording for this mode. Visual checks are conservative and are not a guarantee of game-state correctness. Full mission validation remains pending.

### Version 0.6.7 capture change

Periodic images now use Chrome tabs.captureVisibleTab with serialized calls at least 550 ms apart. Neither recording nor replay forces device metrics or uses debugger screenshots. New recordings store the actual browser content size. Exact-position replay refuses a different size and shows the required dimensions; v0.7.2 adaptive replay accepts a different initial size. Keep the game tab active and the window size unchanged during each run. This replaces earlier standard-viewport behavior.
