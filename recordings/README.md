# Shared mission recordings

This library starts empty. The first real recording must be made with the installed extension; watching a playthrough did not produce a replay file.

## Publish a recording

1. In the extension library, open **Review / Export**. Inspect all typed text, objective text, visual patches and the starting space URL. Remove personal or unwanted content. Add starting position, zoom, camera direction, required items and game-state instructions.
2. Check the review box and choose **Export reviewed JSON**. Test replay before describing it as working. If not tested, label it **untested**.
3. On GitHub, open the `recordings` folder and choose **Add file → Upload files**. Upload the JSON with a simple filename such as `easter-island.json`. Repository collaborators can commit; other users can contribute through a fork/pull request.
4. Edit `recordings/index.json` to add an entry:

```json
[
  {
    "name": "Easter Island",
    "path": "recordings/easter-island.json",
    "description": "Untested recording. Start at the beach before accepting; see the recording notes for zoom and prerequisites."
  }
]
```

Keep other catalog entries. Use a unique file name with letters, digits, underscores or hyphens. The CI check validates the format and catalog path, but cannot verify actual gameplay.

5. After merging/committing to `main`, other users can choose **Browse shared missions** in the extension. GitHub caching may briefly delay appearance.

## Import and use

Download to review, read the setup notes and typed inputs, then Save locally. Open SmallVerse, match the starting conditions, choose the recording in the extension popup and replay. Imported files never start themselves.

Public Git history can retain earlier versions after a file is removed. Only publish information you intend to share publicly. This library is for mission actions, not credentials or private conversations.
