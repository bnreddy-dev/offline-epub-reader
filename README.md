# Offline EPUB Reader — App Requirements & Build Blueprint (v3 — FINAL)

> **Prepared by:** Ira (acting as the web developer)
> **For:** Baisani Nageswar Reddy (the client)
> **Date:** 27 November 2026
> **Status:** v3 FINAL — requirements discussion closed 27 Nov 2026. The client confirmed every detail has been discussed and there is nothing more to add right now. Ready to build from.
> **Supersedes:** `Zero-Cost_Offline_EPUB_Reader_Blueprint.md` (v1) on one point — see §2.1. v1 wrongly claimed Kokoro TTS can narrate Telugu. It cannot. This document corrects that and rebuilds the voice plan around what is actually true.

---

## 1. What this app is

A **single HTML file** that opens in any browser (Chrome, Edge, Firefox, mobile or desktop), lets the user open an EPUB book from their own device, read it comfortably, and listen to it read aloud — **with no hosting, no server, no sign-up, no cost, and no internet needed after the first setup**.

This is a **global** app for any book, any reader, anywhere. The client's own Telugu novel **"11:17"** (thriller / mystery, emotional core, 340 pages) is one example book it must handle well — but the app must work for **any** EPUB in **Telugu, Hindi, or English** — language must never be a barrier.

**One-line promise:** *Double-click one file → pick a book → read it or hear it, in your language, in the right mood, fully offline.*

---

## 2. Non-negotiable constraints

These came from the client and cannot be broken to make the build easier.

| # | Constraint | What it means in practice |
|---|-----------|--------------------------|
| 1 | **Zero cost** | No paid APIs, no subscriptions, no credits. Every component must be free (open-source or built into the browser). |
| 2 | **Not hosted** | The app is a local HTML file, opened by double-click. No GitHub Pages, no Vercel, no server of any kind. |
| 3 | **Offline** | After the file is on the device, reading and listening work with no internet. (One exception, stated honestly in §8.3: the optional Kokoro engine needs its model files fetched once.) |
| 4 | **Private** | No data ever leaves the device. No analytics, no tracking, no uploads. The book stays on the device. |
| 5 | **Single file** | One `.html` file. All CSS and JavaScript are written *inside* it. No separate files, because Chrome blocks a local page from loading other local files (see §8.1). |
| 6 | **No language barrier** | Telugu, Hindi and English must all work for reading *and* listening. A book in any of the three must narrate naturally, not robotically. |
| 7 | **Natural, expressive voice** | The narration must feel like a narrator, not a robot. Tone must fit the scene — tense, sad, warm, playful — as far as free offline tools allow (honest limits in §7.4). |

### 2.1 Correction to v1 — Kokoro has NO Telugu

The v1 blueprint said Kokoro TTS would give "natural, fluent narration for Telugu". **That is false, and this document corrects it.**

Verified 27 Nov 2026 (Kokoro model card + web demo): Kokoro-82M supports exactly **8 languages — English, Spanish, French, Hindi, Italian, Portuguese, Japanese, Chinese**. There is no Telugu voice. The official web demo is English-only. Some third-party sites show "Telugu" next to Kokoro, but they silently fall back to eSpeak NG for Telugu — robotic, not Kokoro.

**Consequence for the build:** Kokoro is the engine for **English and Hindi only**. Telugu narration uses the **browser's built-in voice** (§5.2). The app must route by language, never assume one engine covers all.

---

## 3. Who uses it and what they want

### 3.1 The client (primary user)
- Reads his own novel **11:17** (Telugu, thriller) and wants to *hear* it the way a narrator would tell it — slow and tense at reveals, warm at sister's memories, never flat.
- Reads English and Hindi books too. Wants the same app for all three languages.
- Uses his **phone** most of the time (Android + Chrome), sometimes a laptop. No laptop with him right now — so the app must work on mobile first.
- Has no budget for paid voices. Will not pay per-character or per-month for narration.

### 3.2 Other readers (who the app is also for)
- Anyone who reads in Telugu, Hindi or English and wants a free read-aloud reader.
- People who switch languages between books — the app must not make them reconfigure anything per book.
- People who listen while doing other things (cooking, travelling) — so playback must be hands-free once started, with clear controls.

### 3.3 User stories (acceptance-level)
1. As a reader, I open the HTML file, tap "Open book", pick an EPUB, and I am reading within seconds — no login, no wait.
2. As a listener, I tap Play and the book reads aloud in the book's language, sentence by sentence, with the current sentence highlighted and the page scrolling to follow it.
3. As a Telugu reader, my Telugu book is narrated in Telugu — not in English-accented gibberish, not skipped, not robotic if my phone has a good voice.
4. As a listener of a thriller, tense scenes feel tense (slower, longer pauses) and warm scenes feel warm — the narration follows the mood, not one flat pace.
5. As a reader who stops mid-chapter, I close the file and come back tomorrow to the exact sentence I left.
6. As a phone user, I can use the whole app with one thumb: big play button, swipe or tap to move between sentences, readable text in sunlight and at night.

---

## 4. Features

### 4.1 Library & file handling
- **Open book:** file picker (`<input type="file" accept=".epub">`) + drag-and-drop on desktop. No upload to any server — the file is read locally with the File API.
- **Recent books:** the last few opened books listed on the home screen (title, author, cover if present, last-read position). Stored in IndexedDB; the book file itself is re-picked if the browser has forgotten it (browsers cannot keep a file handle forever — the app must say so plainly and re-ask for the file).
- **Book info:** title, author, language (auto-detected, see §6.1), chapter count, word count, estimated reading/listening time.
- **Cover:** show the EPUB's embedded cover image when present; a clean placeholder when absent.

