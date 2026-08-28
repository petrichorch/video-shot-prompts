# Bundled wool-felting music

Use these files for generated videos instead of copying audio from the selected
reference video. Resolve paths relative to the installed skill directory.

| File | Source credit | Duration | Notes |
| --- | --- | ---: | --- |
| `assets/music/02-museum-art-original.mp3` | Museum Art阿辉，抖音原声 `6874948486700190478` | 22.38s | Short independent track; loop for longer edits. |
| `assets/music/03-mirii-kirino-video-mix.mp3` | Cici_oO控大叔 video audio | 28.35s | TiKHub exposed no separate music URL, so this is the extracted video mix and may contain ambient sound. Use after the independent track. |

Source share links:

- `https://v.douyin.com/PFUwTQnyI7I/`
- `https://v.douyin.com/QXyEGmPoTxI/`

Selection rules:

- Default to track 02 and use track 03 only when its mixed/ambient character
  fits the edit.
- Pass the selected file with `create-slideshow-video.js --audio`. Never use the
  chosen reference video's audio automatically.
- The renderer loops short tracks and trims the audio to the video duration.
- Record the filename and source credit in the review package.
- These files are workflow references, not proof of commercial or platform
  publishing rights. Confirm rights for the target platform and market before
  approved publication.