### 4.2 Reading experience (UI)
- **Layout:** left/top chapter sidebar (collapsible), centre reading pane, bottom audio bar. On mobile the sidebar becomes a slide-over drawer.
- **Themes:** Light, Dark, and Sepia. One tap to switch; choice is remembered. Text must stay readable in all three (real contrast, not grey-on-grey).
- **Typography:** font size slider (5 steps), line-spacing control, font choice. Telugu text must render in a proper Telugu font (Noto Sans Telugu preferred; system fallback if absent). English/Hindi use clean sans-serif.
- **Chapter navigation:** tap any chapter in the sidebar to jump. "Next chapter" / "Previous chapter" buttons. A progress bar showing position in the chapter and in the book.
- **Text selection:** selecting any word/phrase shows a small floating menu — *Define* (offline mini-dictionary is out of scope for v1; open a web search in a new tab instead, labelled honestly as needing internet) and *Copy*.
- **Click-to-hear:** tapping any paragraph starts narration from that exact paragraph.
- **Search in book:** type a word, see matching sentences with chapter names, tap one to jump there. (v1: simple text search across extracted chapter text.)

### 4.3 Read-aloud (the heart of the app)
- **Play / Pause / Stop.** **Previous sentence / Next sentence.** **Restart chapter.**
- **Speed control:** 0.75×, 1.0×, 1.25×, 1.5×, 2.0× — applies to whichever engine is active.
- **Voice choice:** a voice picker listing what the device actually has (see §5.4). The user can override the automatic choice per language.
- **Sentence highlighting:** the sentence being spoken is highlighted and the page auto-scrolls to keep it visible. Highlight style is a soft background tint, never a colour that fights the theme.
- **Auto-advance:** when a chapter ends, narration continues into the next chapter unless the user has set "stop at chapter end".
- **Sleep timer:** stop after 15 / 30 / 60 minutes (for night listening).
- **Resume:** reopening a book resumes narration from the last sentence, not from the chapter start.

### 4.4 Mood & genre narration (the narrator feel)
This is the feature that makes the app feel like a narrator instead of a robot. Full design in §7.

- **Genre profiles:** every book gets a genre (auto-suggested from its metadata or the user's pick). Each genre has a default narration mood-map: thriller, romance, comedy, horror, devotional, biography, self-help, children's story.
- **Scene moods:** chapters (and, where marked, scenes inside a chapter) carry a mood tag — *tense, sad, warm, light, scary, neutral*. The narration pace, pitch and pauses change with the mood.
- **Mood controls the listener can see:** a small mood indicator in the audio bar ("Now: Tense") so the listener knows why the pace changed.
- **Manual override:** the listener can tap a mood chip to force a mood for the current chapter, and can turn mood-following off entirely ("Flat narration" mode).

### 4.5 Bookmarks & memory
- **Manual bookmark:** one tap drops a bookmark at the exact sentence. Multiple bookmarks per book, each with an optional short note.
- **Auto-save:** reading position, playback position, theme, font size, speed, voice choice and bookmarks are saved automatically to `localStorage` / IndexedDB. Closing the tab loses nothing.
- **Last-read strip:** on the home screen, each recent book shows "Ch 4 · 62% · 12 min left".

### 4.6 Accessibility
- **Large-text mode** (one tap, bigger than the largest font slider step).
- **High-contrast toggle** for low vision.
- **Keyboard shortcuts (desktop):** Space = play/pause, ←/→ = previous/next sentence, ↑/↓ = scroll, `B` = bookmark, `M` = mood menu.
- **Screen-reader labels** on every control. The audio bar must be usable without seeing the screen.

### 4.7 What is deliberately NOT in v1
- No dictionary (needs a data file; web search link instead).
- No notes/highlights export.
- No cloud sync, no accounts.
- No AI summary of chapters.
- No voice cloning, no custom voice recording.
- No multi-book search. (One book at a time.)

---

## 5. Voice & language system

### 5.1 The two engines

| Engine | What it is | Languages it can narrate | Quality | Cost | Needs download? |
|--------|-----------|--------------------------|---------|------|-----------------|
| **A. Browser voice** (`speechSynthesis`, Web Speech API) | The voice already built into Chrome / the device OS | Any language the device has a voice for — Telugu (`te-IN`), Hindi (`hi-IN`), English (`en-IN` / `en-US`) | Depends on the device. On Android, Google's Telugu/Hindi voices are natural. On desktop, quality varies by OS and installed language packs. | Free | **No.** Nothing to download. Works fully offline on a local file. |
| **B. Kokoro TTS** (ONNX, in-browser) | A neural TTS model that runs in the browser via ONNX Runtime Web / WebGPU (WASM fallback) | English, Hindi (+ Spanish, French, Italian, Portuguese, Japanese, Chinese). **No Telugu.** | Natural, expressive, consistent across devices. English voice `af_bella` and Hindi voices `hf_alpha` / `hf_beta` are the recommended picks. | Free (Apache-2.0) | **Yes.** Model files are large (100+ MB) and must be fetched once, then cached. See §8.3. |

### 5.2 Language routing (the core rule)

```
Book language detected (or user-picked)
        │
        ├─ Telugu  → Engine A (browser voice, te-IN)
        │            Kokoro is NEVER used for Telugu.
        ├─ Hindi   → Engine B (Kokoro, hf_alpha/hf_beta) if model ready,
        │            else Engine A (browser voice, hi-IN)
        └─ English → Engine B (Kokoro, af_bella) if model ready,
                     else Engine A (browser voice, en-IN/en-US)
```

- **Detection:** read the EPUB's `dc:language` metadata first. If missing, sample the first 500 characters of chapter 1 and detect script (Telugu script → Telugu; Devanagari → Hindi; Latin → English). Show the detected language on the book card and let the user correct it with one tap.
- **Per-chapter override:** if a book mixes languages (e.g. a Telugu novel with English dialogue), the user can set the language per chapter. The engine switches automatically at the chapter boundary.
- **Fallback chain (never fail silently):** if the chosen engine has no voice for that language on this device, the app falls back to the other engine, and if that also fails, it shows a clear message: *"No Telugu voice found on this device. Install Google Text-to-Speech Telugu voice in your phone settings, or read without audio."* It must never read Telugu text in an English voice.

### 5.3 Kokoro — how it fits in a non-hosted file
Kokoro is an **optional enhancement**, not a requirement. The app must work fully with Engine A alone.
- **First use:** if the user enables Kokoro, the app fetches the model files once from a CDN (needs internet that one time) and stores them in IndexedDB. After that, Kokoro works offline.
- **If the user never enables Kokoro:** the app never downloads anything and works entirely on the browser voice. Nothing breaks.
- **If the model files are not yet cached and there is no internet:** Kokoro options are greyed out with the reason shown. The browser voice is used instead.
- **Model files are NOT bundled inside the HTML file.** They are far too large (100+ MB) to inline. The app must not pretend otherwise.

### 5.4 Voice picker
- Lists every voice the browser reports (`speechSynthesis.getVoices()`), grouped by language, with the language tag shown (e.g. "Google తెలుగు (te-IN)").
- Lists Kokoro voices only when the Kokoro model is ready.
- Remembers the user's pick per language. If a picked voice disappears (e.g. the user changed phones), the app falls back to the best available voice for that language and says so.

### 5.5 Text preparation before speaking (both engines)
- Strip HTML tags, footnotes markers, and page numbers from the EPUB text before speaking.
- Split into sentences. Keep dialogue on its own beat (a line starting with a quote gets a short pause before it).
- Expand abbreviations the voice would misread (e.g. "Dr." → "Doctor" in English text only; never alter Telugu text).
- Numbers: read as words in the book's language where the engine supports it; otherwise leave as digits and let the engine handle them.
- Ellipsis (`...`) → a real pause. Exclamation (`!`) → a slight pitch lift (browser voice only; Kokoro ignores pitch).

---

## 6. Language handling

### 6.1 Detection
1. EPUB `dc:language` metadata. 2. Script sample of chapter 1 (Telugu / Devanagari / Latin). 3. User correction (one tap on the book card). The final choice is stored per book.

### 6.2 Minimum language promise
Telugu, Hindi and English must all work end-to-end (read + listen) on the client's Android phone with Chrome. Other languages (Spanish, French, etc.) are a bonus through Kokoro, not a promise.

### 6.3 Mixed-language books
A chapter-level language setting. The engine and voice switch at the chapter boundary with no gap the listener can hear (pre-load the next chapter's voice while the current one finishes).

---

## 7. Mood & genre narration system

### 7.1 The honest limit (read this before building)
Neither free offline engine can *perform* emotion. The browser voice and Kokoro each have a fixed voice character. Neither takes an instruction like "sound scared" or "sound funny". **What the app can change is pacing: speed, pitch, and pauses.** That is enough to create a narrator *feel*, but it is not acting. The document must not promise a performance the engines cannot give.

### 7.2 How mood works in the app
- Every chapter has a **mood tag**. A book also has a **genre**, which sets the default mood-map for its chapters.
- The narration engine reads the mood tag and applies that mood's pacing rule (table in §7.3) to every sentence in the chapter, until the mood changes.
- Mood changes are announced subtly in the audio bar ("Now: Tense") and the highlight colour shifts slightly per mood (a tint, not a shout).

### 7.3 Mood pacing rules (applied by code, not by the voice)

| Mood | Speed | Pitch (browser voice) | Pause after sentence | Pause before a reveal* | Feels like |
|------|-------|----------------------|---------------------|----------------------|------------|
| **Tense / Suspense** | 0.85× | −1 (slightly low) | 450 ms | 900 ms | A thriller narrator holding back |
| **Sad / Emotional** | 0.80× | −1 | 600 ms | 800 ms | Grief, slow and heavy |
| **Warm / Tender** | 0.95× | +0 (natural) | 400 ms | 500 ms | A memory, gentle |
| **Light / Playful** | 1.10× | +1 (slightly high) | 250 ms | 300 ms | A funny scene, breezy |
| **Scary / Horror** | 0.75× | −2 (low) | 700 ms | 1200 ms | Dread, every word landing |
| **Neutral / Narration** | 1.00× | +0 | 350 ms | 400 ms | Plain storytelling |
| **Dialogue** | 1.05× | +0 | 200 ms | — | People talking |

\* A "reveal" is a sentence the chapter marks as a turning point (see §7.5). Kokoro ignores pitch, so for Kokoro only speed and pauses apply — the mood still reads through pacing alone.

### 7.4 Genre profiles (default mood-maps)

| Genre | Default chapter mood | Reveal frequency | Base speed | Notes |
|-------|---------------------|-----------------|------------|-------|
| **Thriller / Mystery** (11:17) | Tense, with Warm for memory scenes | High — most chapter ends | 0.90× | The reference genre. Slow, low, pauses before every reveal. |
| Romance | Warm, with Sad for separations | Medium | 0.95× | Gentle, unhurried. |
| Comedy | Light / Playful | Low | 1.10× | Brisk, higher pitch. |
| Horror | Scary | High | 0.80× | Slowest, longest pauses. |
| Devotional / Spiritual | Warm, Neutral | Low | 0.90× | Calm, steady, reverent. |
| Biography | Neutral, with Sad / Warm where marked | Low | 1.00× | Clear, documentary feel. |
| Self-help / Non-fiction | Neutral | None | 1.05× | Clear and confident. |
| Children's story | Light / Playful, Warm | Medium | 1.05× | Bright, clear, simple words. |

### 7.5 Where mood tags come from
1. **Genre default:** every chapter starts with its genre's default mood.
2. **Chapter override:** the reader (or the book's preparer) can set a mood per chapter from a simple menu. This is the main control — one tap per chapter, done once.
3. **Sentence rules (automatic, no tagging needed):** a sentence ending in `!` gets a small pitch lift; `...` gets a real pause; a very short sentence after a long one gets a beat of silence before it (the classic reveal rhythm); dialogue lines get the Dialogue mood automatically.
4. **No AI tagging in v1.** Automatic mood detection by an AI model is out of scope — it needs a model and would break the zero-cost/offline promise. Manual chapter moods + sentence rules are enough for v1.

### 7.6 What 11:17 should sound like (worked example)
- **Base:** Thriller profile — 0.90×, slightly low pitch, 450 ms between sentences.
- **Chapter 1 (the 11:17 PM message arrives):** Tense throughout; 900 ms pause before the line where the message plays; Sad for the two paragraphs remembering his sister.
- **Memory scenes (her voice recordings, childhood):** Warm — pace lifts to 0.95×, pauses shorten, it feels like sunlight for a moment before the tension returns.
- **Cliffhanger chapter ends:** 1200 ms of silence after the last sentence before the "Next chapter" chime. Silence is part of the narration.
- **Never:** comedy pacing, horror whispering, or a flat documentary read. The book is a thriller about love and loss — the voice must stay inside that feeling.

---

## 8. Technical architecture

### 8.1 Single-file rule and why it is forced
The app is opened as a local file (`file://`). Chrome (and other browsers) **block a `file://` page from fetching other local files** (CORS). So:
- **All CSS and JavaScript must be inside the one HTML file** (`<style>` and `<script>` tags). No `fetch('rules.json')`, no separate `.js` or `.css` files.
- **Images** (icons, logo) must be inline SVG or base64 data-URIs.
- **Fonts:** use system fonts + a webfont only if it is fetched from a CDN on first use and cached; otherwise fall back to system fonts (Telugu renders from the device's own Telugu font).
- **Exception:** the Kokoro model files are too large to inline and are handled by the IndexedDB cache route in §5.3, never by `fetch` from a local folder.

### 8.2 Stack
| Layer | Choice | Why |
|-------|--------|-----|
| Page | Single HTML file, no framework, vanilla JS | No build step, no dependencies to break, opens anywhere. (React would need a build; the client has no build machine with him.) |
| EPUB parsing | `epub.js` (bundled inline) + JSZip | The standard for in-browser EPUB. Reads TOC, chapters, metadata, cover. |
| Browser voice | Web Speech API (`speechSynthesis`) | Built in, free, offline, works on `file://`. |
| Kokoro (optional) | Kokoro-82M ONNX via ONNX Runtime Web, WebGPU with WASM fallback | Natural neural voice, runs locally. English + Hindi only. |
| Storage | `localStorage` (settings) + `IndexedDB` (book state, bookmarks, Kokoro model cache) | Both work on `file://` in Chrome/Firefox. No server. |
| Styling | CSS variables for the three themes; no external CSS | Keeps the file self-contained. |

### 8.3 Offline honesty table
| Feature | Needs internet? | When? |
|---------|----------------|-------|
| Open & read a book | No | Never |
| Browser-voice narration | No | Never |
| Kokoro narration (first time) | **Yes, once** | To download the model files, then cached in IndexedDB |
| Kokoro narration (after first time) | No | Never |
| "Define / search online" | Yes | Only when the user taps it |
| Everything else | No | Never |

### 8.4 Performance
- Chapter text is extracted lazily (one chapter at a time), never the whole book at once — a 500-page book must not freeze the phone.
- Narration pre-loads only the next 3 sentences, not the whole chapter.
- The app must stay responsive while Kokoro is generating audio (generate in a Web Worker so the page never freezes).

---

## 9. UI design

### 9.1 Screens
1. **Home:** app title, "Open a book" button (large, central), recent books (cover, title, progress), language filter chips (All / Telugu / Hindi / English), settings gear.
2. **Reader:** top bar (book title, chapter name, theme toggle, settings), chapter drawer (left on desktop, slide-over on mobile), centre text, bottom audio bar.
3. **Audio bar (always visible while a book is open):** Play/Pause (large, thumb-sized), previous/next sentence, speed selector, voice/language label, mood indicator, progress bar with time remaining, sleep timer, bookmark button.
4. **Settings:** theme, font size, line spacing, default voice per language, Kokoro on/off, mood-following on/off, sleep timer default.

### 9.2 Design language
- Clean and calm — the book is the star, not the app. No clutter, no ads, no banners.
- Warm paper feel in Light/Sepia; true dark (not grey) in Dark mode for night reading.
- Telugu, Hindi and English text must all look equally good — test all three, not just English.
- Touch targets at least 44 px. The play button is the biggest thing on the audio bar.

### 9.3 Mobile-first
The client reads on his phone. Design for a 6-inch screen first, then let it stretch gracefully to desktop. The chapter drawer, the audio bar and the settings must all be one-thumb reachable.

---

## 10. Edge cases & fallbacks (must all be handled, not ignored)

| Situation | What the app must do |
|-----------|---------------------|
| No Telugu voice on the device | Show a clear message with how to install one (Android: Settings → Text-to-speech → Google TTS → Telugu). Offer to read without audio. Never read Telugu in an English voice. |
| Kokoro model not downloaded | Grey out Kokoro voices with the reason. Use the browser voice. |
| No internet on first Kokoro enable | Say plainly that Kokoro needs one download, and offer the browser voice now. |
| EPUB has no language metadata | Detect from script (§6.1) and let the user correct it. |
| EPUB has no TOC | Build a chapter list from the HTML files in reading order; label them "Part 1, Part 2…" |
| EPUB contains images | Show them inline in the reading pane; skip them in narration (say "image" once, then continue). |
| Very large EPUB (500+ pages) | Lazy-load chapters; never parse the whole book at open. |
| User closes the tab mid-sentence | Resume from that exact sentence on reopen. |
| Browser voice list is empty on load | Wait for the `voiceschanged` event; show "loading voices…" until then; never show an empty picker. |
| User's phone has no `te-IN` voice and no internet | Read-only mode for that book, with the install guidance. No fake narration. |
| Mixed-language chapter | Use the chapter's set language; if a single sentence is clearly another language, the app does its best with the chapter voice and does not stop. |

---

## 11. Acceptance criteria (what "done" looks like)

The build is done when **all** of these pass on the client's Android phone in Chrome, with the file opened by double-click and the phone in aeroplane mode (except the one-time Kokoro download):

1. 11:17 opens, shows its chapters, and reads in Telugu with a Telugu voice — no English-accented reading, no silence, no crash.
2. An English book narrates with Kokoro (`af_bella`) when Kokoro is ready, and with the browser voice when it is not — the switch is automatic and silent.
3. A Hindi book narrates with Kokoro Hindi (`hf_alpha`/`hf_beta`) when ready, else the browser Hindi voice.
4. A tense chapter in 11:17 plays audibly slower with longer pauses than a warm chapter, and the mood indicator shows the change.
5. Closing and reopening the file resumes at the exact sentence.
6. Speed control, play/pause, next/previous sentence, sleep timer and bookmarks all work with one thumb.
7. The file works with no internet (after the one-time Kokoro download, if Kokoro is used at all).
8. No data leaves the device — verifiable by watching network traffic: zero requests after load, except the one-time model download.
9. Light, Dark and Sepia themes are all readable; Telugu, Hindi and English text all render correctly.

---

## 12. Development roadmap

| Phase | What gets built | Done when |
|-------|----------------|-----------|
| **1 — Reader skeleton** | Single HTML file, open-book picker, epub.js chapter extraction, chapter sidebar, reader pane, Light/Dark/Sepia themes, font controls | Any EPUB opens and reads; themes switch; file is one self-contained HTML |
| **2 — Browser-voice narration** | SpeechSynthesis engine, language detection + routing, sentence splitting, highlighting + auto-scroll, play/pause/next/previous, speed control, voice picker | Telugu, Hindi and English books all narrate in the right language; highlighting follows the voice |
| **3 — Memory** | Bookmarks, auto-save/resume, recent books, sleep timer, search in book | Close and reopen resumes exactly; bookmarks persist |
| **4 — Mood system** | Genre profiles, chapter mood tags + override menu, mood pacing rules (speed/pitch/pauses), mood indicator, reveal pauses | A tense chapter sounds audibly different from a warm chapter; 11:17 Ch.1 plays as specified in §7.6 |
| **5 — Kokoro (optional)** | ONNX Runtime Web integration, first-download + IndexedDB cache, English/Hindi routing, Web Worker generation, graceful fallback when absent | English/Hindi books narrate with Kokoro when ready; app still works fully without it |
| **6 — Polish & test** | Accessibility pass (large text, contrast, keyboard), edge-case handling (§10), aeroplane-mode test, three-language test (11:17 + one Hindi + one English book) | All acceptance criteria in §11 pass |

---

## 13. Open decisions for the client

These need his word before or during the build — the developer should not guess them:

1. **Kokoro or browser-voice-only?** Kokoro gives the most natural English/Hindi, but needs a one-time ~100+ MB download and extra build work. Browser-voice-only is simpler and fully offline from minute one. Recommendation: build Phases 1–4 on the browser voice first, add Kokoro in Phase 5 only if he wants it.
2. **Who tags chapter moods?** Option A: he tags 11:17's chapters himself once (17 chapters, one tap each). Option B: the app ships with genre defaults only and he overrides as he listens. Recommendation: A for 11:17 (he knows the book), B for every other book.
3. **Default voice per language:** which browser voice should be the default for Telugu/Hindi/English on his phone? The developer can only pick after seeing what voices his phone actually has. He should open the app once and choose from the list.
4. **Sleep timer default:** 15, 30 or 60 minutes?
5. **Should the app remember the last book and open it automatically on launch, or always show Home first?**

---

## 14. What this document deliberately does NOT promise

- **No true emotional acting.** Pacing (speed/pitch/pauses) is the only emotion control free offline voices offer. A voice that laughs, whispers or weeps on cue needs a paid expressive service or a server-run model (e.g. Indic Parler-TTS with emotion descriptions) — both break the zero-cost/offline constraints.
- **No Kokoro Telugu.** Stated twice in this document so no developer wastes a day on it.
- **No cloud, no sync, no accounts.** Out of scope by design.
- **No guarantee about a specific device's voices.** The app can only use the voices the device has. The fallback messaging (§10) is part of the product, not an afterthought.

---

## 15. Client additions — voice call, 27 Nov 2026 (v3 notes)

These came directly from the client on the voice call, after v2 was written. They override or extend the sections above where they conflict.

### 15.1 Correction: the app is GLOBAL, not 11:17-specific
- The app is for **any book, any reader, anywhere**. 11:17 is only one example book the client owns.
- Do NOT design the app around 11:17. Do NOT hardcode 11:17, its genre, or its chapters into the app.
- Genre/mood defaults must work for any book. 11:17's thriller profile is one genre profile among many (§7.4), not the app's identity.

### 15.2 File types: PDF + EPUB
- The file picker must accept **both PDF and EPUB**.
- **EPUB:** opens directly in the reader. A read-aloud **Play button sits below** the text; the user taps it to listen. Reading without audio is always an option — audio is never forced.
- **PDF:** the app converts it to EPUB automatically (see §15.3), then opens it the same way as an EPUB.

### 15.3 PDF → EPUB conversion (needs internet)
- Conversion needs an **online connection**. It cannot be done fully offline inside the browser — PDF text extraction and EPUB rebuilding need a conversion step that runs online.
- Flow: user picks a PDF → app converts it to EPUB (online) → the converted EPUB opens in the reader → **read-aloud starts playing automatically** (no extra tap).
- After conversion, the converted EPUB is cached locally (IndexedDB) so it can be re-opened and listened to offline later.

### 15.4 3D page-flip animation
- Turning a page must look like a **real page turning — a 3D page-flip animation**, not a plain scroll, swipe, or instant jump.
- Applies when the user turns a page manually AND when narration reaches the end of a page (the page flips as the voice moves on).

### 15.5 Read-aloud auto-play (after PDF conversion)
- After a PDF is converted to EPUB, read-aloud starts **automatically**.
- For EPUB files opened directly, auto-play is NOT assumed — the user taps the Play button. (Client to confirm later if EPUB should also auto-play.)

### 15.6 Confirmed required features (re-stated by the client)
- **Bookmark:** required (already in v2 §4.5).
- **Voice-sync highlighting:** the exact text being spoken must be highlighted on the page, in sync with the voice, so the listener can see precisely where the voice is.
- **Voice speed control:** the listener must be able to adjust the narration speed (already in v2 §4.3 — slider/presets 0.75×–2.0×).

### 15.7 Requirements discussion — CLOSED (27 Nov 2026)
- The client confirmed on 27 Nov 2026 that every detail has been discussed and there is nothing more to add right now.
- This document is v3 FINAL. New requirements, if any, go in a future version — not in this one.

### 15.8 Large books — chapter-wise auto-detection, one chapter at a time
**The problem:** a very long book cannot be loaded all at once — the browser runs out of memory and crashes. The client's own book 11:17 is **340 pages**; loading all 340 pages in one go is not possible.
**The solution — auto-detect first, then play chapter by chapter:**
- **On open, auto-detect the book's structure before showing anything:** how many chapters there are, what each chapter is called, where the Introduction is, what comes before/after it. This scan reads only the table of contents and headings — it does NOT load chapter text.
- **Load and play one chapter at a time.** The app loads chapter 1, plays it, and only when chapter 1 finishes does it load and play chapter 2, then chapter 3, and so on. At any moment only one chapter is in memory.
- **Auto-advance:** narration flows from one chapter to the next with no tap needed, driven entirely by the auto-detected chapter list. The listener can still jump to any chapter from the sidebar, which loads just that chapter.
- **Rolling background pre-load for offline (never idle):** while the listener is on chapter 1, chapter 2 loads quietly in the background into the offline cache. The moment chapter 2 finishes loading, chapter 3 starts loading — immediately, with no idle gap. This continues one chapter at a time until the **whole book is loaded and cached offline**. The loader never sits quiet: one chapter finishes loading → the next one starts. Only the *current* chapter is held in active memory (so the browser never crashes); the finished chapters live in the offline cache (IndexedDB), ready to play without internet. If the listener jumps to a later chapter, that chapter loads first (priority), and the background queue resumes from there.
- **Progress is per chapter:** the audio bar shows "Chapter 4 of 17" and the position inside the current chapter, not a single giant progress bar for the whole book.
- This replaces any "load whole book" approach everywhere in this document (§8.4 lazy-loading is the same idea — this section makes it a hard requirement with the auto-detect step made explicit).

### 15.9 Narration order — what is read aloud, what is skipped
The table of contents exists in every book, but it is **not part of the listening experience by default**.
- **Table of Contents = read-aloud OPTIONAL.** It is shown on screen for navigation, but it is **never read aloud automatically**. If the listener wants to hear it, they can choose it. If not, it is left aside.
- **Narration opens with the book itself, in this exact order:**
  1. **Book title / heading**
  2. **Book subtitle / caption**
  3. **Author name** ("who is the author of the book")
- **Then skip the table of contents entirely** and go **directly to the main book introduction** — the "what is inside the book" content (what the book is about).
- **Then the chapters, one by one** (§15.8), in order.
- In short, the listening flow is: **Title → Subtitle → Author → Introduction → Chapter 1 → Chapter 2 → …** — the table of contents never interrupts it unless the listener explicitly asks for it.

### 15.10 Resume + bookmarks — automatic and manual
- **Position is always saved.** Wherever the listener is, the exact position (chapter + sentence) is saved continuously while listening or reading.
- **Chapter finished, then user quits:** if a chapter is completely finished and the user closes the app, the next time the app opens it continues from the **next chapter**. Everything already loaded is cached in the browser, so it picks up from there with no re-download.
- **Mid-chapter close:** if the user closes the app in the middle of a chapter (for example he has some work to do), the app must not lose his place. Two bookmark paths, both required:
  - **Auto-bookmark:** the moment the app is closed (app closed, tab closed, browser closed), a bookmark is **automatically applied at the exact spot where he left** — chapter, sentence, word.
  - **Manual bookmark:** the user can also **bookmark a spot himself** at any time (tap the bookmark button), to mark places he wants to return to.
- **On reopen:** the app takes him straight to where he left off (the auto-bookmark), with a clear "Continue from where you left off" prompt. The saved position survives closing the browser, closing the tab, and the phone restarting.
- **Auto-bookmark vs manual bookmarks are separate:** the auto-bookmark is a single "last position" marker that always moves to the newest spot; manual bookmarks are a list the user builds, which he can jump to, name, and delete.

### 15.11 UI rule — simple, sleek, minimal (client requirement)
- **The UI must be simple, sleek, and minimal.** This is a client requirement, not a preference.
- **The user must never get confused by the UI.** If a feature needs explaining, it is too complicated — simplify it or hide it.
- **Rules that follow from this:**
  - One primary action per screen: on the reader screen, the Play button is the hero; everything else is small and out of the way.
  - No more than 5 visible controls on the audio bar (play/pause, previous, next, speed, sleep timer) — everything else lives in a single settings menu.
  - Settings and advanced features (voice choice, mood, cache status) are behind one "Settings" tap, never on the main screen.
  - No pop-ups, no tutorials, no onboarding tour — the app must be usable on first open with zero instructions.
  - Text labels in plain words ("Play", "Bookmarks", "Chapters"), never jargon.
- **Enhancements must not break this rule.** Any new feature (see §15.12) must be added in a way that keeps the main screen clean — usually tucked into settings or shown only when relevant.

### 15.12 Enhancements — ALL APPROVED by the client (27 Nov 2026)
The client asked what else could enhance the app, and approved every suggestion: all six are now required.
1. **Skip back/forward 15 seconds** (podcast-style): one tap to re-hear the last line, or skip ahead. Useful when the listener misses a sentence.
2. **Chapter completion checkmarks + progress:** a tick next to finished chapters in the sidebar, and "42% of book finished" on the Home screen.
3. **Offline cache indicator:** a small line showing how much of the book is saved for offline ("12 of 17 chapters saved"), so the listener knows what works without internet.
4. **"Continue Listening" card on Home:** one tap to resume the last book at the exact spot.
5. **Time remaining per chapter:** "Chapter 4 — 12 min left" (estimated from the voice speed).
6. **Listen with the screen off:** narration keeps playing when the phone screen locks (standard audio behaviour — must be verified on Android Chrome, because the browser voice can pause when the screen sleeps).

### 15.13 Highlight effect — small bounce, letter by letter, flowing
- The voice-sync highlight (§4.3, §15.6) is not a flat colour block. The text being spoken gets a **small bounce effect** as the voice moves through it.
- **Letter by letter, layer by layer:** as the voice speaks a word, its letters pop in one after another in sequence — a gentle flowing wave across the word, like the text is alive and moving with the voice.
- **Small and subtle:** the bounce is a tiny lift (a few pixels up and back down), not a big jump. It must feel alive, never distracting — the minimal-UI rule (§15.11) still applies.
- **How it works:** the word currently being spoken is split into letter spans; each letter gets a staggered bounce (CSS animation, letters firing in order) timed to the voice's word-boundary event. When the voice moves to the next word, the bounce flows onto it.
- **Must stay in sync:** if the voice is paused, the bounce stops. If the voice speed changes, the bounce timing follows it.

### 15.14 Page direction + themes — the user decides
- **Page direction is the user's choice.** The reader picks how pages move:
  - **Vertical:** pages scroll up and down (continuous scroll).
  - **Horizontal:** pages turn sideways, one page at a time (with the 3D page-flip animation, §15.4).
  - The choice is saved, so the reader does not have to pick it every time.
- **Theme switching — 2 or 3 themes.** The reader picks the look of the page:
  1. **Book page:** warm cream/paper colour, like a real printed book page.
  2. **White page:** clean plain white page, black text.
  3. **Dark theme:** dark background, light text, for night reading.
- The theme switcher is one tap in the reader toolbar, and the choice is remembered. Themes change only the page colours and text colours — never the layout, font size, or controls.

### 15.15 Pinned header — book name + author always visible
- The reader's header is **pinned (sticky)** at the top of the screen. It never scrolls away, in any mode.
- The header always shows the **book name** and the **author name**.
- This applies in both vertical (scroll) and horizontal (page-flip) modes, and in all three themes.
- The header stays compact — one line for the title, one small line for the author — so it never eats into the reading area.
- **Why the top, not the bottom:** the bottom of the screen already holds many controls (play/pause, skip, speed, sleep timer, and more). Putting the book title and author at the bottom would be clumsy and crowded. So the title and author live in the pinned header at the top, and the bottom stays for controls only.

### 15.16 Colour palette — perfect for each theme
- **Every theme gets its own complete, perfect colour palette** — designed for that theme, not copied from another one.
- The palette covers everything: page background, text colour, highlight colour, accent colour, header, controls, and buttons.
- **Contrast is the rule:** text must always be clearly readable against its background. For example, in the dark theme the text must be light — using black font on a dark background would be the worst, unreadable. Each theme's text and background are chosen together so the contrast is always right.
- **Acceptance check:** body text in every theme must meet at least WCAG AA contrast (4.5:1). The highlight colour must stay visible on every theme's page background.
- **Built from our UI/UX learnings:** the palettes are not guessed — they follow the 60-30-10 rule and the colour/font combinations learned in the UI/UX thread (consolidated file: `~/workspace/ui-ux/Colour_Font_Combinations_and_Learnings.md`). The app's themes are built from those proven combinations.

### 15.17 Performance — minimalism, lightweight, works on any device
- **UI style is minimalism.** Clean, flat, simple. No heavy visual effects.
- **No glassmorphism, no heavy blur, no big gradients, no heavy shadows.** These effects are expensive — they make the browser crash, make loading slow, and fail on low-end phones.
- **Must work on every phone** — including low-end Android phones with little memory, not just flagship devices.
- **Must open easily and fast.** The app is used on a phone, so it must load quickly and feel instant.
- **Must be compatible with any device** — any phone, any screen size, any browser that supports the basics. Nothing in the app may depend on a high-end device.
- **The only animations allowed are the two already specified:** the 3D page-flip (§15.4) and the small letter bounce (§15.13). Both must be built with transform/opacity only (GPU-friendly), never with blur, backdrop-filter, or layout-changing properties.
- **Performance budget:** the single HTML file stays small; no heavy libraries; the app must open and show the library in under 2 seconds on a mid-range phone.

### 15.18 Developer-proposed key features — beyond the discussion (needs client approval)
The client asked the developer (Ira) to bring the main features beyond what was discussed. These are proposals only — nothing here is decided until he approves them:
1. **Tap a word → meaning (dictionary).** Tap any word while reading to see its meaning instantly. Works offline with a built-in dictionary for English, and online for other languages. This is the biggest missing reader feature — readers hit unknown words constantly.
2. **Backup & restore your library.** One tap exports the whole library (book list, bookmarks, progress, settings) to a file; one tap restores it on another phone or after the browser data is cleared. Without this, everything is lost if the browser storage is wiped — critical for a local-only app.
3. **Book time remaining.** "3 hours 20 minutes left in this book" (estimated from voice speed and remaining chapters). The audiobook standard — chapter time (§15.12) is not enough on its own.
4. **Resume recap.** When the listener returns after a day or more, the app shows the last 2 sentences they heard ("Last time you stopped here: …") so they remember where the story was.
5. **App UI in Telugu / Hindi / English.** The app's own buttons and menus switch language too — not just the books. Matches the "no language barrier" vision.
6. **Voice setup guide.** On first open, the app checks whether the phone has a Telugu/Hindi voice installed. If not, it shows exactly how to install it (one screen, step by step) — so the Telugu voice actually works instead of silently falling back to English.
7. **Storage manager.** Shows how much space each book's offline cache uses, with a delete button per book. Offline caching grows fast on a 340-page book — the user must be able to free space.

### 15.19 Developer-proposed reading features — round 2 (ALL APPROVED by the client, 27 Nov 2026, with the two-page condition in item 6)
The client asked for more — what a top developer would add beyond the client's own list. He approved all eight:
1. **Highlight + notes.** Select any passage, highlight it in a colour, and attach a personal note. All highlights and notes live in one list per book, and can be exported. This is the most-used feature in every great reader app.
2. **Page numbers — "Page 47 of 340."** Always visible while reading, with the real total page count for the book.
3. **Go to page / Go to chapter.** Type a page number or pick a chapter to jump straight there.
4. **Font choice, not just size.** Pick the reading font — a serif for the book feel, a clean sans, and a good Telugu font for Telugu books. Size alone is not enough.
5. **Focus mode.** One tap hides every control — just the text on the page. Tap again to bring everything back. Fits the minimalism rule perfectly.
6. **Two-page spread — laptop/tablet only, NOT on mobile.** On a laptop or tablet (large screen), rotating to landscape shows two pages side by side, like an open book, with the 3D flip. On a mobile phone the two-page view is NOT shown — two pages on a small screen would be cluttered and not useful. The app enables the spread only when the screen is wide enough (tablet/laptop), and stays single-page on phones.
7. **Tap a word → hear it spoken.** Companion to the dictionary (§15.18): tap a difficult word to hear its pronunciation.
8. **Per-book settings memory.** Each book remembers its own font, theme, speed, and direction — so a novel can be serif + book-page theme while a study book is sans + white.

### 15.20 Page-flip + reading continuity — the narration never breaks
- **Laptop/tablet:** two pages load automatically (two-page spread, §15.19 item 6).
- **Mobile:** one page at a time — only a single page is visible.
- **Auto-flip:** when the voice finishes reading a page, the next page flips automatically with the 3D effect (§15.4).
- **Manual flip:** the user can also flip the page themselves at any time (swipe/tap), with the same 3D effect.
- **Reading continuity is unbreakable:** the narration keeps going from exactly where it was — mid-sentence if needed — across the page turn. Turning a page must never make the reading slip, skip, restart, or lose its place. The voice, the highlight, and the bounce all continue seamlessly onto the new page. The page flip is purely visual; the narration engine and the page display are independent.
