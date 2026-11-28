/* =====================================================================
   Offline EPUB Reader — single-file app (v3, Google voices, no freezes)
   Spec: Offline_EPUB_Reader_App_Requirements.md v3 FINAL
   v3 changes (user feedback 2026-11-27):
   - Telugu voice is GOOGLE Telugu (translate_tts web endpoint), NOT Meta MMS.
     MMS is deleted entirely. Google audio plays through <audio> (no CORS
     needed for playback); a Service Worker caches it (opaque) for offline.
   - Language/voice download starts AUTOMATICALLY the moment a book is
     selected, with a progress bar at the TOP of the screen. No waiting for
     Play, no silent failure, retry with backoff, status always visible.
   - Pause works INSTANTLY at all times — controls are decoupled from
     synthesis/loading; Pause stops audio and cancels pending work at once.
   - Slow-connection design: small incremental per-sentence audio, never one
     huge model for Telugu; UI never blocks on a network fetch.
   - Telugu text is NEVER split into per-letter spans (that broke conjuncts
     into achulu/hallulu errors). Highlight is whole-word only.
   - No language list anywhere: book language is auto-detected only; the
     app UI language follows the browser. A "Languages" section manages
     offline voice downloads only (never a reading picker).
   - Real 3D page-curl turn (a leaf that lifts, curls and settles like paper).
   - Loading never hangs: visible progress, timeout + clean retry.
   - Reading text is not selectable (no native OS selection menu while
     reading); tap-a-word speaks that word.
   Kept from v2.1: Kokoro en/hi; no device voice, no speechSynthesis, no
   install dialog; stable page counter/Go; fresh upload starts at sentence 0;
   premium minimal UI with pinned header; stall fix (times/numbers as Telugu
   words, skip-on-failure); sentence prefetch; stable time-left.
   ===================================================================== */
'use strict';

/* v3.1 — the running build's version. version.json in the repo root carries
   the same number; on load the app fetches it (no-store) and, if it differs,
   shows a "New version available — Reload" banner. That is the stale-cache
   fix: a hard reload can never silently keep serving an old build. */
const APP_VERSION = '3.3.0';

/* ---------------- utilities ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms || 2600); }
function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function fmtDur(sec) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h > 0 ? h + 'h ' + m + 'm' : m + ' min'; }

/* ---------------- i18n (app chrome: English / Telugu / Hindi) ---------------- */
/* The app UI language follows the BROWSER language automatically (no picker).
   Book language is auto-detected from the book content only. */
const I18N = {
  en: { appTitle: 'Offline EPUB Reader', appSub: 'Read or listen to any book — fully offline, free, private.', openBook: '📖 Open a book', openHint: 'EPUB or PDF — the file never leaves your device.', continueListening: 'Continue listening', continue: '▶ Continue', recentBooks: 'Recent books', noBooksYet: 'No books yet. Open an EPUB or PDF to begin.', backup: '⬇ Backup library', restore: '⬆ Restore library', storage: '🗄 Storage', voices: '🔊 Voices', languages: '🌐 Languages', chapters: 'Chapters', bookmarks: 'Bookmarks', highlights: 'Highlights', searchPh: 'Search in book…', gotoPagePh: 'Page #', go: 'Go', playBelow: '▶ Read aloud', settings: 'Settings', theme: 'Theme', themeBook: 'Book page', themeWhite: 'White', themeDark: 'Dark', direction: 'Page direction', dirVertical: 'Vertical pages', dirHorizontal: 'Horizontal flip', font: 'Font', fontSerif: 'Serif (book)', fontSans: 'Sans (clean)', fontTelugu: 'Telugu', fontSize: 'Font size', lineSpacing: 'Line spacing', voice: 'Voice', genre: 'Genre', moodFollow: 'Follow mood', sleepDefault: 'Sleep timer default', off: 'Off', largeText: 'Large text', highContrast: 'High contrast', voiceNote: 'Voices in your browser — Kokoro (English/Hindi) + Google Telugu. The book\u2019s language is detected automatically; its voice downloads when you open the book.', exportHighlights: 'Export highlights', nowMood: 'Now:', mood: 'Mood', define: 'Define', hear: '🔊 Hear', highlight: '✎ Highlight', copy: 'Copy' },
  te: { appTitle: 'ఆఫ్‌లైన్ EPUB రీడర్', appSub: 'ఏ పుస్తకాన్నైనా చదవండి లేదా వినండి — పూర్తిగా ఆఫ్‌లైన్, ఉచితం, ప్రైవేట్.', openBook: '📖 పుస్తకం తెరవండి', openHint: 'EPUB లేదా PDF — ఫైల్ మీ పరికరాన్ని వదలదు.', continueListening: 'వినడం కొనసాగించండి', continue: '▶ కొనసాగించు', recentBooks: 'ఇటీవలి పుస్తకాలు', noBooksYet: 'ఇంకా పుస్తకాలు లేవు. ప్రారంభించడానికి EPUB లేదా PDF తెరవండి.', backup: '⬇ లైబ్రరీ బ్యాకప్', restore: '⬆ లైబ్రరీ పునరుద్ధరణ', storage: '🗄 నిల్వ', voices: '🔊 గొంతులు', languages: '🌐 భాషలు', chapters: 'అధ్యాయాలు', bookmarks: 'బుక్‌మార్కులు', highlights: 'హైలైట్లు', searchPh: 'పుస్తకంలో వెతకండి…', gotoPagePh: 'పేజీ #', go: 'వెళ్ళు', playBelow: '▶ బిగ్గరగా చదవండి', settings: 'సెట్టింగులు', theme: 'థీమ్', themeBook: 'పుస్తక పేజీ', themeWhite: 'తెలుపు', themeDark: 'చీకటి', direction: 'పేజీ దిశ', dirVertical: 'నిలువు పేజీలు', dirHorizontal: 'అడ్డంగా తిప్పండి', font: 'ఫాంట్', fontSerif: 'సెరిఫ్ (పుస్తకం)', fontSans: 'సాన్స్ (స్పష్టం)', fontTelugu: 'తెలుగు', fontSize: 'అక్షర పరిమాణం', lineSpacing: 'లైన్ అంతరం', voice: 'గొంతు', genre: 'శైలి', moodFollow: 'మూడ్ అనుసరించు', sleepDefault: 'స్లీప్ టైమర్', off: 'ఆపివేయి', largeText: 'పెద్ద అక్షరాలు', highContrast: 'అధిక కాంట్రాస్ట్', voiceNote: 'బ్రౌజర్‌లో గొంతులు — Kokoro (ఇంగ్లీష్/హిందీ) + Google తెలుగు. పుస్తక భాష ఆటోమేటిక్‌గా గుర్తించబడుతుంది; దాని గొంతు పుస్తకం తెరవగానే డౌన్‌లోడ్ అవుతుంది.', exportHighlights: 'హైలైట్లు ఎగుమతి', nowMood: 'ఇప్పుడు:', mood: 'మూడ్', define: 'అర్థం', hear: '🔊 వినండి', highlight: '✎ హైలైట్', copy: 'కాపీ' },
  hi: { appTitle: 'ऑफ़लाइन EPUB रीडर', appSub: 'कोई भी किताब पढ़ें या सुनें — पूरी तरह ऑफ़लाइन, मुफ़्त, निजी।', openBook: '📖 किताब खोलें', openHint: 'EPUB या PDF — फ़ाइल आपके डिवाइस से बाहर नहीं जाती।', continueListening: 'सुनना जारी रखें', continue: '▶ जारी रखें', recentBooks: 'हाल की किताबें', noBooksYet: 'अभी कोई किताब नहीं। शुरू करने के लिए EPUB या PDF खोलें।', backup: '⬇ लाइब्रेरी बैकअप', restore: '⬆ लाइब्रेरी पुनर्स्थापित करें', storage: '🗄 भंडारण', voices: '🔊 आवाज़ें', languages: '🌐 भाषाएँ', chapters: 'अध्याय', bookmarks: 'बुकमार्क', highlights: 'हाइलाइट', searchPh: 'किताब में खोजें…', gotoPagePh: 'पृष्ठ #', go: 'जाएँ', playBelow: '▶ ज़ोर से पढ़ें', settings: 'सेटिंग्स', theme: 'थीम', themeBook: 'किताब का पन्ना', themeWhite: 'सफ़ेद', themeDark: 'अंधेरा', direction: 'पन्ने की दिशा', dirVertical: 'ऊर्ध्व पृष्ठ', dirHorizontal: 'क्षैतिज पलटें', font: 'फ़ॉन्ट', fontSerif: 'सेरिफ़ (किताब)', fontSans: 'सैन्स (साफ़)', fontTelugu: 'तेलुगु', fontSize: 'अक्षर आकार', lineSpacing: 'पंक्ति अंतर', voice: 'आवाज़', genre: 'शैली', moodFollow: 'मूड का पालन करें', sleepDefault: 'स्लीप टाइमर', off: 'बंद', largeText: 'बड़े अक्षर', highContrast: 'उच्च कंट्रास्ट', voiceNote: 'ब्राउज़र में आवाज़ें — Kokoro (English/Hindi) + Google Telugu. किताब की भाषा अपने आप पहचानी जाती है; उसकी आवाज़ किताब खोलते ही डाउनलोड होती है।', exportHighlights: 'हाइलाइट निर्यात करें', nowMood: 'अभी:', mood: 'मूड', define: 'अर्थ', hear: '🔊 सुनें', highlight: '✎ हाइलाइट', copy: 'कॉपी' }
};
function browserUiLang() {
  const l = (navigator.language || 'en').toLowerCase();
  if (l.indexOf('te') === 0) return 'te';
  if (l.indexOf('hi') === 0) return 'hi';
  return 'en';
}
function t(key) { const lang = settings.uiLang || 'en'; return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
function applyI18n() {
  $$('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
  document.documentElement.lang = settings.uiLang || 'en';
}

/* ---------------- settings (localStorage) ---------------- */
const SETTINGS_KEY = 'epubreader.settings.v1';
/* v3.1 additions: align (default/left/justify), page3d (3D curl on/off),
   volumeKeys (volume keys turn pages), autoReadAloud (start narration on
   chapter open), defPreview (auto-show definition on selection),
   offlineDict (offline dictionary on/off), brightness (30–100),
   brightnessOn, nightLight. */
const defaults = { theme: 'book', direction: 'horizontal', font: 'serif', fontSize: 3, lineSpacing: 2, uiLang: 'en', genre: 'thriller', moodFollow: true, sleepDefault: 0, largeText: false, highContrast: false, align: 'default', page3d: true, volumeKeys: false, autoReadAloud: false, defPreview: true, offlineDict: true, brightness: 100, brightnessOn: false, nightLight: false, twoPage: true };
let settings = Object.assign({}, defaults);
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); settings = Object.assign({}, defaults, s); } catch (e) {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

/* ---------------- IndexedDB (book bytes + chapter cache + audio cache) ---------------- */
const DB_NAME = 'epubreader', DB_VER = 2;
let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  // v3.2 (F24): IndexedDB can be missing or blocked in some browsers. A
  // rejected promise used to be cached forever, so one failed open poisoned
  // every later storage call for the whole session. Reset on failure so a
  // later attempt can retry, and fail fast with a clear error when IDB
  // does not exist at all.
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB is not available in this browser'));
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { dbPromise = null; reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('IndexedDB open was blocked')); };
  });
  return dbPromise;
}
function idbPut(store, value) { return openDB().then(db => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = res; tx.onerror = () => rej(tx.error); })); }
function idbGet(store, key) { return openDB().then(db => new Promise((res, rej) => { const req = db.transaction(store).objectStore(store).get(key); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); })); }
function idbDelete(store, key) { return openDB().then(db => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); })); }
function idbAll(store) { return openDB().then(db => new Promise((res, rej) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error); })); }
function idbCountChapters(bookId) { return idbAll('chapters').then(all => all.filter(c => c.key.indexOf(bookId + '::') === 0).length); }
function idbClearAudioForBook(bookId) { return idbAll('audio').then(async all => { for (const r of all.filter(r => r.key.indexOf(bookId + '::') === 0)) await idbDelete('audio', r.key).catch(() => {}); }); }

/* v3.2 (F24) — book-file fallback via the Cache API. If IndexedDB cannot
   store the book (blocked / denied storage in some browsers — the v3.1 live
   test hit exactly this: the app warned "could not be saved" and Continue
   found no file), the EPUB/PDF bytes go into the Cache API instead. It is
   the same store the voice cache already uses, so it works wherever the
   voice download persists. Type/title ride in localStorage; the bytes are
   verified by reading them back, same as the IndexedDB path. */
const BOOK_CACHE = 'epubreader-books-v1';
function bookCacheKey(id) { return '/__book__/' + id; }
async function bookCachePut(id, buf) {
  const cache = await caches.open(BOOK_CACHE);
  await cache.put(new Request(bookCacheKey(id)), new Response(buf));
  const check = await cache.match(new Request(bookCacheKey(id)));
  if (!check) throw new Error('cache save did not stick');
}
async function bookCacheGet(id) {
  const cache = await caches.open(BOOK_CACHE);
  const res = await cache.match(new Request(bookCacheKey(id)));
  if (!res) return null;
  const buf = await res.arrayBuffer();
  if (!buf || !buf.byteLength) return null;
  return buf;
}
/* v3.3 (F35 — root cause): a saved book must survive a single store failing.
   v3/v3.1/v3.2 wrote the file to ONE store only (IndexedDB, else Cache API
   as a fallback) — when that one store lost the record, the book was gone
   and "Continue" broke, with no copy anywhere to recover from. Now the file
   is written to BOTH stores and each copy is verified by reading it back.
   A book is reported saved only when at least one verified copy exists. */
async function saveBookFile(meta, isPdf, buf) {
  let idbOk = false, cacheOk = false, idbErr = null, cacheErr = null;
  try {
    await idbPut('books', { id: meta.id, type: isPdf ? 'pdf' : 'epub', data: buf, title: meta.title });
    const check = await idbGet('books', meta.id);
    if (!check || !check.data) throw new Error('save did not stick');
    idbOk = true;
  } catch (e) { idbErr = e; }
  try {
    try { localStorage.setItem('epubreader.bookmeta.' + meta.id, JSON.stringify({ type: isPdf ? 'pdf' : 'epub', title: meta.title })); } catch (e2) {}
    await bookCachePut(meta.id, buf);
    const check = await bookCacheGet(meta.id);
    if (!check) throw new Error('cache save did not stick');
    cacheOk = true;
  } catch (e2) { cacheErr = e2; }
  if (idbOk || cacheOk) return { ok: true, via: idbOk && cacheOk ? 'idb+cache' : (idbOk ? 'idb' : 'cache'), idbError: idbErr, cacheError: cacheErr };
  return { ok: false, via: null, error: idbErr, cacheError: cacheErr };
}
async function loadBookFile(id) {
  const rec = await idbGet('books', id).catch(() => null);
  const buf = await bookCacheGet(id).catch(() => null);
  // v3.3 (F35): self-heal — if one store lost the file but the other still
  // has it, restore the missing copy at once so the loss never repeats.
  if (rec && rec.data && !buf) {
    bookCachePut(id, rec.data).catch(() => {});
    try { localStorage.setItem('epubreader.bookmeta.' + id, JSON.stringify({ type: rec.type || 'epub', title: rec.title || '' })); } catch (e) {}
    return rec;
  }
  if (buf) {
    let bm = null;
    try { bm = JSON.parse(localStorage.getItem('epubreader.bookmeta.' + id) || 'null'); } catch (e) {}
    if (!rec || !rec.data) {
      idbPut('books', { id, type: (bm && bm.type) || 'epub', data: buf, title: (bm && bm.title) || '' }).catch(() => {});
    }
    return { id, type: (bm && bm.type) || 'epub', data: buf, title: (bm && bm.title) || '' };
  }
  if (rec && rec.data) return rec;
  return null;
}

/* ---------------- library index (localStorage) ---------------- */
const LIB_KEY = 'epubreader.library.v1';
let library = [];
try { library = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { library = []; }
function saveLibrary() { try { localStorage.setItem(LIB_KEY, JSON.stringify(library)); } catch (e) {} }
function bookIdFor(title, author) { return 'b' + Math.abs([...(title + '|' + author)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)).toString(36); }

/* ---------------- global state ---------------- */
const state = {
  book: null,
  bookType: null,
  meta: null,
  chapters: [],
  currentChapter: 0,
  paragraphs: [],
  sentences: [],
  sentenceIndex: 0,
  playing: false,
  speaking: false,
  speed: 1,
  mood: 'neutral',
  pages: [],
  currentPage: 0,
  totalPages: 0,
  pageTotal: 0,
  pageTotalKey: '',
  pageNodes: [],      // v3.2: the chapter's display nodes in order (re-attached on every paginate)
  measureH1: null,    // v3.2: the chapter-title h1 used only for measuring page 0
  followNarration: true, // v3.2: view follows the sentence being read; a manual page turn detaches it (narration keeps going)
  cacheCount: 0,
  preloadIdx: -1,
  preloadBusy: false,
  bookmarks: [],
  highlights: [],
  completedChapters: {},
  voice: null,
  voices: [],
  sleepTimerId: null,
  sleepEndsAt: 0,
  lastSpokenAt: 0,
  avgSentenceSec: 4,
  perBook: {},
  resumeRecap: null,
  pdfPages: null,
  searchIndex: [],
};
let pauseTimer = null;
let suppressClick = false; // v3.2: a drag-curl release must not fire tap-to-hear
/* v3.2: the page height is NOT fixed — the download bar shows/hides (37px),
   the keyboard/orientation/split-screen change the viewport. Pagination is
   computed from the live page height, so a height change after paginate()
   leaves pages packed for the wrong height (v3.2 test: pages packed while
   the bar was hidden overflowed by 3px once it showed — and up to 37px).
   A ResizeObserver on the flip-wrap re-paginates whenever its size changes.
   No loop: paginate() moves text between pages, it never changes the wrap's
   own size (its content is absolutely positioned). Debounced, horizontal
   mode only — same guard as the window-resize handler. */
let flipRO = null, flipROTimer = null;
function onFlipResize() {
  if (!state.meta || settings.direction !== 'horizontal') return;
  clearTimeout(flipROTimer);
  flipROTimer = setTimeout(() => { if (state.meta && settings.direction === 'horizontal') paginate(); }, 120);
}

/* ---------------- moods & genres (spec §7) ---------------- */
const MOODS = {
  tense:   { label: 'Tense',    speed: 0.85, pitch: -1, pause: 450, reveal: 900, color: '#8a5a2b' },
  sad:     { label: 'Sad',      speed: 0.80, pitch: -1, pause: 600, reveal: 800, color: '#5b6b8c' },
  warm:    { label: 'Warm',     speed: 0.95, pitch: 0,  pause: 400, reveal: 500, color: '#b3541e' },
  light:   { label: 'Light',    speed: 1.10, pitch: 1,  pause: 250, reveal: 300, color: '#2e7d4f' },
  scary:   { label: 'Scary',    speed: 0.75, pitch: -2, pause: 700, reveal: 1200, color: '#6b2d5b' },
  neutral: { label: 'Neutral',  speed: 1.00, pitch: 0,  pause: 350, reveal: 400, color: '#666666' },
  dialogue:{ label: 'Dialogue', speed: 1.05, pitch: 0,  pause: 200, reveal: 0,   color: '#666666' },
};
const GENRES = {
  thriller:   { mood: 'tense',  base: 0.90, label: 'Thriller / Mystery' },
  romance:    { mood: 'warm',   base: 0.95, label: 'Romance' },
  comedy:     { mood: 'light',  base: 1.10, label: 'Comedy' },
  horror:     { mood: 'scary',  base: 0.80, label: 'Horror' },
  devotional: { mood: 'warm',   base: 0.90, label: 'Devotional' },
  biography:  { mood: 'neutral',base: 1.00, label: 'Biography' },
  selfhelp:   { mood: 'neutral',base: 1.05, label: 'Self-help' },
  children:   { mood: 'light',  base: 1.05, label: "Children's story" },
};
function moodOfChapter(ch) {
  if (!settings.moodFollow) return 'neutral';
  if (ch && ch.mood) return ch.mood;
  return (GENRES[settings.genre] || GENRES.thriller).mood;
}
function setMood(name, announce) {
  state.mood = MOODS[name] ? name : 'neutral';
  const m = MOODS[state.mood];
  const n = $('#moodName'); if (n) n.textContent = m.label;
  const d = $('#moodDot'); if (d) d.style.background = m.color;
  const strip = $('#moodStrip'); if (strip) strip.classList.toggle('hidden', !settings.moodFollow);
  if (announce) toast('Mood: ' + m.label);
}

/* ---------------- TTS engine (v3) ---------------- */
// English/Hindi: Kokoro-82M via kokoro-js. Synthesis runs in a Web Worker
// when possible (the UI never freezes); falls back to the main thread.
// Telugu: GOOGLE Telugu voice (translate_tts web endpoint) — clear, natural,
// no device install, no huge model. Audio plays through <audio> elements
// (media playback needs no CORS); a Service Worker caches the audio so
// repeat listens work offline. MMS is gone entirely — no Meta voice anywhere.
// NO device speechSynthesis voice is used anywhere, and no "install a voice
// on your device" dialog exists.
// PAUSE IS DECOUPLED: Play/Pause handlers are synchronous and never await
// synthesis or a download. Pause stops the audio element at once, bumps the
// tokens (cancelling every in-flight fetch/synthesis), and returns
// immediately — it works even while a voice is still loading.

const NEURAL = {
  kokoro: null, kokoroLoading: null,
  kokoroWorker: null, kokoroWorkerFailed: false, kokoroWorkerReady: null,
  kokoroWorkerSeq: 0, kokoroWorkerPending: new Map(),
  audioEl: null,                 // single <audio> for Kokoro (PCM) playback
  wordTimer: null,
  playToken: 0,                  // bump to cancel in-flight playback
  prefetch: new Map(),           // Kokoro "chapter:sentence" -> clip | Promise
  prefetchToken: 0,              // bump to cancel in-flight prefetch
  narrationToken: 0,             // bump to invalidate a stale narration loop
  consecFail: 0,
  status: '',
  statusLang: null,              // v3.3 (F36): the language a status belongs to — a Kokoro (en) error must never show on a Telugu/Hindi book
  abortCtl: null,                // aborts the in-flight Google fetch
};
const SYNTH_TIMEOUT_MS = 45000;
const KOKORO_LOAD_TIMEOUT_MS = 300000; // v3.3 (F33): the Kokoro model is ~92 MB — a 45 s budget can never cover a first download on a slow connection. Loads get 5 min; only synthesis keeps the 45 s budget.
const PREFETCH_AHEAD = 2;
const MAX_CHUNK_CHARS = 180;
const MAX_CONSEC_FAIL = 3;
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_VOICES = {
  // v3.3 (F32): Kokoro is English-only. kokoro-js 1.2.1's voice list has no
  // Hindi voices (hf_alpha/hf_beta are not in it) and its phonemizer is
  // English-only, so Hindi uses Google TTS instead. Do not re-add Hindi
  // voices here — they cannot play through kokoro-js.
  en: ['af_bella', 'af_heart', 'af_sky', 'am_adam', 'am_michael'],
};
const KOKORO_SAMPLE_RATE = 24000;
/* Google Telugu: per-sentence audio, small and incremental. One sentence is
   ~10–30 KB — it downloads in seconds even on a slow connection, unlike a
   115 MB model that never finishes. */
const GT_CHUNK_CHARS = 150;
const GT_MIN_GAP_MS = 300;        // throttle between Google requests (no 403)
const GT_FETCH_TIMEOUT_MS = 20000; // v3.1: fail a hung sentence in 20s (was 60s). On a slow-but-working link canplaythrough fires well before this; only a dead/hung link waits it out, and the bar must not sit at 0% for minutes.
const GT_CHARS_PER_SEC = 10.5;    // measured: ~130 chars -> ~11.4s of audio
let gtLastFetchAt = 0;

function langCode(lang) { return (lang || 'en').toLowerCase().slice(0, 2); }
function neuralVoiceFor(lang) {
  // v3.3 (F32): Kokoro is English-only now — Hindi uses Google TTS (see
  // synthesizeNeural). kokoro-js 1.2.1 has no Hindi voice in its list.
  return 'af_bella';
}
function hasVoiceFor(lang) { return ['en', 'hi', 'te'].indexOf(langCode(lang)) >= 0; }
function neuralAudioEl() {
  if (!NEURAL.audioEl) {
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    document.body.appendChild(a);
    NEURAL.audioEl = a;
  }
  return NEURAL.audioEl;
}
function floatToWavBlob(samples, sampleRate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wstr(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------------- top download bar (v3) ---------------- */
/* One slim bar pinned to the very TOP of the screen. It shows what is
   downloading (voice / chapter audio) and its progress, so the user never
   has to hunt in Settings — and never wonders whether anything is happening. */
const DL = { active: false, label: '', done: 0, total: 0, lastPaint: 0 };
function setDlProgress(label, done, total) {
  const bar = $('#dlBar'); if (!bar) return;
  DL.active = true; DL.label = label || ''; DL.done = done || 0; DL.total = total || 0;
  const now = performance.now();
  if (now - DL.lastPaint < 150 && done < total) return; // throttle DOM writes
  DL.lastPaint = now;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  $('#dlLabel').textContent = label + (total > 0 ? ' — ' + done + '/' + total : '');
  $('#dlFill').style.width = pct + '%';
  $('#dlPct').textContent = pct + '%';
  bar.classList.remove('hidden');
}
function setDlMessage(label, pct) {
  const bar = $('#dlBar'); if (!bar) return;
  DL.active = true; DL.label = label || '';
  $('#dlLabel').textContent = label;
  // pct is the HONEST progress (a failure message must not show a full bar)
  $('#dlFill').style.width = (pct != null ? clamp(pct, 0, 100) : 100) + '%';
  $('#dlPct').textContent = pct != null ? Math.round(pct) + '%' : '';
  bar.classList.remove('hidden');
}
function hideDlBar() {
  const bar = $('#dlBar'); if (!bar) return;
  DL.active = false;
  bar.classList.add('hidden');
}
// v3.3 (F36): a voice error belongs to ONE language. setNeuralStatus takes
// the language it is about; updateAudioBar only shows it for a book in that
// language, so a Kokoro (English) failure never haunts a Telugu/Hindi book.
function setNeuralStatus(msg, lang) {
  NEURAL.status = msg || '';
  NEURAL.statusLang = msg ? (langCode(lang || '') || null) : null;
  const n = $('#kokoroNote');
  if (n) n.textContent = msg || 'Voices in your browser — Kokoro (English) + Google Telugu/Hindi. The book\u2019s language is detected automatically; its voice downloads when you open the book.';
  updateVoicePanel();
  updateAudioBar();
}

/* ---------------- Kokoro in a Web Worker (v3) ---------------- */
/* Synthesis runs off the main thread so the UI never freezes while Kokoro
   thinks. If the worker cannot start or fails, the main thread takes over
   (v2.1 behaviour) — the app keeps working either way. */
const KOKORO_WORKER_SRC = `
let model = null;
self.onmessage = async function (e) {
  var d = e.data || {};
  try {
    if (d.type === 'load') {
      var mod = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
      model = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8', device: 'wasm',
        progress_callback: function (p) { try { self.postMessage({ type: 'progress', loaded: p.loaded || 0, total: p.total || 0 }); } catch (err) {} }
      });
      self.postMessage({ type: 'loaded', id: d.id });
    } else if (d.type === 'synth') {
      if (!model) throw new Error('kokoro not loaded');
      var audio = await model.generate(d.text, { voice: d.voice, speed: d.speed || 1 });
      var arr = audio.audio;
      self.postMessage({ type: 'audio', id: d.id, audio: arr, sampling_rate: audio.sampling_rate }, [arr.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: d.id, error: String((err && err.message) || err) });
  }
};
`;
function kokoroWorkerStart() {
  if (NEURAL.kokoroWorkerFailed) return null;
  if (NEURAL.kokoroWorker) return NEURAL.kokoroWorker;
  try {
    const blob = new Blob([KOKORO_WORKER_SRC], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url, { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'progress') { setDlProgress('Downloading Kokoro voice', d.loaded || 0, d.total || 0); return; }
      const p = NEURAL.kokoroWorkerPending.get(d.id);
      if (!p) return;
      NEURAL.kokoroWorkerPending.delete(d.id);
      if (d.type === 'error') p.reject(new Error(d.error || 'worker error'));
      else if (d.type === 'loaded') p.resolve(true);
      else if (d.type === 'audio') p.resolve({ samples: d.audio, sampleRate: d.sampling_rate || KOKORO_SAMPLE_RATE });
    };
    w.onerror = () => kokoroWorkerFail(new Error('Kokoro worker error'));
    NEURAL.kokoroWorker = w;
    return w;
  } catch (e) {
    NEURAL.kokoroWorkerFailed = true;
    return null;
  }
}
function kokoroWorkerFail(err) {
  NEURAL.kokoroWorkerFailed = true;
  NEURAL.kokoroWorkerReady = null;
  NEURAL.kokoroWorkerPending.forEach(p => p.reject(err || new Error('Kokoro worker failed')));
  NEURAL.kokoroWorkerPending.clear();
  if (NEURAL.kokoroWorker) { try { NEURAL.kokoroWorker.terminate(); } catch (e) {} NEURAL.kokoroWorker = null; }
}
function kokoroWorkerCall(msg, timeoutMs) {
  const w = kokoroWorkerStart();
  if (!w) return Promise.reject(new Error('worker unavailable'));
  const id = ++NEURAL.kokoroWorkerSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      NEURAL.kokoroWorkerPending.delete(id);
      reject(new Error('Kokoro worker timed out'));
    }, timeoutMs || 60000);
    NEURAL.kokoroWorkerPending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    try { w.postMessage(Object.assign({ id }, msg)); }
    catch (e) { NEURAL.kokoroWorkerPending.delete(id); clearTimeout(timer); reject(e); }
  });
}
async function ensureKokoroWorker() {
  if (NEURAL.kokoroWorkerReady) return NEURAL.kokoroWorkerReady;
  NEURAL.kokoroWorkerReady = (async () => {
    await kokoroWorkerCall({ type: 'load' }, KOKORO_LOAD_TIMEOUT_MS);
    return true;
  })().catch(err => {
    kokoroWorkerFail(err);
    NEURAL.kokoroWorkerReady = null;
    throw err;
  });
  return NEURAL.kokoroWorkerReady;
}
async function ensureKokoro(progressCb) {
  if (NEURAL.kokoro) return NEURAL.kokoro;
  if (NEURAL.kokoroLoading) return NEURAL.kokoroLoading;
  setNeuralStatus('Downloading Kokoro voice… (one-time, about 90 MB)', 'en');
  NEURAL.kokoroLoading = (async () => {
    const mod = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
    const KokoroTTS = mod.KokoroTTS;
    const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype: 'q8',
      device,
      progress_callback: progressCb || null,
    });
    NEURAL.kokoro = tts;
    setNeuralStatus('');
    return tts;
  })().catch(err => {
    NEURAL.kokoroLoading = null;
    setNeuralStatus('Kokoro voice could not load — connect to the internet once to download it.', 'en');
    throw err;
  });
  return NEURAL.kokoroLoading;
}
// v3.3 (F33): a voice that PLAYS is a voice that is DOWNLOADED — mark it, so
// the Languages panel and the one-time-loading rule see the truth after a
// reload and after opening a different book in the same language.
function markKokoroDownloaded(voice) {
  const code = voice === 'af_bella' ? 'en' : null;
  if (!code) return;
  try {
    const st = langDlState(); st[code] = { downloaded: true, at: Date.now() }; saveLangDlState(st);
  } catch (e) {}
}
// v3.3 (F33 / one-time loading): a sentence that ACTUALLY PLAYS proves its
// voice is downloaded — mark it here, in the narration loop, not only inside
// the synth function. The synth path varies (worker, main thread, or a
// stubbed synth in tests), but a played sentence is the one signal that is
// true on every path. Without this, a voice that played fine still showed
// "Not downloaded" after a reload and re-downloaded on the next book.
function markLanguageDownloaded(lang) {
  const code = langCode(lang);
  if (!code) return;
  try {
    const st = langDlState(); st[code] = { downloaded: true, at: Date.now() }; saveLangDlState(st);
  } catch (e) {}
}
async function synthesizeKokoro(text, voice, rate, cancelled) {
  if (!NEURAL.kokoroWorkerFailed) {
    try {
      await withTimeout(ensureKokoroWorker(), KOKORO_LOAD_TIMEOUT_MS, 'load Kokoro voice');
      const res = await kokoroWorkerCall({ type: 'synth', text, voice, speed: rate }, SYNTH_TIMEOUT_MS);
      if (cancelled && cancelled()) throw new Error('cancelled');
      markKokoroDownloaded(voice);
      return res;
    } catch (e) {
      if (cancelled && cancelled()) throw e;
      // v3.3 (F32/F33): a SYNTH failure must NEVER kill the worker. The old
      // code called kokoroWorkerFail() here, so one bad voice (Hindi's
      // 'Voice "hf_alpha" not found') terminated the worker and poisoned
      // EVERY Kokoro voice for the session. A synth failure just falls
      // through to the main thread; only a worker LOAD failure poisons it.
      console.warn('Kokoro worker synth failed, trying main thread:', e);
    }
  }
  let tts;
  // v3.3 (F33): the model is ~92 MB — a 45 s budget can never cover a first
  // download on a slow connection. The load gets the long budget; only the
  // synthesis itself keeps the 45 s budget.
  try { tts = await withTimeout(ensureKokoro(), KOKORO_LOAD_TIMEOUT_MS, 'load Kokoro voice'); }
  catch (e) { const err = new Error('Voice needs one download — connect to the internet once, then it works offline.'); err.voiceLoadFailed = true; throw err; }
  if (cancelled && cancelled()) throw new Error('cancelled');
  const audio = await withTimeout(tts.generate(text, { voice, speed: rate }), SYNTH_TIMEOUT_MS, 'synthesize Kokoro');
  markKokoroDownloaded(voice);
  return { samples: audio.audio, sampleRate: audio.sampling_rate || KOKORO_SAMPLE_RATE };
}

/* ---------------- Google Telugu voice (v3) ---------------- */
/* Clear, natural Google Telugu via the translate_tts web endpoint.
   Playback uses <audio> elements (media playback needs no CORS), and a
   pool of audio elements pre-buffers the next sentences so playback is
   smooth. A Service Worker (sw.js) caches the audio so repeat listens work
   offline; if the worker is not active the audio still plays direct. */
function googleTtsUrl(text, lang) {
  const params = new URLSearchParams({ ie: 'UTF-8', tl: langCode(lang) === 'hi' ? 'hi' : 'te', client: 'tw-ob', total: '1', idx: '0', textlen: String(text.length), q: text });
  return 'https://translate.google.com/translate_tts?' + params.toString();
}
function gtEstimateSec(text) {
  const n = String(text || '').length;
  return Math.max(0.6, n / GT_CHARS_PER_SEC);
}
/* Pool of <audio> elements for Google playback + pre-buffering. The element
   that pre-buffered a sentence is the one that plays it, so the buffered
   data is actually reused (the browser does not HTTP-cache this endpoint). */
const GT_POOL = [];
function gtPoolEl() {
  let slot = GT_POOL.find(s => !s.busy);
  if (!slot) {
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    /* v3.1 ROOT CAUSE FIX: Google Translate TTS returns HTTP 404 when the
       request carries a non-Google Referer (verified: no Referer -> 200,
       Referer: <our github.io origin> -> 404). A plain <audio> element
       sends the page origin as Referer, so EVERY Google voice load failed
       and the download sat at 0% forever. Sending no Referer fixes it.
       (The Service Worker also strips Referer, but it only controls the
       page after install — the first load goes direct, so this is the fix
       that actually matters.) */
    a.referrerPolicy = 'no-referrer';
    a.setAttribute('referrerpolicy', 'no-referrer');
    document.body.appendChild(a);
    slot = { el: a, key: '', busy: false };
    GT_POOL.push(slot);
  }
  return slot;
}
function gtAudioFor(key, url) {
  let slot = GT_POOL.find(s => s.key === key);
  if (slot) {
    // v3.2: a RELEASED slot has no src (gtRelease removes it) — reusing it
    // without re-setting src leaves an element that can never load, so
    // gtPrepare waits the whole 20s timeout for events that never fire
    // (and the narration looks frozen). Re-attach the URL whenever the
    // element has nothing to load, or a different URL than it last had.
    if (!slot.el.currentSrc || slot.url !== url) {
      slot.url = url;
      slot.justLoaded = true; // a fresh load just started — any error on the
      slot.el.src = url;      // element is stale, from the previous URL
      try { slot.el.load(); } catch (e) {}
    }
    return slot;
  }
  slot = gtPoolEl();
  slot.key = key;
  slot.url = url;
  slot.justLoaded = true;
  slot.busy = true;
  slot.el.src = url;
  try { slot.el.load(); } catch (e) {}
  return slot;
}
function gtRelease(slot) {
  if (!slot) return;
  slot.busy = false;
  slot.key = '';
  slot.url = '';
  slot.justLoaded = false;
  try { slot.el.removeAttribute('src'); slot.el.load(); } catch (e) {}
}
function gtReleaseAll() {
  GT_POOL.forEach(s => { try { s.el.pause(); } catch (e) {} gtRelease(s); });
}
function gtSentenceKey(chapter, idx) { return (state.meta ? state.meta.id : 'x') + '::' + chapter + '::' + idx; }
/* Prepare (buffer) one Google sentence in the background. Resolves true
   when the audio is buffered enough to play, false on failure. Never throws
   for a single sentence — the caller decides what a failure means. */
/* v3.1: resolves true (buffered), false (fast error — worth one retry), or
   'timeout' (the load HUNG — no data at all; retrying a hung link just burns
   time, so the caller does NOT retry a timeout). GT_FETCH_TIMEOUT_MS is
   12s: on a slow-but-working link canplaythrough fires well before that
   (the browser only needs a few KB buffered); only a dead/hung link waits
   the whole timeout. */
/* v3.2: resolves a STRICT boolean — true (buffered) or false (failed).
   v3.1 resolved the string 'timeout' when a load hung with no data, and
   'timeout' is truthy: the download bar counted hung sentences as buffered
   (0→13/26 with possibly zero audio bytes) AND playClip tried to play an
   element with no audio, hanging on play() forever. A hung load is a
   failure, never a success. GT_LAST_FAIL tells the caller WHY it failed:
   'error' (fast failure — worth one retry) or 'timeout' (hung link — do
   not retry, it just burns ~20s per sentence). */
let GT_LAST_FAIL = '';
function gtPrepare(key, text, lang) {
  const url = googleTtsUrl(text, lang);
  const slot = gtAudioFor(key, url);
  const a = slot.el;
  const justLoaded = slot.justLoaded; // a fresh load just started on this element
  slot.justLoaded = false;
  if (a.readyState >= 3) return Promise.resolve(true); // already buffered
  // v3.2: an element that ALREADY failed for THIS url (error set, or
  // NETWORK_NO_SOURCE) will never fire canplaythrough/error again — resolve
  // false at once instead of waiting the whole timeout for events that
  // cannot come. But when a fresh load just started, any error on the
  // element is stale from the PREVIOUS url — wait for the new load's own
  // outcome instead of failing fast on the old error.
  if (!justLoaded && (a.error || a.networkState === 3)) { GT_LAST_FAIL = 'error'; return Promise.resolve(false); }
  return new Promise(resolve => {
    let done = false;
    let timer = null;
    const finish = v => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.removeEventListener('canplaythrough', onOk);
      a.removeEventListener('error', onErr);
      resolve(v);
    };
    const onOk = () => finish(true);
    const onErr = () => { GT_LAST_FAIL = 'error'; finish(false); };
    a.addEventListener('canplaythrough', onOk);
    a.addEventListener('error', onErr);
    timer = setTimeout(() => { GT_LAST_FAIL = 'timeout'; finish(false); }, GT_FETCH_TIMEOUT_MS);
  });
}
/* Play one prepared Google sentence through its pooled audio element.
   Resolves true when it ends, false if cancelled. Never hangs: a watchdog
   resolves it from the real duration (or the estimate) if 'ended' never fires. */
async function gtPlay(slot, text, rate, token) {
  const a = slot.el;
  const est = gtEstimateSec(text);
  const dur = (a.duration && isFinite(a.duration) && a.duration > 0) ? a.duration : est;
  const playDur = dur / clamp(rate, 0.5, 2);
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const perWord = words.length ? playDur / words.length : playDur;
  clearTimeout(NEURAL.wordTimer);
  let wi = -1;
  const startAt = performance.now();
  const tick = () => {
    if (token !== NEURAL.playToken) return;
    const elapsed = (performance.now() - startAt) / 1000;
    const idx = Math.min(words.length - 1, Math.floor(elapsed / Math.max(0.05, perWord)));
    if (idx !== wi && idx >= 0) { wi = idx; markWordByIndex(idx); }
    if (elapsed < playDur + 0.2) NEURAL.wordTimer = setTimeout(tick, 60);
  };
  NEURAL.wordTimer = setTimeout(tick, 30);
  a.playbackRate = clamp(rate, 0.5, 2);
  try {
    // v3.2: play() can pend FOREVER on an element with no data (or reject
    // under autoplay policy). v3.1 awaited it with no timeout, so the whole
    // narration hung at sentence 0 — Pause icon stuck, counter frozen at
    // 0/26, no error anywhere. Race it: 8s is far past any healthy start.
    const p = a.play();
    if (p && p.catch) p.catch(() => {}); // never an unhandled rejection
    await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('play() timed out')), 8000))]);
  } catch (e) {
    clearTimeout(NEURAL.wordTimer);
    try { a.pause(); } catch (e2) {} // a late-resolving play() must not blip audio later
    console.warn('gtPlay: play() failed —', e && e.name ? e.name + ': ' + e.message : e);
    return false;
  }
  const finished = await new Promise(res => {
    let done = false;
    let watchdog = null;
    const finish = v => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
      res(v);
    };
    const onEnd = () => finish(true);
    const onErr = () => finish(false);
    watchdog = setTimeout(() => finish(true), Math.max(4000, (playDur + 10) * 1000));
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
  });
  clearTimeout(NEURAL.wordTimer);
  if (token !== NEURAL.playToken) return false;
  return finished;
}

/* ---------------- unified synthesis + playback ---------------- */
/* A "clip" is what one sentence becomes before it is played:
   - Kokoro: {format:'pcm', samples, sampleRate, duration}
   - Google: {format:'gt', slot, text, duration} (slot = pooled <audio>) */
async function synthesizeNeural(text, lang, opts) {
  opts = opts || {};
  const clean = sanitizeForSpeech(text, lang);
  if (!hasSpeakable(clean)) return { empty: true };
  if (langCode(lang) === 'te' || langCode(lang) === 'hi') {
    // v3.3 (F32): Google voice for Telugu AND Hindi. Kokoro cannot speak
    // Hindi — kokoro-js 1.2.1's voice list has 28 voices and zero Hindi
    // (no hf_alpha/hf_beta), and its phonemizer is English-only, so every
    // Hindi synth threw 'Voice "hf_alpha" not found'. Google Hindi is a
    // natural voice on the same proven audio-element pipeline as Telugu.
    // (One audio element per chunk; chunks play back to back.)
    const chunks = chunkForSpeech(clean, GT_CHUNK_CHARS);
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
      const key = gtSentenceKey(state.currentChapter, state.sentenceIndex) + '::c' + i;
      const slot = gtAudioFor(key, googleTtsUrl(chunks[i], lang));
      parts.push({ slot, text: chunks[i], duration: gtEstimateSec(chunks[i]) });
      // buffer this chunk now (the narration loop waits for it below)
      const ok = await gtPrepare(key, chunks[i], lang);
      if (!ok) { /* a failed chunk is retried on demand by the caller */ }
      if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
    }
    const duration = parts.reduce((a, p) => a + p.duration, 0);
    return { format: 'gt', parts, duration };
  }
  // Kokoro (English/Hindi)
  const voice = neuralVoiceFor(lang);
  const rate = opts.rate || 1;
  const chunks = chunkForSpeech(clean, MAX_CHUNK_CHARS);
  const parts = [];
  let sampleRate = KOKORO_SAMPLE_RATE;
  for (const chunk of chunks) {
    if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
    const res = await synthesizeKokoro(chunk, voice, rate, opts.cancelled);
    parts.push(res.samples);
    sampleRate = res.sampleRate || sampleRate;
    if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
  }
  let total = 0;
  parts.forEach(a => { total += a.length; });
  const merged = new Float32Array(total);
  let off = 0;
  parts.forEach(a => { merged.set(a, off); off += a.length; });
  return { format: 'pcm', samples: merged, sampleRate, duration: total / sampleRate };
}
async function playClip(clip, lang, opts) {
  opts = opts || {};
  const token = ++NEURAL.playToken;
  const rate = opts.rate || 1;
  if (clip.format === 'gt') {
    let allOk = true;
    for (const part of clip.parts) {
      if (token !== NEURAL.playToken) return false;
      // make sure this chunk is buffered before playing it
      const ready = await gtPrepare(part.slot.key, part.text, lang);
      if (!ready) { allOk = false; break; }
      if (token !== NEURAL.playToken) return false;
      const ok = await gtPlay(part.slot, part.text, rate, token);
      gtRelease(part.slot);
      if (!ok) return false;
    }
    return allOk;
  }
  // Kokoro PCM path (v2.1 behaviour, unchanged)
  const samples = clip.samples, sampleRate = clip.sampleRate;
  const blob = floatToWavBlob(samples, sampleRate);
  const url = URL.createObjectURL(blob);
  const a = neuralAudioEl();
  const duration = samples.length / sampleRate;
  const playDur = duration;
  const words = String(opts.text || '').split(/\s+/).filter(Boolean);
  const perWord = words.length ? playDur / words.length : playDur;
  clearTimeout(NEURAL.wordTimer);
  let wi = -1;
  const startAt = performance.now();
  const tick = () => {
    if (token !== NEURAL.playToken) return;
    const elapsed = (performance.now() - startAt) / 1000;
    const idx = Math.min(words.length - 1, Math.floor(elapsed / Math.max(0.05, perWord)));
    if (idx !== wi && idx >= 0) { wi = idx; markWordByIndex(idx); }
    if (elapsed < playDur + 0.2) NEURAL.wordTimer = setTimeout(tick, 60);
  };
  NEURAL.wordTimer = setTimeout(tick, 30);
  try {
    a.playbackRate = 1;
    a.src = url;
    // v3.2 (shared with the Google path): play() can pend forever or reject
    // under autoplay policy — race it, or Kokoro EN/HI hangs exactly like
    // Google Telugu did (counter frozen, no error). A failed play returns
    // false so the narration skips the line instead of halting silently.
    const p = a.play();
    if (p && p.catch) p.catch(() => {}); // never an unhandled rejection
    await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('play() timed out')), 8000))]);
  } catch (e) {
    clearTimeout(NEURAL.wordTimer);
    try { a.pause(); } catch (e2) {} // a late-resolving play() must not blip audio later
    console.warn('playClip (Kokoro): play() failed —', e && e.name ? e.name + ': ' + e.message : e);
    URL.revokeObjectURL(url);
    return false;
  }
  const finished = await new Promise(res => {
    let done = false;
    let watchdog = null;
    const finish = v => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
      res(v);
    };
    const onEnd = () => finish(true);
    const onErr = () => finish(false);
    watchdog = setTimeout(() => finish(true), Math.max(3000, (playDur + 8) * 1000));
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
  });
  clearTimeout(NEURAL.wordTimer);
  URL.revokeObjectURL(url);
  if (token !== NEURAL.playToken) return false;
  return finished;
}
/* One-off speech (selection "hear", tap-to-hear): synthesize then play. */
async function speakNeural(text, lang, opts) {
  opts = opts || {};
  const tokenBefore = NEURAL.playToken;
  const res = await synthesizeNeural(text, lang, opts);
  if (res.empty) return true;
  if (tokenBefore !== NEURAL.playToken) return false;
  return playClip(res, lang, { rate: opts.rate || 1, text });
}
/* Prefetch: prepare upcoming sentences in the background while the current
   one plays, so playback is continuous instead of speak-then-wait. For
   Google that means buffering the next sentences' audio elements; for
   Kokoro it means synthesizing them ahead. A single bad line is dropped. */
function prefetchKey(chapter, idx) { return chapter + ':' + idx; }
function cancelPrefetch() {
  NEURAL.prefetchToken++;
  NEURAL.prefetch.clear();
}
async function prefetchFrom(startIdx) {
  const myToken = NEURAL.prefetchToken;
  const chapter = state.currentChapter;
  const lang = state.meta ? state.meta.language : 'en';
  const rate = effectiveRate();
  for (let k = 0; k < PREFETCH_AHEAD; k++) {
    const idx = startIdx + k;
    if (idx >= state.sentences.length) break;
    if (myToken !== NEURAL.prefetchToken || chapter !== state.currentChapter || !state.playing) return;
    const s = state.sentences[idx];
    if (!s || s.image) continue;
    if (langCode(lang) === 'te') {
      // Google: buffer the sentence's chunks ahead (cheap, async, off-thread)
      const clean = sanitizeForSpeech(s.text, lang);
      if (!hasSpeakable(clean)) continue;
      const chunks = chunkForSpeech(clean, GT_CHUNK_CHARS);
      for (let i = 0; i < chunks.length; i++) {
        const key = gtSentenceKey(chapter, idx) + '::c' + i;
        gtAudioFor(key, googleTtsUrl(chunks[i], lang));
      }
      continue;
    }
    const key = prefetchKey(chapter, idx);
    if (NEURAL.prefetch.has(key)) continue;
    const cancelled = () => myToken !== NEURAL.prefetchToken || chapter !== state.currentChapter;
    try {
      const p = synthesizeNeural(s.text, lang, { rate, cancelled });
      NEURAL.prefetch.set(key, p);
      const res = await p;
      if (cancelled() || !state.playing) { NEURAL.prefetch.delete(key); return; }
      NEURAL.prefetch.set(key, res);
    } catch (e) {
      NEURAL.prefetch.delete(key);
    }
    if (myToken !== NEURAL.prefetchToken || chapter !== state.currentChapter || !state.playing) return;
  }
}
/* PAUSE / STOP — synchronous, instant, never awaits anything. This is what
   makes the Play/Pause buttons respond within a tap even while a voice is
   loading, downloading, or synthesizing (v2.1 froze here on a slow link). */
function stopNeural() {
  NEURAL.playToken++;
  NEURAL.narrationToken++;
  cancelPrefetch();
  clearTimeout(NEURAL.wordTimer);
  if (NEURAL.abortCtl) { try { NEURAL.abortCtl.abort(); } catch (e) {} NEURAL.abortCtl = null; }
  gtReleaseAll();
  const a = NEURAL.audioEl;
  if (a) { try { a.pause(); } catch (e) {} a.removeAttribute('src'); try { a.load(); } catch (e) {} }
}
/* Highlight the word at (0-based) index inside the currently speaking
   sentence. v3: the WHOLE word gets the bounce — the word is one intact
   text node, never split into per-letter spans, so Telugu conjuncts and
   vowel signs render exactly as the shaping engine intends. */
function markWordByIndex(idx) {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  const node = paraElements().find(n => Number(n.dataset.para) === s.paraIdx);
  if (!node) return;
  const sent = node.querySelector('.sentence');
  if (!sent) return;
  const wEls = sent.querySelectorAll('.w');
  const target = wEls[idx];
  if (!target) return;
  if (target.classList.contains('on')) return;
  sent.querySelectorAll('.w.on').forEach(w => w.classList.remove('on'));
  target.classList.add('on');
}

/* ---------------- language detection (spec §6.1) ---------------- */
function detectScriptLang(text) {
  if (!text) return 'en';
  let te = 0, hi = 0, lat = 0;
  for (const ch of text.slice(0, 2000)) {
    const c = ch.codePointAt(0);
    if (c >= 0x0C00 && c <= 0x0C7F) te++;
    else if (c >= 0x0900 && c <= 0x097F) hi++;
    else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) lat++;
  }
  if (te > hi && te > lat) return 'te';
  if (hi > te && hi > lat) return 'hi';
  return 'en';
}
function normaliseLang(raw) {
  if (!raw) return null;
  const l = String(raw).toLowerCase();
  if (l.indexOf('te') === 0 || l.indexOf('telugu') >= 0) return 'te';
  if (l.indexOf('hi') === 0 || l.indexOf('hindi') >= 0) return 'hi';
  if (l.indexOf('en') === 0 || l.indexOf('english') >= 0) return 'en';
  return null;
}

/* ---------------- sentence splitting (Telugu danda + English + Hindi) ---------------- */
function splitSentences(text) {
  if (!text) return [];
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const re = /[^.!?।…]+(?:[.!?।…]+["'”’)\]]*)?/g;
  const out = [];
  let m;
  while ((m = re.exec(clean)) !== null) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out.length ? out : [clean];
}
function isDialogue(s) { return /^["'“‘]/.test(s.trim()) || /["'“”]/.test(s.trim().slice(0, 3)); }
function sentenceMood(s, chapterMood, prevLen) {
  if (isDialogue(s)) return 'dialogue';
  return chapterMood;
}
function isReveal(s, prevLen) {
  return prevLen > 120 && s.length < 40;
}

/* ---------------- text preparation before speaking (spec §5.5) ---------------- */
function prepForSpeech(text, lang) {
  let s = String(text || '');
  s = s.replace(/\[image\]/gi, ' ');
  s = s.replace(/\[\d+\]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (langCode(lang) === 'en') {
    s = s.replace(/\bDr\./g, 'Doctor').replace(/\bMr\./g, 'Mister').replace(/\bMrs\./g, 'Missus').replace(/\bSt\./g, 'Saint');
  }
  return s;
}
const TE_DIGITS = ['సున్నా', 'ఒకటి', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది'];
const TE_TENS = { 10: 'పది', 11: 'పదకొండు', 12: 'పన్నెండు', 13: 'పదమూడు', 14: 'పద్నాలుగు', 15: 'పదిహేను', 16: 'పదహారు', 17: 'పదిహేడు', 18: 'పద్దెనిమిది', 19: 'పందొమ్మిది', 20: 'ఇరవై', 30: 'ముప్పై', 40: 'నలభై', 50: 'యాభై', 60: 'అరవై' };
function teNumber(n) {
  if (n < 10) return TE_DIGITS[n];
  if (TE_TENS[n]) return TE_TENS[n];
  const t = Math.floor(n / 10) * 10, o = n % 10;
  return (TE_TENS[t] || String(t)) + (o ? ' ' + TE_DIGITS[o] : '');
}
function teTime(h, m) {
  let out = teNumber(h) + ' గంటల';
  if (m) out += ' ' + teNumber(m) + ' నిమిషాలు';
  return out;
}
function sanitizeForSpeech(text, lang) {
  let s = String(text || '');
  if (langCode(lang) === 'te') {
    s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mn) => teTime(parseInt(h, 10), parseInt(mn, 10)));
    s = s.replace(/\b\d+\b/g, m => { const n = parseInt(m, 10); return n <= 99 ? teNumber(n) : m; });
  }
  s = s.replace(/["'“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}
function hasSpeakable(text) {
  return /[\u0c00-\u0c7f\u0900-\u097fA-Za-z]/.test(String(text || ''));
}
function chunkForSpeech(text, maxLen) {
  const max = maxLen || MAX_CHUNK_CHARS;
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[,;:—–])\s+|(?<=\s)(?=(?:మరియు|కానీ|అయినా|కాబట్టి)\s)/);
  const chunks = [];
  let cur = '';
  const pushWordSplit = p => {
    p.split(/\s+/).forEach(w => {
      if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
      else { if (cur) chunks.push(cur); cur = w; }
    });
  };
  parts.forEach(p => {
    if ((cur + ' ' + p).trim().length <= max) cur = (cur + ' ' + p).trim();
    else {
      if (cur) chunks.push(cur);
      if (p.length <= max) cur = p;
      else { cur = ''; pushWordSplit(p); }
    }
  });
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text];
}
function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Timed out: ' + label)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ---------------- chapter extraction from an epub.js section ---------------- */
function extractParagraphs(doc) {
  const paras = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
  let node;
  const blocks = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'LI', 'DIV']);
  while ((node = walker.nextNode())) {
    const tag = (node.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    if (tag === 'IMG') {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      paras.push({ kind: 'img', src, alt, text: '' });
      continue;
    }
    if (blocks.has(tag)) {
      if (tag === 'DIV' && Array.from(node.getElementsByTagName('*')).some(d => ['p','h1','h2','h3','blockquote','li'].indexOf((d.tagName || '').toLowerCase()) >= 0)) continue;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const html = node.innerHTML;
      paras.push({ kind: tag.toLowerCase(), text, html });
    }
  }
  return paras;
}
function parasToSentences(paras, chapterMood) {
  const out = [];
  let prevLen = 0;
  paras.forEach((p, pi) => {
    if (p.kind === 'img') { out.push({ text: '', paraIdx: pi, mood: chapterMood, image: true }); return; }
    splitSentences(p.text).forEach(s => {
      const mood = sentenceMood(s, chapterMood, prevLen);
      out.push({ text: prepForSpeech(s, state.meta ? state.meta.language : 'en'), paraIdx: pi, mood, reveal: isReveal(s, prevLen) });
      prevLen = s.length;
    });
  });
  return out.filter(s => s.text || s.image);
}

/* ---------------- EPUB loading (epub.js) ---------------- */
async function openEpub(arrayBuffer, fileName) {
  if (typeof ePub !== 'function') throw new Error('EPUB engine failed to load');
  const book = ePub(arrayBuffer);
  await book.ready;
  const md = book.package.metadata || {};
  const title = (md.title || fileName || 'Untitled').toString().replace(/\.epub$/i, '');
  const author = (md.creator || 'Unknown author').toString();
  const subtitle = (md.description || '').toString().slice(0, 200);
  const lang = normaliseLang(md.language) || null;
  const coverUrl = await coverToDataUrl(await getCoverUrl(book).catch(() => null));
  const tocFlat = [];
  (function walk(items) { (items || []).forEach(it => { tocFlat.push(it); if (it.subitems) walk(it.subitems); }); })(book.navigation.toc || []);
  const hrefToSpine = {};
  book.spine.items.forEach((it, i) => { hrefToSpine[it.href] = i; hrefToSpine[it.href.split('#')[0]] = i; });
  const chapters = [];
  const seen = new Set();
  tocFlat.forEach(it => {
    const href = (it.href || '').split('#')[0];
    const si = hrefToSpine[href];
    if (si == null || seen.has(si)) return;
    seen.add(si);
    chapters.push({ title: (it.label || 'Chapter').trim(), href, spineIndex: si, kind: classifyChapter(it.label, href), mood: null });
  });
  if (!chapters.length) {
    book.spine.items.forEach((it, i) => {
      if (it.linear === 'no') return;
      chapters.push({ title: 'Part ' + (chapters.length + 1), href: it.href, spineIndex: i, kind: 'chapter', mood: null });
    });
  }
  const id = bookIdFor(title, author);
  state.book = book; state.bookType = 'epub'; state.pdfPages = null;
  state.meta = { id, title, author, subtitle, language: lang || 'en', description: subtitle, coverUrl, fileName };
  state.chapters = chapters;
  state.currentChapter = 0; state.sentenceIndex = 0; state.cacheCount = 0;
  if (!lang) {
    const first = await loadChapterText(0).catch(() => null);
    if (first) state.meta.language = detectScriptLang(first.paras.map(p => p.text).join(' '));
  }
  await registerBook();
  return state.meta;
}
function classifyChapter(label, href) {
  const l = (label || '').toLowerCase();
  const h = (href || '').toLowerCase();
  if (/table of contents|contents|విషయ|సూచిక|toc/.test(l)) return 'toc';
  if (/cover\.xhtml|title\.xhtml|cover|title page/.test(h) || /cover|title page/.test(l)) return 'front';
  if (/intro|about|గురించి|పరిచయం|ముందుమాట|preface|foreword/.test(l) || /about|intro|preface/.test(h)) return 'intro';
  if (/appendix|author|అనుబంధం|రచయిత/.test(l)) return 'back';
  return 'chapter';
}
async function getCoverUrl(book) {
  try {
    const url = await book.coverUrl();
    return url || null;
  } catch (e) { return null; }
}
/* v3.3 (F35): a cover stored as a blob: URL dies on reload (the URL is only
   valid in the page that created it), so the library card showed a broken
   image after a reload. Store the cover as a small JPEG data URL instead —
   it survives reloads, and at ~200 px wide it is only ~10–20 KB. On any
   failure the original URL is kept, so the cover still shows in-session. */
async function coverToDataUrl(url) {
  if (!url || url.indexOf('blob:') !== 0) return url;
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const maxW = 200;
    const scale = Math.min(1, maxW / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) { return url; }
}
async function resolveImageUrl(book, src) {
  try {
    if (!src || src.indexOf('data:') === 0 || src.indexOf('http') === 0) return src;
    const url = await book.archive.createUrl(src);
    return url || src;
  } catch (e) { return src; }
}
async function loadChapterText(chIdx) {
  const ch = state.chapters[chIdx];
  if (!ch) return null;
  const cached = await idbGet('chapters', state.meta.id + '::' + chIdx).catch(() => null);
  if (cached && cached.paras) return cached;
  let paras;
  if (state.bookType === 'epub') {
    const section = state.book.spine.get(ch.spineIndex);
    await section.load(state.book.load.bind(state.book));
    paras = extractParagraphs(section.document);
    for (const p of paras) {
      if (p.kind === 'img') p.blobUrl = await resolveImageUrl(state.book, p.src);
    }
    try { section.unload(); } catch (e) {}
  } else {
    paras = state.pdfPages ? state.pdfPages.slice(ch.pageStart, ch.pageEnd).map(t => ({ kind: 'p', text: t, html: '' })) : [];
  }
  const rec = { key: state.meta.id + '::' + chIdx, paras };
  idbPut('chapters', rec).catch(() => {});
  return rec;
}
async function loadChapter(chIdx, opts) {
  opts = opts || {};
  cancelPrefetch();
  const rec = await loadChapterText(chIdx);
  if (!rec) return false;
  state.currentChapter = chIdx;
  state.currentPage = 0; // a fresh chapter opens on its first page; paginate() preserves the page after that
  state.paragraphs = rec.paras;
  const mood = moodOfChapter(state.chapters[chIdx]);
  state.sentences = parasToSentences(rec.paras, mood);
  state.sentenceIndex = 0;
  if (opts.keepPosition && state.pendingSentence != null) {
    state.sentenceIndex = clamp(state.pendingSentence, 0, Math.max(0, state.sentences.length - 1));
    state.pendingSentence = null;
  }
  renderChapter();
  // v3: wrap the current sentence right away so tap-a-word-to-hear works
  // before Play is ever pressed (and so the whole-word highlight is visible).
  buildSentenceSpans();
  updateChapterList();
  updateCacheInfo();
  updateAudioBar();
  savePosition();
  // v3.1: "Automatically read aloud" — start narration when a chapter opens.
  // Guarded by !state.playing so the narration engine's own chapter advance
  // (which keeps playing=true) never restarts it.
  if (settings.autoReadAloud && !state.playing) {
    setTimeout(() => { if (settings.autoReadAloud && !state.playing && state.meta) playNarration(); }, 1200);
  }
  return true;
}

/* ---------------- PDF loading (pdf.js inlined; local conversion) ---------------- */
async function openPdf(arrayBuffer, fileName) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF engine failed to load');
  if (!window.__pdfWorkerUrl) {
    const blob = new Blob([window.__PDF_WORKER_SRC__ || ''], { type: 'text/javascript' });
    window.__pdfWorkerUrl = URL.createObjectURL(blob);
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = window.__pdfWorkerUrl;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const meta = await pdf.getMetadata().catch(() => ({ info: {} }));
  const info = (meta && meta.info) || {};
  const title = (info.Title || fileName || 'Untitled').toString().replace(/\.pdf$/i, '');
  const author = (info.Author || 'Unknown author').toString();
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map(it => it.str || '').join(' ').replace(/\s+/g, ' ').trim();
    pages.push(text);
  }
  const id = bookIdFor(title, author);
  state.book = null; state.bookType = 'pdf'; state.pdfPages = pages;
  const lang = detectScriptLang(pages.slice(0, 3).join(' '));
  const chapters = [];
  const per = 6;
  for (let i = 0; i < pages.length; i += per) {
    chapters.push({ title: 'Part ' + (chapters.length + 1) + ' (pages ' + (i + 1) + '–' + Math.min(i + per, pages.length) + ')', href: '', spineIndex: -1, kind: 'chapter', mood: null, pageStart: i, pageEnd: Math.min(i + per, pages.length) });
  }
  state.meta = { id, title, author, subtitle: '', language: lang, description: '', coverUrl: null, fileName };
  state.chapters = chapters;
  state.currentChapter = 0; state.sentenceIndex = 0; state.cacheCount = 0;
  await registerBook();
  return state.meta;
}

/* ---------------- library registration ---------------- */
async function registerBook() {
  const m = state.meta;
  const existing = library.find(b => b.id === m.id);
  const entry = existing || { id: m.id, title: m.title, author: m.author, language: m.language, coverUrl: m.coverUrl, chapters: state.chapters.length, progress: 0, lastChapter: 0, lastSentence: 0, updated: Date.now() };
  entry.title = m.title; entry.author = m.author; entry.language = m.language; entry.coverUrl = m.coverUrl; entry.chapters = state.chapters.length; entry.updated = Date.now();
  if (!existing) library.unshift(entry);
  else { library.splice(library.indexOf(existing), 1); library.unshift(entry); }
  library = library.slice(0, 12);
  saveLibrary();
  state.bookmarks = JSON.parse(localStorage.getItem('epubreader.bm.' + m.id) || '[]');
  state.highlights = JSON.parse(localStorage.getItem('epubreader.hl.' + m.id) || '[]');
  loadNotes(); // v3.1: per-book notes (Contents > Notes tab)
  state.completedChapters = JSON.parse(localStorage.getItem('epubreader.done.' + m.id) || '{}');
  state.perBook = JSON.parse(localStorage.getItem('epubreader.pb.' + m.id) || '{}');
  applyPerBookSettings();
  renderLibrary();
  renderContinueCard();
}
function savePosition() {
  if (!state.meta) return;
  const entry = library.find(b => b.id === state.meta.id);
  if (entry) {
    entry.lastChapter = state.currentChapter;
    entry.lastSentence = state.sentenceIndex;
    entry.progress = state.chapters.length ? Math.round(((state.currentChapter + (state.sentences.length ? state.sentenceIndex / state.sentences.length : 0)) / state.chapters.length) * 100) : 0;
    entry.updated = Date.now();
    saveLibrary();
  }
  try {
    localStorage.setItem('epubreader.pos.' + state.meta.id, JSON.stringify({ chapter: state.currentChapter, sentence: state.sentenceIndex, at: Date.now() }));
  } catch (e) {}
}
function loadPosition() {
  if (!state.meta) return null;
  try { return JSON.parse(localStorage.getItem('epubreader.pos.' + state.meta.id) || 'null'); } catch (e) { return null; }
}
function applyPerBookSettings() {
  const pb = state.perBook || {};
  if (pb.theme) settings.theme = pb.theme;
  if (pb.font) settings.font = pb.font;
  if (pb.direction) settings.direction = pb.direction;
  if (pb.speed) state.speed = pb.speed;
  if (pb.align) settings.align = pb.align;
  if (typeof pb.twoPage === 'boolean') settings.twoPage = pb.twoPage;
  applyTheme(); applyFont();
}
function savePerBookSettings() {
  if (!state.meta) return;
  state.perBook = { theme: settings.theme, font: settings.font, direction: settings.direction, speed: state.speed, align: settings.align, twoPage: settings.twoPage };
  try { localStorage.setItem('epubreader.pb.' + state.meta.id, JSON.stringify(state.perBook)); } catch (e) {}
}

/* ---------------- voice preparation: AUTO-DOWNLOAD on book select (v3) ---------------- */
/* The moment a book is selected, its language's voice starts preparing in
   the background — no waiting for Play, no manual step. Progress shows on
   the TOP bar. For Telugu that means buffering the current chapter's audio
   (small per-sentence downloads, never one huge file). For English/Hindi it
   means downloading the Kokoro model once. The job never blocks the UI: it
   is fully async, it retries a failed fetch with backoff, and it can be
   cancelled (a new book cancels the old job). */
const VOICE_PREP = { token: 0, lang: '', running: false };
function langDisplayName(code) {
  return code === 'te' ? 'Telugu' : code === 'hi' ? 'Hindi' : 'English';
}
async function prepareVoiceForBook() {
  if (!state.meta) return;
  const lang = langCode(state.meta.language);
  const myToken = ++VOICE_PREP.token;
  VOICE_PREP.lang = lang;
  VOICE_PREP.running = true;
  try {
    if (lang === 'te' || lang === 'hi') {
      // v3.3 (F32): Google voice for Telugu AND Hindi.
      const ok = await warmChapterAudio(state.currentChapter, myToken, true);
      if (ok && myToken === VOICE_PREP.token) {
        // v3.3 (F36): audio that warmed is audio that is downloaded — mark
        // it, so the Languages panel tells the truth after a reload.
        const st = langDlState(); st[lang] = { downloaded: true, at: Date.now() }; saveLangDlState(st);
      }
      if (myToken !== VOICE_PREP.token) return;
      // v3.1: warm only the NEXT 2 chapters quietly (no top bar). Warming the
      // whole book in the background would saturate a slow connection (~0.3
      // KB/s) and starve the chapter the user is actually reading. Later
      // chapters warm on demand when the reader reaches them.
      for (let c = state.currentChapter + 1; c < Math.min(state.chapters.length, state.currentChapter + 3); c++) {
        if (myToken !== VOICE_PREP.token || !state.meta) return;
        await warmChapterAudio(c, myToken, false).catch(() => {});
        await sleep(50);
      }
    } else {
      // Kokoro model, once. v3.3 (F33 / one-time loading): a voice that is
      // already downloaded must NOT show a fresh download bar — just make
      // sure the worker is up, quietly. A downloaded voice stays downloaded
      // across reloads and across books in the same language.
      const already = langDlStatus(lang) === 'downloaded';
      if (!already) setDlProgress('Downloading ' + langDisplayName(lang) + ' voice', 0, 100);
      try {
        await withTimeout(ensureKokoroWorker(), KOKORO_LOAD_TIMEOUT_MS, 'load Kokoro voice');
        if (myToken !== VOICE_PREP.token) return;
        if (!already) {
          const st = langDlState(); st[lang] = { downloaded: true, at: Date.now() }; saveLangDlState(st);
          setDlMessage(langDisplayName(lang) + ' voice ready');
          setTimeout(() => { if (myToken === VOICE_PREP.token) hideDlBar(); }, 1200);
        }
      } catch (e) {
        // worker failed — the main-thread load is the fallback; it shows its
        // own status. Never a silent failure, never a device voice.
        // v3.3 (F33 / E10): but ONLY when the voice is not already
        // downloaded. A downloaded voice must never pop a fresh download
        // bar on a quiet worker re-check — the bar is for downloads, and
        // this voice is already downloaded. Playback surfaces its own
        // error if the voice genuinely cannot synthesise.
        if (myToken !== VOICE_PREP.token) return;
        if (!already) {
          setDlMessage('Kokoro voice needs one download — connect to the internet once');
          setTimeout(() => { if (myToken === VOICE_PREP.token) hideDlBar(); }, 4000);
        }
      }
    }
  } finally {
    if (myToken === VOICE_PREP.token) VOICE_PREP.running = false;
  }
}
/* Buffer one chapter's Google audio ahead. `showBar` draws the top progress
   bar; the quiet path (later chapters) only buffers. Returns when the chapter
   is fully buffered (or the job was cancelled / failed). A failed sentence
   is retried once after a short backoff; if it still fails the chapter keeps
   going — one bad line never blocks the rest. */
async function warmChapterAudio(chIdx, token, showBar) {
  // v3.3 (F32): Google voice covers Telugu AND Hindi now (Kokoro cannot do
  // Hindi). The chapter audio is warmed the same way for both languages.
  const lang = state.meta ? langCode(state.meta.language) : '';
  if (!state.meta || (lang !== 'te' && lang !== 'hi')) return;
  const rec = await loadChapterText(chIdx).catch(() => null);
  if (!rec || token !== VOICE_PREP.token) return;
  const mood = moodOfChapter(state.chapters[chIdx]);
  const sentences = parasToSentences(rec.paras, mood).filter(s => s.text && !s.image);
  const total = sentences.length;
  if (!total) return;
  const label = 'Downloading ' + langDisplayName(lang) + ' voice — Chapter ' + (chIdx + 1);
  let ready = 0; // sentences ACTUALLY buffered — a failed fetch never counts
  // one pass over a list of sentence indices; returns the indices that failed.
  // v3.1 CIRCUIT BREAKER: if 3 sentences fail in a row the link is down
  // (offline), not slow — stop the pass at once and say so honestly instead
  // of grinding through every sentence at 0% for minutes. The rest will
  // download on demand when the user listens.
  const runPass = async (list) => {
    const stillFailed = [];
    let consecFail = 0;
    for (const i of list) {
      if (token !== VOICE_PREP.token || !state.meta) return null;
      if (consecFail >= 3) { stillFailed.push(i); continue; }
      const s = sentences[i];
      const clean = sanitizeForSpeech(s.text, lang);
      if (!hasSpeakable(clean)) { ready++; if (showBar) setDlProgress(label, ready, total); continue; }
      const chunks = chunkForSpeech(clean, GT_CHUNK_CHARS);
      let ok = true;
      for (let ci = 0; ci < chunks.length; ci++) {
        if (token !== VOICE_PREP.token) return null;
        const key = state.meta.id + '::' + chIdx + '::' + i + '::c' + ci;
        const got = await gtPrepare(key, chunks[ci], lang);
        if (!got) {
          // v3.2: retry once after a backoff — but ONLY for a fast error.
          // A 'timeout' means the link is hung/dead; retrying it just burns
          // ~20s more per sentence and keeps the bar at 0% for minutes.
          // And a timeout must NEVER count as buffered (v3.1's truthy
          // 'timeout' string did exactly that — the bar moved on no audio).
          if (GT_LAST_FAIL === 'timeout') { ok = false; break; }
          await sleep(2000);
          if (token !== VOICE_PREP.token) return null;
          const got2 = await gtPrepare(key, chunks[ci], lang);
          if (!got2) { ok = false; break; }
        }
        // throttle so Google never 403s us
        await sleep(GT_MIN_GAP_MS);
      }
      if (ok) { ready++; consecFail = 0; if (showBar) setDlProgress(label, ready, total); }
      else { stillFailed.push(i); consecFail++; }
      // yield to the UI thread every sentence — the page must stay responsive
      await sleep(0);
    }
    return stillFailed;
  };
  if (showBar) setDlProgress(label, 0, total);
  let failed = await runPass(sentences.map((_, i) => i));
  if (failed == null) return;
  // v3.1: retry the failed sentences ONCE — but only if some sentences DID
  // buffer (a slow/flaky link). If NOTHING buffered (ready === 0) the link
  // is down, not slow; retrying would just sit at 0% longer. Say so at once.
  if (failed.length && ready > 0 && token === VOICE_PREP.token) {
    // one quiet background retry for the sentences that failed (slow link);
    // the bar says so honestly while it retries.
    if (showBar) setDlMessage(label + ' — ' + ready + ' of ' + total + ' ready, retrying the rest…', (ready / total) * 100);
    await sleep(5000);
    if (token !== VOICE_PREP.token) return;
    const failed2 = await runPass(failed);
    if (failed2 == null) return;
    failed = failed2;
  }
  // true only when EVERYTHING buffered — a partial download must never be
  // reported as "downloaded" (downloadLanguage relies on this).
  if (!showBar) return failed.length === 0;
  if (!failed.length) {
    setDlMessage(langDisplayName(lang) + ' voice ready — Chapter ' + (chIdx + 1));
    setTimeout(() => { if (token === VOICE_PREP.token) hideDlBar(); }, 1200);
  } else {
    // HONEST failure state: never claim "ready" when it is not. The bar
    // stays visible at the true % so the user SEES the download did not
    // finish — the remaining sentences download when he listens.
    setDlMessage(langDisplayName(lang) + ' voice: ' + ready + ' of ' + total + ' downloaded — connection is slow or offline. The rest will download when you listen.', (ready / total) * 100);
  }
  return failed.length === 0;
}

/* ---------------- Languages download section (v3) ---------------- */
/* A Languages section manages OFFLINE voice downloads only. It is NOT a
   language picker — reading language stays auto-detected from the book.
   Telugu/Hindi/English each show Downloaded / Not downloaded / Downloading
   with %, plus a Download button (and Remove once downloaded). */
const LANG_DL_KEY = 'epubreader.langdl.v1';
function langDlState() {
  try { return JSON.parse(localStorage.getItem(LANG_DL_KEY) || '{}'); } catch (e) { return {}; }
}
function saveLangDlState(s) { try { localStorage.setItem(LANG_DL_KEY, JSON.stringify(s)); } catch (e) {} }
function langDlStatus(code) {
  const s = langDlState();
  // v3.3 (F32): Telugu AND Hindi are Google voices — "downloaded" when the
  // flag was set by a successful warm/download.
  if (code === 'te' || code === 'hi') {
    return s[code] && s[code].downloaded ? 'downloaded' : 'not';
  }
  if (NEURAL.kokoro) return 'downloaded';
  return (s[code] && s[code].downloaded) ? 'downloaded' : 'not';
}
// v3.3 (F33): kokoro-js loads voice files from the Cache API cache named
// 'kokoro-voices', keyed by the full HuggingFace URL. Pre-cache the voice
// file there so it persists across reloads and the first synth never needs
// the network. Best-effort: a failure here does not fail the download —
// kokoro-js fetches the voice on demand if the cache misses.
const KOKORO_VOICE_URL = id => 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/' + id + '.bin';
async function precacheKokoroVoice(voiceId) {
  try {
    if (!window.caches) return false;
    const cache = await caches.open('kokoro-voices');
    const url = KOKORO_VOICE_URL(voiceId);
    if (await cache.match(url)) return true;
    const res = await fetch(url);
    if (!res || !res.ok) return false;
    await cache.put(url, res.clone());
    return true;
  } catch (e) { console.warn('Kokoro voice pre-cache failed:', e); return false; }
}
async function downloadLanguage(code) {
  const s = langDlState();
  // v3.3 (F32): Google voices — Telugu AND Hindi. Pre-buffer the current
  // book's audio (or the first chapter if no book). Progress shows on the
  // top bar; the Service Worker also caches it.
  if (code === 'te' || code === 'hi') {
    if (!state.meta) { toast('Open a book first — ' + langDisplayName(code) + ' downloads with the book'); return; }
    if (langCode(state.meta.language) !== code) { toast('Open a ' + langDisplayName(code) + ' book first — the voice downloads with its book'); return; }
    setDlProgress('Downloading ' + langDisplayName(code) + ' voice', 0, 100);
    const token = ++VOICE_PREP.token;
    const ok = await warmChapterAudio(state.currentChapter, token, true).catch(() => false);
    if (ok) {
      const st = langDlState(); st[code] = { downloaded: true, at: Date.now() }; saveLangDlState(st);
      toast(langDisplayName(code) + ' voice downloaded for offline');
    } else {
      toast(langDisplayName(code) + ' download did not finish — check your connection and try again');
    }
    renderLangList();
    return;
  }
  // Kokoro (English only since v3.3 — Hindi uses Google): download + cache the model once.
  setDlProgress('Downloading ' + langDisplayName(code) + ' voice', 0, 100);
  try {
    await withTimeout(ensureKokoroWorker(), KOKORO_LOAD_TIMEOUT_MS, 'load Kokoro voice');
    await precacheKokoroVoice(neuralVoiceFor(code));
    const st = langDlState(); st[code] = { downloaded: true, at: Date.now() }; saveLangDlState(st);
    setDlMessage(langDisplayName(code) + ' voice downloaded');
    setTimeout(hideDlBar, 1200);
    toast(langDisplayName(code) + ' voice downloaded for offline');
  } catch (e) {
    setDlMessage('Download failed — connect to the internet and try again');
    setTimeout(hideDlBar, 3000);
    toast('Download failed — check your connection and try again');
  }
  renderLangList();
}
async function removeLanguage(code) {
  const s = langDlState();
  if (code === 'te') {
    // clear the Service Worker TTS cache + the in-memory pool
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'clear-tts' });
      }
      if (window.caches) { const names = await caches.keys(); for (const n of names) { if (n.indexOf('gtts') === 0) await caches.delete(n); } }
    } catch (e) {}
    gtReleaseAll();
    delete s.te;
    saveLangDlState(s);
    toast('Telugu offline voice removed');
  } else if (code === 'hi') {
    // v3.3 (F32): Hindi is a Google voice now. Only the flag is removed —
    // the shared Google audio cache is left alone so Telugu audio survives.
    delete s.hi;
    saveLangDlState(s);
    toast('Hindi offline voice removed');
  } else {
    delete s[code];
    saveLangDlState(s);
    toast(langDisplayName(code) + ' offline voice removed');
  }
  renderLangList();
}
function renderLangList() {
  const list = $('#langList');
  if (!list) return;
  list.innerHTML = '';
  [['te', 'Telugu', 'Google Telugu voice — clear and natural'], ['hi', 'Hindi', 'Google Hindi voice — clear and natural'], ['en', 'English', 'Kokoro voice']].forEach(([code, name, desc]) => {
    const status = langDlStatus(code);
    const row = el('div', 'lang-row');
    const info = el('div', 'lang-info');
    info.appendChild(el('div', 'lang-name', name));
    info.appendChild(el('div', 'lang-desc', desc));
    info.appendChild(el('div', 'lang-status', status === 'downloaded' ? '✓ Downloaded for offline' : 'Not downloaded'));
    row.appendChild(info);
    const btn = el('button', 'mini-btn', status === 'downloaded' ? 'Remove' : '⬇ Download');
    btn.onclick = () => { if (status === 'downloaded') removeLanguage(code); else downloadLanguage(code); };
    row.appendChild(btn);
    list.appendChild(row);
  });
}

/* ---------------- rendering ---------------- */
function renderChapter() {
  const content = $('#pageContent');
  content.innerHTML = '';
  content.classList.remove('two-col');
  const ch = state.chapters[state.currentChapter];
  const firstIsTitle = state.paragraphs.length && ['h1','h2','h3'].indexOf(state.paragraphs[0].kind) >= 0 && state.paragraphs[0].text.replace(/\s+/g, ' ').trim() === (ch ? ch.title : '').replace(/\s+/g, ' ').trim();
  // v3.2: the title h1 is kept OUT of the page-node list — it is only used
  // to measure page 0. The page nodes are every other child (paragraphs
  // AND figures, so images show in horizontal mode too).
  state.measureH1 = null;
  if (!firstIsTitle) {
    state.measureH1 = el('h1', null, ch ? ch.title : '');
    content.appendChild(state.measureH1);
  }
  state.paragraphs.forEach((p, pi) => {
    if (p.kind === 'img') {
      const fig = el('div');
      if (p.blobUrl && p.blobUrl.indexOf('blob:') === 0) {
        const img = el('img'); img.src = p.blobUrl; img.alt = p.alt || 'Figure'; fig.appendChild(img);
      } else {
        fig.appendChild(el('div', 'img-note', '[image]'));
      }
      content.appendChild(fig);
      return;
    }
    const tag = (p.kind === 'h1' || p.kind === 'h2' || p.kind === 'h3') ? p.kind : (p.kind === 'blockquote' ? 'blockquote' : (p.kind === 'li' ? 'li' : 'p'));
    const node = el(tag, null, null);
    node.innerHTML = esc(p.text);
    node.dataset.para = pi;
    content.appendChild(node);
  });
  // v3.2: the chapter's display nodes in reading order. paginate() re-attaches
  // ALL of them before measuring — after showPage runs, nodes live only on
  // the displayed page(s), and repaginating from that visible subset would
  // silently drop the rest of the chapter.
  state.pageNodes = Array.from(content.children).filter(n => n !== state.measureH1);
  invalidatePageTotal();
  paginate();
  updatePageFooter();
  scheduleSettle();
  content.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', scheduleSettle, { once: true });
  });
  updateChapterList();
}
function paraElements() {
  // v3.2: paragraphs live on BOTH page panels in two-page mode.
  const out = [];
  ['#pageContent', '#pageContent2'].forEach(sel => {
    const c = document.querySelector(sel);
    if (c) Array.from(c.children).forEach(n => { if (n.dataset && n.dataset.para != null) out.push(n); });
  });
  return out;
}
/* v3.2 — how many pages are shown at once. Mobile (narrow) is ALWAYS one
   page (locked layout rule); laptop/tablet show one or two by the user's
   "Two-page spread" setting. */
function perView() { return (settings.twoPage !== false && window.innerWidth >= 760) ? 2 : 1; }
function pageStep() { return perView(); }
/* v3.3 (item 6 — a REAL book page): the page must hold a real book page's
   aspect ratio (~1:1.5 width:height, like a 5.5x8.5in paperback, kept
   1:1.45–1:1.6) and sit centred in the flip-wrap with desk showing around
   it. The old CSS stretched the page to the full wrap height at a capped
   width, so the ratio drifted with the viewport (1:1.28 on a 360px phone,
   ~1:1.04 on a laptop) — a stretched container, not a book page. Sizing is
   computed from the wrap rect here (paginate calls this before measuring),
   so the ratio is exact and measurable. */
const PAGE_RATIO = 1.5; // height = width * 1.5 (paperback 5.5x8.5in)
function applyPageLayout() {
  const wrap = $('#flipWrap');
  if (!wrap) return;
  const two = perView() === 2;
  wrap.classList.toggle('two-page', two);
  const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  if (wrapW < 100 || wrapH < 100) return; // hidden (home screen) — CSS defaults stand until the reader shows
  const gap = 24; // spine gap between the two pages
  const availH = wrapH - 24;
  const availW = two ? (wrapW - 24 - gap) / 2 : wrapW - 24;
  const w = Math.max(120, Math.min(availW, availH / PAGE_RATIO, 680));
  const h = w * PAGE_RATIO;
  const top = Math.max(0, (wrapH - h) / 2);
  const left0 = two ? (wrapW - (2 * w + gap)) / 2 : (wrapW - w) / 2;
  const cur = $('#pageCurrent'), nxt = $('#pageNext');
  if (cur) {
    cur.style.width = w + 'px'; cur.style.height = h + 'px';
    cur.style.top = top + 'px'; cur.style.left = left0 + 'px';
    cur.style.right = 'auto'; cur.style.transform = 'none';
  }
  if (nxt) {
    nxt.style.width = w + 'px'; nxt.style.height = h + 'px';
    nxt.style.top = top + 'px'; nxt.style.left = (left0 + w + gap) + 'px';
    nxt.style.right = 'auto'; nxt.style.transform = 'none';
  }
}
/* v3.2 — a node's FULL height on the page, margins included. offsetHeight
   alone excludes margins, and every paragraph carries a 1em bottom margin:
   packing by offsetHeight alone put ~18px too much per paragraph on a page
   and the last page of a chapter overflowed (v3.2 test: 588px in a 510px
   page). Margins collapse between neighbours, so this slightly over-counts
   — a page may end a line early, but it can never overflow. */
function outerH(n) {
  const cs = getComputedStyle(n);
  return (n.offsetHeight || 0) + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
}
function marginsH(n) {
  const cs = getComputedStyle(n);
  return (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
}
/* v3.2 — split a paragraph that is taller than ONE screenful into
   sentence-sized chunks (each a whole-sentence <p>), so no page ever needs
   scrolling. A single sentence taller than a page is split by words as a
   last resort. Chunks keep dataset.para (so sentence lookup still finds
   them) plus dataset.chunk + _chunkText (their own text, so the highlight
   code never re-expands a chunk to the full paragraph). Idempotent: already
   split chunks measure small and are left alone; if the font grows, a chunk
   is split further from its OWN text. */
function wordSplitNode(n, pageH) {
  let cur = n, guard = 0;
  while (cur && outerH(cur) > pageH && guard++ < 10) {
    const pi = Number(cur.dataset.para);
    const text = cur._chunkText || (state.paragraphs[pi] && state.paragraphs[pi].text) || cur.textContent || '';
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2) return; // one huge word: cannot split; the page clips it (overflow hidden)
    const limit = Math.max(40, pageH - marginsH(cur)); // the words must fit inside the margins too
    let lo = 1, hi = words.length, best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      cur.textContent = words.slice(0, mid).join(' ');
      if ((cur.offsetHeight || 0) <= limit) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best >= words.length) { cur.textContent = text; return; }
    const first = words.slice(0, best).join(' '), rest = words.slice(best).join(' ');
    cur.textContent = first; cur._chunkText = first; cur.dataset.chunk = '1';
    const tag = (cur.tagName || 'P').toLowerCase();
    const c2 = el(tag === 'li' || tag === 'blockquote' ? tag : 'p', null, rest);
    c2.dataset.para = pi; c2.dataset.chunk = '1'; c2._chunkText = rest;
    cur.after(c2);
    cur = c2;
  }
}
function splitOversizedNodes(content, pageH) {
  paraElements().forEach(n => {
    if (outerH(n) <= pageH) return;
    const tag = (n.tagName || 'P').toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') return; // headings are never split
    const pi = Number(n.dataset.para);
    const text = n._chunkText || (state.paragraphs[pi] && state.paragraphs[pi].text) || n.textContent || '';
    const sents = splitSentences(text);
    if (sents.length < 2) { wordSplitNode(n, pageH); return; }
    const frag = document.createDocumentFragment();
    sents.forEach(s => {
      const c = el(tag === 'li' || tag === 'blockquote' ? tag : 'p', null, s);
      c.dataset.para = pi; c.dataset.chunk = '1'; c._chunkText = s;
      frag.appendChild(c);
    });
    n.replaceWith(frag);
  });
  // second pass: a chunk still too tall (one giant sentence) → word-split it
  paraElements().forEach(n => { if (outerH(n) > pageH) wordSplitNode(n, pageH); });
}
function paginate() {
  const content = $('#pageContent');
  // v3.2: the layout mode (one/two panels) sets the page WIDTH — it must be
  // applied BEFORE measuring, or every height is measured at the wrong width.
  applyPageLayout();
  state.pages = [];
  state.totalPages = 0;
  invalidatePageTotal();
  content.innerHTML = '';
  if (state.measureH1) content.appendChild(state.measureH1);
  (state.pageNodes || []).forEach(n => content.appendChild(n));
  const cs = getComputedStyle(content);
  const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  let pageH = content.clientHeight - padV;
  // the reader may still be hidden (open flow paginates before the reader
  // shows) — then clientHeight is 0 and the estimate below stands in until
  // openReader() repaginates with real measurements once it is visible.
  if (pageH < 100) pageH = Math.max(200, window.innerHeight - 320);
  splitOversizedNodes(content, pageH);
  state.pageNodes = Array.from(content.children).filter(n => n !== state.measureH1);
  const nodes = state.pageNodes;
  let pages = [], cur = [], acc = 0;
  const h1 = content.querySelector('h1');
  if (h1) acc += outerH(h1);
  nodes.forEach(n => {
    const h = outerH(n) || 40;
    if (acc + h > pageH && cur.length) { pages.push(cur); cur = []; acc = 0; }
    cur.push(n); acc += h;
  });
  if (cur.length) pages.push(cur);
  state.pages = pages;
  state.totalPages = Math.max(1, pages.length);
  // stay on the page being viewed (a resize / font change must not lose it);
  // a fresh chapter opens at 0 because loadChapter resets currentPage first.
  showPage(clamp(state.currentPage || 0, 0, state.totalPages - 1), true);
}
/* v3 — a REAL page turn. The old page becomes a leaf that lifts off the
   spine, curls over (with a moving shade, like paper bending) and settles,
   revealing the new page underneath. Not a slide, not a fade.
   v3.2: the leaf is built by buildTurnLeaf() (shared with the interactive
   drag curl) from the turning PANEL — the visible page object, not the
   full-bleed screen. In two-page mode the turning panel is the RIGHT page
   going forward (it curls over the spine) and the LEFT page going back. */
function buildTurnLeaf(turning, dir) {
  const wrap = $('#flipWrap');
  const leaf = el('div', 'turn-leaf');
  const front = el('div', 'leaf-face leaf-front');
  // the turning page, cloned: it fills the leaf, and the leaf sits exactly
  // over the real panel, so the curl starts from the page as it looks now.
  const clone = turning.cloneNode(true);
  clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  clone.removeAttribute('id');
  clone.style.position = 'absolute';
  clone.style.left = '0'; clone.style.top = '0';
  clone.style.width = '100%'; clone.style.height = '100%';
  clone.style.margin = '0'; clone.style.transform = 'none';
  front.appendChild(clone);
  front.appendChild(el('div', 'leaf-shade'));
  // v3.1: the back of the turning page shows the chapter title, so the leaf
  // reads as a real page (not a blank panel) while it curls over.
  const back = el('div', 'leaf-face leaf-back');
  const ch = state.chapters[state.currentChapter];
  back.appendChild(el('div', null, ch ? ch.title : ''));
  leaf.appendChild(front);
  leaf.appendChild(back);
  const wr = wrap.getBoundingClientRect(), r = turning.getBoundingClientRect();
  leaf.style.left = (r.left - wr.left) + 'px';
  leaf.style.top = (r.top - wr.top) + 'px';
  leaf.style.width = r.width + 'px';
  leaf.style.height = r.height + 'px';
  leaf.style.right = 'auto'; leaf.style.bottom = 'auto';
  wrap.appendChild(leaf);
  return leaf;
}
function fillPageContent(contentEl, pageIdx) {
  contentEl.innerHTML = '';
  if (pageIdx >= state.pages.length) return;
  if (pageIdx === 0) {
    // the chapter title, unless the page already opens with it — the
    // chapter's first paragraph is often its own heading, and prepending
    // the title again showed it twice on page 0.
    const ch = state.chapters[state.currentChapter];
    const first = state.pages[0] && state.pages[0][0];
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
    const alreadyTitled = first && ['H1', 'H2', 'H3'].indexOf(first.tagName) >= 0 && norm(first.textContent) === norm(ch ? ch.title : '');
    if (!alreadyTitled) contentEl.appendChild(el('h1', null, ch ? ch.title : ''));
  }
  state.pages[pageIdx].forEach(n => contentEl.appendChild(n));
  contentEl.scrollTop = 0;
}
/* Paint pages idx (and idx+1 in two-page mode) into the panels. Also
   re-attaches narration-follow when the shown spread holds the sentence
   being read, and rebuilds the speaking highlight on the newly shown page. */
function paintPages(idx) {
  const pv = perView();
  const content = $('#pageContent'), content2 = $('#pageContent2');
  // v3.3 (item 6): the book's language on the page, so hyphenation
  // (hyphens: auto) breaks words correctly for Telugu/Hindi/English.
  const lang = state.meta ? langCode(state.meta.language) : 'en';
  if (content) content.lang = lang;
  if (content2) content2.lang = lang;
  state.currentPage = idx;
  fillPageContent(content, idx);
  if (pv === 2) fillPageContent(content2, idx + 1);
  else content2.innerHTML = '';
  updatePageFooter();
  if (state.playing) {
    const np = pageForSentence(state.sentenceIndex);
    if (np >= idx && np < idx + pv) state.followNarration = true;
  }
  if (state.playing) buildSentenceSpans();
}
function showPage(idx, instant, manual) {
  const content = $('#pageContent');
  if (!state.pages.length) { content.style.display = ''; state.currentPage = 0; updatePageFooter(); return; }
  // v3.3 (F34): a MANUAL turn past the chapter edge opens the next /
  // previous chapter instead of clamping to the edge. (Narration and
  // pagination call showPage with in-range indices, so they are unaffected.)
  if (manual) {
    if (idx > state.pages.length - 1) {
      const nxt = nextNarratableChapter(state.currentChapter + 1);
      if (nxt != null) { loadChapter(nxt).then(() => showPage(0, true)); return; }
    } else if (idx < 0) {
      const prv = prevNarratableChapter(state.currentChapter - 1);
      if (prv != null) { loadChapter(prv).then(() => showPage(state.totalPages - 1, true)); return; }
    }
  }
  const pv = perView();
  idx = clamp(idx, 0, state.pages.length - 1);
  if (pv === 2) idx = Math.floor(idx / 2) * 2; // a spread always starts on an even page
  // v3.2: a MANUAL turn while read-aloud plays detaches the view from the
  // narration — the view moves, the narration position does not. paintPages
  // re-attaches if the landed spread holds the sentence being read.
  if (manual && state.playing) state.followNarration = false;
  if (instant || idx === state.currentPage) { paintPages(idx); return; }
  const dir = idx > state.currentPage ? 1 : -1;
  // v3.1: the 3D curl can be switched off in Settings ("Use 3D effect for
  // page turning") — off means a plain swap (no leaf).
  if (settings.page3d === false) { paintPages(idx); return; }
  const turning = dir > 0 ? (pv === 2 ? $('#pageNext') : $('#pageCurrent')) : $('#pageCurrent');
  const leaf = buildTurnLeaf(turning, dir);
  if (pv === 2 && dir < 0) leaf.classList.add('spine-right'); // back over the spine, not the outer edge
  // swap the real content underneath (hidden by the leaf until it turns)
  paintPages(idx);
  // v3.1 FIX (v3 curl was invisible): the leaf is created WITHOUT the
  // animation class, appended, then the class is added in a rAF AFTER a
  // forced reflow. v3 created it with the class already on, so the browser
  // batched the append + the content swap into one paint and the animation
  // never visibly ran (measured rotation 0.05°).
  void leaf.offsetWidth; // force a reflow so the leaf paints at rotateY(0) first
  requestAnimationFrame(() => {
    leaf.classList.add(dir > 0 ? 'fwd' : 'back');
    leaf.addEventListener('animationend', () => leaf.remove(), { once: true });
    setTimeout(() => leaf.remove(), 800);
  });
}
function pageForSentence(si) {
  if (!state.pages.length) return 0;
  const s = state.sentences[si];
  if (!s) return 0;
  // v3.2: a paragraph split across pages lives in several chunk nodes — the
  // sentence's page is the chunk whose text actually contains the sentence.
  for (let i = 0; i < state.pages.length; i++) {
    if (state.pages[i].some(n => Number(n.dataset.para) === s.paraIdx && (n.textContent || '').indexOf(s.text) >= 0)) return i;
  }
  for (let i = 0; i < state.pages.length; i++) {
    if (state.pages[i].some(n => Number(n.dataset.para) === s.paraIdx)) return i;
  }
  return 0;
}
/* v3.1: the page number of the first page of chapter i (1-based), from the
   cached per-chapter page totals. Used by the Contents drawer so each chapter
   shows its start page like Play Books ("Chapter One … page 9"). */
function chapterStartPage(i) {
  let p = 1;
  for (let c = 0; c < i && c < state.chapters.length; c++) {
    p += (state.pageTotals && state.pageTotals[c]) || 1;
  }
  return p;
}
function updatePageFooter() {
  const total = cachedPageTotal();
  // v3.2: every mode is paginated now — the current page is always the
  // painted page number, never a scroll fraction.
  const cur = state.currentPage + 1;
  $('#pageNum').textContent = 'Page ' + cur + ' of ' + total;
  const ch = state.chapters[state.currentChapter];
  $('#chapterPos').textContent = ch ? ('Chapter ' + (state.currentChapter + 1) + ' of ' + state.chapters.length) : '';
  // v3.1 (Play Books footer): pages left in this chapter, % through the book,
  // and the bottom page slider.
  const chPages = (state.pages && state.pages.length) || 1;
  const left = Math.max(0, chPages - state.currentPage - perView());
  const pl = $('#pagesLeft'); if (pl) pl.textContent = left + (left === 1 ? ' page left in chapter' : ' pages left in chapter');
  const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
  const pp = $('#pagePct'); if (pp) pp.textContent = pct + '%';
  const sl = $('#pageSlider');
  if (sl) {
    sl.max = Math.max(1, total);
    if (document.activeElement !== sl) sl.value = cur;
  }
  const sn = $('#pageSliderNum'); if (sn) sn.textContent = cur + ' / ' + total;
  // v3.2: every mode is paginated, so the on-page ‹ › buttons always apply.
  const pv = $('#btnPagePrev'), nx = $('#btnPageNext');
  if (pv) pv.classList.remove('hidden');
  if (nx) nx.classList.remove('hidden');
}
function pageTotalKey() {
  return [state.currentChapter, settings.direction, window.innerWidth, window.innerHeight, settings.fontSize, settings.lineSpacing, settings.font].join('|');
}
function cachedPageTotal() {
  if (!state.pageTotal || state.pageTotalKey !== pageTotalKey()) {
    // v3.2: every mode is paginated — the total is the packed page count.
    state.pageTotal = Math.max(1, state.totalPages || 1);
    state.pageTotalKey = pageTotalKey();
  }
  return state.pageTotal;
}
function invalidatePageTotal() { state.pageTotal = 0; state.pageTotalKey = ''; }
let settleTimer = null;
function scheduleSettle() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settlePageTotal, 250);
}
function settlePageTotal() {
  const content = $('#pageContent');
  if (!content || !state.meta) return;
  // v3.2: no scroll position to preserve — pages are discrete screenfuls.
  invalidatePageTotal();
  cachedPageTotal();
  updatePageFooter();
}
function estimatePages() {
  return Math.max(1, state.totalPages || 1);
}
function currentScrollPage() {
  return state.currentPage + 1;
}
function updateChapterList() {
  const ul = $('#chapterList');
  if (!ul || !state.chapters.length) return;
  ul.innerHTML = '';
  state.chapters.forEach((ch, i) => {
    const li = el('li');
    if (state.completedChapters[i]) li.appendChild(el('span', 'done', '✓ '));
    const nm = el('span', 'ch-name', ch.title);
    li.appendChild(nm);
    // v3.1 (Play Books): each chapter shows its START PAGE number, and the
    // current chapter is marked "currently on page X".
    const start = chapterStartPage(i);
    li.appendChild(el('span', 'ch-page', 'page ' + start));
    if (i === state.currentChapter) {
      li.classList.add('active');
      const cur = settings.direction === 'horizontal' ? (state.currentPage + 1) : currentScrollPage();
      li.appendChild(el('span', 'ch-current', 'currently on page ' + cur));
    }
    li.onclick = () => { stopNarration(false); loadChapter(i); closeDrawer(); };
    ul.appendChild(li);
  });
  renderBookmarks(); renderHighlights(); renderNotes();
}
/* v3.1 — Notes (Play Books Contents tab). A note is attached to the current
   sentence; added by touch-and-hold on the text (long-press) or from the
   selection menu. Stored per book in localStorage. */
function loadNotes() {
  if (!state.meta) { state.notes = []; return; }
  try { state.notes = JSON.parse(localStorage.getItem('epubreader.notes.' + state.meta.id) || '[]'); } catch (e) { state.notes = []; }
}
function saveNotes() {
  if (!state.meta) return;
  try { localStorage.setItem('epubreader.notes.' + state.meta.id, JSON.stringify(state.notes || [])); } catch (e) {}
}
function addNote(text) {
  if (!state.meta) return;
  const s = state.sentences[state.sentenceIndex];
  const note = (text || '').trim();
  if (!note) return;
  state.notes = state.notes || [];
  state.notes.unshift({ chapter: state.currentChapter, sentence: state.sentenceIndex, text: s ? s.text.slice(0, 120) : '', note: note.slice(0, 500), at: Date.now() });
  state.notes = state.notes.slice(0, 200);
  saveNotes(); renderNotes();
  toast('Note saved');
}
function renderNotes() {
  const ul = $('#noteList');
  const empty = $('#notesEmpty');
  if (!ul) return;
  ul.innerHTML = '';
  const notes = state.notes || [];
  if (empty) empty.classList.toggle('hidden', notes.length > 0);
  notes.forEach((n, i) => {
    const li = el('li');
    li.appendChild(el('div', null, '✎ ' + n.note));
    if (n.text) li.appendChild(el('span', 'note-snip', '“' + n.text + '”'));
    li.onclick = () => { loadChapter(n.chapter).then(() => { state.pendingSentence = n.sentence; state.sentenceIndex = n.sentence; buildSentenceSpans(); scrollToSentence(); }); closeDrawer(); };
    const del = el('button', 'mini-btn', '✕');
    del.onclick = ev => { ev.stopPropagation(); state.notes.splice(i, 1); saveNotes(); renderNotes(); };
    li.appendChild(del);
    ul.appendChild(li);
  });
}
/* v3.1 — remove the current (manual) bookmark, for the 3-dot menu. */
function removeCurrentBookmark() {
  if (!state.meta) return;
  const i = state.bookmarks.findIndex(b => !b.auto && b.chapter === state.currentChapter && b.sentence === state.sentenceIndex);
  if (i >= 0) {
    state.bookmarks.splice(i, 1);
    try { localStorage.setItem('epubreader.bm.' + state.meta.id, JSON.stringify(state.bookmarks)); } catch (e) {}
    renderBookmarks(); toast('Bookmark removed');
  } else toast('No bookmark here');
}
function updateCacheInfo() {
  const n = $('#cacheInfo');
  if (!n) return;
  n.textContent = state.cacheCount + ' of ' + state.chapters.length + ' chapters saved for offline';
}

/* ---------------- sentence display: WHOLE-WORD spans only (v3) ---------------- */
/* v3 — the achulu/hallulu bug. v2.1 split every word into per-LETTER spans
   (.l) for the bounce, which breaks Telugu complex-script shaping: a
   conjunct (e.g. క్ష) or a vowel sign detaches from its base letter and the
   letter renders as a bare vowel or a broken form. The static text looked
   fine because only the speaking sentence got the letter spans — that is
   why the error was intermittent. Fix: each word is ONE intact text node
   inside its .w span. The bounce animates the whole word. */
function buildSentenceSpans() {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  const nodes = paraElements();
  // v3.2: a paragraph split across pages lives in several chunk nodes — the
  // sentence is wrapped in the chunk whose text actually contains it.
  const node = nodes.find(n => Number(n.dataset.para) === s.paraIdx && (n.textContent || '').indexOf(s.text) >= 0)
    || nodes.find(n => Number(n.dataset.para) === s.paraIdx);
  if (!node) return;
  const para = state.paragraphs[s.paraIdx];
  if (!para) return;
  // v3.2: for a chunk, wrap within the CHUNK's own text — using the full
  // paragraph text here would re-expand the chunk to the whole paragraph.
  const ptext = (node.dataset.chunk != null) ? (node._chunkText || node.textContent) : para.text;
  const start = ptext.indexOf(s.text);
  if (start < 0) return;
  const before = ptext.slice(0, start), after = ptext.slice(start + s.text.length);
  const frag = document.createDocumentFragment();
  if (before) frag.appendChild(document.createTextNode(before));
  const sent = el('span', 'sentence speaking');
  s.text.split(/(\s+)/).forEach(part => {
    if (!part) return;
    if (/^\s+$/.test(part)) { sent.appendChild(document.createTextNode(part)); return; }
    const w = el('span', 'w');
    w.textContent = part;   // whole word, intact — never split into letters
    sent.appendChild(w);
  });
  frag.appendChild(sent);
  if (after) frag.appendChild(document.createTextNode(after));
  node.innerHTML = '';
  node.appendChild(frag);
  node.dataset.built = state.sentenceIndex;
}
function clearSentenceSpans() {
  paraElements().forEach(n => {
    const sp = n.querySelector('.sentence');
    if (sp) {
      const p = state.paragraphs[Number(n.dataset.para)];
      // v3.2: a chunk restores its OWN text, never the full paragraph.
      n.textContent = n._chunkText || (p ? p.text : n.textContent);
      delete n.dataset.built;
    }
  });
}
function scrollToSentence() {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  // v3.2: if the user turned pages manually to peek, the view stays where
  // they put it — the narration keeps going from its own sentence and the
  // view only follows again once the user turns back to the narration page
  // (paintPages re-attaches) or resumes playback.
  if (!state.followNarration) return;
  const pg = pageForSentence(state.sentenceIndex);
  if (pg < state.currentPage || pg >= state.currentPage + perView()) showPage(pg);
}

/* ---------------- narration engine (v3) ---------------- */
function currentMoodRule() {
  const s = state.sentences[state.sentenceIndex];
  const moodName = s ? s.mood : state.mood;
  return MOODS[moodName] || MOODS.neutral;
}
function effectiveRate() {
  const genreBase = (GENRES[settings.genre] || GENRES.thriller).base;
  return clamp(state.speed * currentMoodRule().speed * genreBase, 0.4, 2.5);
}
function pauseAfterSentence() {
  const s = state.sentences[state.sentenceIndex];
  const rule = currentMoodRule();
  let ms = rule.pause;
  if (s && s.reveal) ms = Math.max(ms, rule.reveal);
  if (s && /\.\.\.|…/.test(s.text)) ms += 400;
  return ms;
}
function narrAlive(myNarr) { return state.playing && myNarr === NEURAL.narrationToken; }
async function speakCurrent() {
  if (!state.playing) return;
  const myNarr = NEURAL.narrationToken;
  const s = state.sentences[state.sentenceIndex];
  if (!s) { advanceChapterOrStop(); return; }
  if (s.image) { state.sentenceIndex++; setTimeout(() => speakCurrent(), 150); return; }
  const lang = state.meta ? state.meta.language : 'en';
  buildSentenceSpans();
  scrollToSentence();
  setMood(s.mood);
  updateAudioBar();
  const rate = effectiveRate();
  prefetchFrom(state.sentenceIndex + 1);
  const key = prefetchKey(state.currentChapter, state.sentenceIndex);
  let res = null;
  try {
    const cached = NEURAL.prefetch.get(key);
    if (cached) {
      try { res = await withTimeout(Promise.resolve(cached), SYNTH_TIMEOUT_MS, 'prefetched sentence'); }
      finally { if (NEURAL.prefetch.get(key) === cached) NEURAL.prefetch.delete(key); }
    } else {
      res = await synthesizeNeural(s.text, lang, { rate, cancelled: () => !narrAlive(myNarr) });
    }
  } catch (err) {
    if (!narrAlive(myNarr)) return;
    if (err && err.voiceLoadFailed) {
      console.warn('Neural voice failed to load:', err);
      state.speaking = false;
      stopNarration(true);
      toast('Voice needs one download — connect to the internet once, then it works offline.');
      return;
    }
    console.warn('Skipping unspeakable sentence', state.sentenceIndex, err);
    NEURAL.consecFail = (NEURAL.consecFail || 0) + 1;
    if (NEURAL.consecFail >= MAX_CONSEC_FAIL) {
      stopNarration(true);
      toast('Voice stopped — the voice could not speak these lines. Try again.');
      return;
    }
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    speakCurrent();
    return;
  }
  if (!narrAlive(myNarr)) return;
  if (res.empty) {
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    speakCurrent();
    return;
  }
  const playDur = res.duration || 0;
  if (playDur > 0.3) state.avgSentenceSec = state.avgSentenceSec * 0.7 + playDur * 0.3;
  updateAudioBar();
  state.speaking = true;
  let ok = false;
  try {
    ok = await playClip(res, lang, { rate, text: s.text });
  } catch (err) {
    state.speaking = false;
    if (!narrAlive(myNarr)) return;
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    speakCurrent();
    return;
  }
  state.speaking = false;
  if (!narrAlive(myNarr)) return;
  if (!ok) {
    // v3.2: a sentence that will not play must NEVER halt narration silently
    // with the Pause icon stuck and the counter frozen (v3.1 live failure:
    // 0/26 forever, no error, no sound — for Google AND Kokoro, the play
    // step is shared). Skip the line and continue; stop only after 3 in a
    // row, with an honest message. Same rule as a synthesis failure (F6).
    console.warn('Skipping sentence that would not play', state.sentenceIndex);
    NEURAL.consecFail = (NEURAL.consecFail || 0) + 1;
    if (NEURAL.consecFail >= MAX_CONSEC_FAIL) {
      stopNarration(true);
      toast('Voice stopped — the audio would not play. Check your connection and try again.');
      return;
    }
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    speakCurrent();
    return;
  }
  NEURAL.consecFail = 0; // a sentence that actually played breaks the failure chain
  // v3.3 (F33): a sentence that actually played proves its voice is
  // downloaded — mark it, so the voice survives a reload and a different
  // book in the same language never re-downloads it (one-time loading).
  markLanguageDownloaded(lang);
  // v3.3 (F36): audio is playing, so any earlier voice error is stale — clear
  // it, or it would keep replacing the sentence counter in the audio bar.
  if (NEURAL.status) setNeuralStatus('');
  const pause = pauseAfterSentence();
  clearSentenceSpans();
  state.sentenceIndex++;
  savePosition();
  if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
  pauseTimer = setTimeout(() => { buildSentenceSpans(); scrollToSentence(); speakCurrent(); }, pause);
}
/* v3.2: start the first buffered Google chunk INSIDE the Play tap (a user
   gesture), so autoplay policy can never reject the later async play() call.
   If nothing is buffered yet this is a harmless no-op — the async path
   still races play() and skips on failure. (Kokoro has no pre-buffered
   element to unlock; its play() is covered by the same race + skip.) */
function gtUnlock() {
  if (!state.meta || langCode(state.meta.language) !== 'te') return;
  const key = gtSentenceKey(state.currentChapter, state.sentenceIndex) + '::c0';
  const slot = GT_POOL.find(s => s.key === key);
  if (!slot) return;
  const a = slot.el;
  if (a.readyState < 3 || !a.paused) return;
  try { const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
/* Play/Pause are synchronous and instant — they never await a download or a
   synthesis. Pause stops the audio at once and cancels pending work. */
function playNarration() {
  if (!state.meta || !state.sentences.length) return;
  if (state.playing) { pauseNarration(); return; }
  NEURAL.narrationToken++;
  NEURAL.consecFail = 0;
  state.playing = true;
  state.followNarration = true; // resuming re-attaches the view to the narration
  $('#btnPlay').textContent = '⏸';
  $('#btnPlayBelow').textContent = '⏸ Pause';
  startSleepTimer();
  gtUnlock();
  speakCurrent();
}
function pauseNarration() {
  state.playing = false;
  state.followNarration = true;
  clearTimeout(pauseTimer);
  stopNeural();
  state.speaking = false;
  $('#btnPlay').textContent = '▶';
  $('#btnPlayBelow').textContent = '▶ Read aloud';
  savePosition();
  updateAudioBar();
}
function stopNarration(resetBtn) {
  state.playing = false;
  state.followNarration = true;
  clearTimeout(pauseTimer);
  stopNeural();
  state.speaking = false;
  clearSentenceSpans();
  if (resetBtn !== false) { $('#btnPlay').textContent = '▶'; $('#btnPlayBelow').textContent = '▶ Read aloud'; }
  savePosition();
}
async function advanceChapterOrStop() {
  markChapterComplete(state.currentChapter);
  const next = nextNarratableChapter(state.currentChapter + 1);
  if (next == null) {
    stopNarration(true);
    toast('Finished the book');
    return;
  }
  await loadChapter(next);
  state.sentenceIndex = 0;
  savePosition();
  if (state.playing) speakCurrent();
}
function nextNarratableChapter(from) {
  for (let i = from; i < state.chapters.length; i++) {
    if (state.chapters[i].kind === 'toc' || state.chapters[i].kind === 'front') continue;
    return i;
  }
  return null;
}
// v3.3 (F34): the previous narratable chapter, for manual turns past the
// start of a chapter (mirrors nextNarratableChapter, skipping toc/front).
function prevNarratableChapter(from) {
  for (let i = from; i >= 0; i--) {
    if (state.chapters[i].kind === 'toc' || state.chapters[i].kind === 'front') continue;
    return i;
  }
  return null;
}
function markChapterComplete(i) {
  state.completedChapters[i] = true;
  try { localStorage.setItem('epubreader.done.' + state.meta.id, JSON.stringify(state.completedChapters)); } catch (e) {}
  updateChapterList(); renderLibrary();
}
function skipSeconds(sec) {
  const n = Math.max(1, Math.round(Math.abs(sec) / Math.max(2, state.avgSentenceSec)));
  const dir = sec < 0 ? -1 : 1;
  state.sentenceIndex = clamp(state.sentenceIndex + dir * n, 0, Math.max(0, state.sentences.length - 1));
  clearSentenceSpans();
  if (state.playing) { state.followNarration = true; stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
  else { buildSentenceSpans(); scrollToSentence(); }
  savePosition();
}
function nextSentence() {
  if (state.sentenceIndex < state.sentences.length - 1) {
    clearSentenceSpans(); state.sentenceIndex++;
    if (state.playing) { state.followNarration = true; stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
    else { buildSentenceSpans(); scrollToSentence(); }
  } else advanceChapterOrStop();
  savePosition();
}
function prevSentence() {
  clearSentenceSpans();
  state.sentenceIndex = Math.max(0, state.sentenceIndex - 1);
  if (state.playing) { state.followNarration = true; stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
  else { buildSentenceSpans(); scrollToSentence(); }
  savePosition();
}
function startSleepTimer() {
  clearTimeout(state.sleepTimerId);
  const mins = settings.sleepDefault || 0;
  if (!mins) return;
  state.sleepEndsAt = Date.now() + mins * 60000;
  state.sleepTimerId = setTimeout(() => { pauseNarration(); toast('Sleep timer stopped playback'); }, mins * 60000);
}
function updateHeader() {
  if (!state.meta) return;
  const t = $('#hdrTitle'), a = $('#hdrAuthor');
  if (t) t.textContent = state.meta.title || '—';
  if (a) a.textContent = state.meta.author || '';
}
function updateAudioBar() {
  updateHeader();
  const info = $('#abInfo');
  if (!info || !state.meta) return;
  // v3.3 (F36): a voice error is shown ONLY for a book in that error's
  // language. A stale Kokoro error must never replace the sentence counter
  // of a Telugu/Hindi (Google) book.
  if (NEURAL.status && (!NEURAL.statusLang || NEURAL.statusLang === langCode(state.meta.language))) { info.textContent = NEURAL.status; return; }
  const ch = state.chapters[state.currentChapter];
  const total = state.sentences.length || 1;
  const pct = Math.round((state.sentenceIndex / total) * 100);
  $('#abProgressFill').style.width = pct + '%';
  const remaining = Math.max(0, Math.round(((total - state.sentenceIndex) * state.avgSentenceSec) / 5) * 5);
  info.textContent = (ch ? ch.title : '') + ' · ' + state.sentenceIndex + '/' + total + ' · ' + fmtTime(remaining) + ' left in chapter';
}
function timeRemainingBook() {
  let secs = 0;
  for (let i = state.currentChapter; i < state.chapters.length; i++) {
    secs += 0;
  }
  return secs;
}
async function playFromStart() {
  if (!state.meta) return;
  const m = state.meta;
  const openLines = [];
  if (m.title) openLines.push({ text: m.title, paraIdx: -1, mood: 'neutral' });
  if (m.subtitle) openLines.push({ text: m.subtitle, paraIdx: -1, mood: 'neutral' });
  if (m.author) openLines.push({ text: 'by ' + m.author, paraIdx: -1, mood: 'neutral' });
  const introIdx = state.chapters.findIndex(c => c.kind === 'intro');
  const firstIdx = nextNarratableChapter(0);
  const target = introIdx >= 0 ? introIdx : (firstIdx != null ? firstIdx : 0);
  await loadChapter(target);
  state.sentences = openLines.concat(state.sentences);
  state.sentenceIndex = 0;
  state.playing = true;
  state.followNarration = true;
  $('#btnPlay').textContent = '⏸';
  startSleepTimer();
  speakCurrent();
}
async function startPreload() {
  if (!state.meta || state.preloadBusy) return;
  state.preloadBusy = true;
  try {
    let next = state.currentChapter + 1;
    const done = await idbCountChapters(state.meta.id).catch(() => 0);
    state.cacheCount = done;
    updateCacheInfo();
    while (next < state.chapters.length) {
      const cached = await idbGet('chapters', state.meta.id + '::' + next).catch(() => null);
      if (!cached) await loadChapterText(next).catch(() => null);
      state.cacheCount = await idbCountChapters(state.meta.id).catch(() => state.cacheCount + 1);
      updateCacheInfo();
      next++;
      await sleep(30);
      if (!state.meta) break;
    }
  } finally { state.preloadBusy = false; }
}

/* ---------------- bookmarks ---------------- */
function addBookmark(auto) {
  if (!state.meta) return;
  const s = state.sentences[state.sentenceIndex];
  const bm = { chapter: state.currentChapter, sentence: state.sentenceIndex, text: s ? s.text.slice(0, 90) : '', at: Date.now(), auto: !!auto };
  if (auto) {
    state.autoBookmark = bm;
    try { localStorage.setItem('epubreader.auto.' + state.meta.id, JSON.stringify(bm)); } catch (e) {}
    return;
  }
  const dup = state.bookmarks.findIndex(b => !b.auto && b.chapter === bm.chapter && b.sentence === bm.sentence);
  if (dup >= 0) {
    state.bookmarks.splice(dup, 1);
    try { localStorage.setItem('epubreader.bm.' + state.meta.id, JSON.stringify(state.bookmarks)); } catch (e) {}
    renderBookmarks();
    toast('Bookmark removed');
    return;
  }
  state.bookmarks.unshift(bm);
  state.bookmarks = state.bookmarks.slice(0, 50);
  try { localStorage.setItem('epubreader.bm.' + state.meta.id, JSON.stringify(state.bookmarks)); } catch (e) {}
  renderBookmarks();
  toast('Bookmark added');
}
function renderBookmarks() {
  const ul = $('#bookmarkList');
  if (!ul) return;
  ul.innerHTML = '';
  state.bookmarks.forEach((b, i) => {
    const li = el('li', null, '🔖 ' + (state.chapters[b.chapter] ? state.chapters[b.chapter].title : '') + ' — ' + b.text);
    li.onclick = () => { loadChapter(b.chapter).then(() => { state.pendingSentence = b.sentence; state.sentenceIndex = b.sentence; buildSentenceSpans(); scrollToSentence(); }); closeDrawer(); };
    const del = el('button', 'mini-btn', '✕');
    del.onclick = ev => { ev.stopPropagation(); state.bookmarks.splice(i, 1); try { localStorage.setItem('epubreader.bm.' + state.meta.id, JSON.stringify(state.bookmarks)); } catch (e) {} renderBookmarks(); };
    li.appendChild(del);
    ul.appendChild(li);
  });
}
window.addEventListener('beforeunload', () => { if (state.meta) { addBookmark(true); savePosition(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.meta) { addBookmark(true); savePosition(); } });

/* ---------------- highlights + notes ---------------- */
function addHighlight(text, note) {
  if (!state.meta || !text) return;
  state.highlights.unshift({ chapter: state.currentChapter, sentence: state.sentenceIndex, text: text.slice(0, 400), note: note || '', at: Date.now() });
  state.highlights = state.highlights.slice(0, 200);
  try { localStorage.setItem('epubreader.hl.' + state.meta.id, JSON.stringify(state.highlights)); } catch (e) {}
  renderHighlights();
  toast('Highlighted');
}
function renderHighlights() {
  const ul = $('#highlightList');
  if (!ul) return;
  ul.innerHTML = '';
  state.highlights.forEach(h => {
    const li = el('li', null, '✎ ' + h.text.slice(0, 80) + (h.note ? ' — ' + h.note : ''));
    li.onclick = () => { loadChapter(h.chapter).then(() => { state.pendingSentence = h.sentence; state.sentenceIndex = h.sentence; buildSentenceSpans(); scrollToSentence(); }); closeDrawer(); };
    ul.appendChild(li);
  });
}
function exportHighlights() {
  if (!state.meta) return;
  let out = (state.meta.title || 'Book') + ' — Highlights\n\n';
  state.highlights.forEach(h => { out += '• ' + h.text + (h.note ? '\n  Note: ' + h.note : '') + '\n\n'; });
  downloadText(out, (state.meta.title || 'book').replace(/[^\w\-]+/g, '_') + '-highlights.txt');
}
function downloadText(text, name) {
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------------- mini dictionary (built-in, offline) ---------------- */
const MINI_DICT = {
  the: 'used to point to a specific person or thing', a: 'one; any', an: 'one; any', and: 'joining word', of: 'belonging to', to: 'towards', in: 'inside', is: 'exists; equals', it: 'that thing', you: 'the person spoken to', that: 'the one over there', he: 'a man or boy', she: 'a woman or girl', was: 'past of is', for: 'meant for', on: 'on top of', are: 'plural of is', with: 'together with', his: 'belonging to him', they: 'more than one person', i: 'myself', at: 'in a place', be: 'to exist', this: 'the one here', have: 'to own', from: 'starting at', or: 'either one', one: 'a single thing', had: 'past of have', by: 'near; through', word: 'a unit of language', but: 'however', not: 'no', what: 'which thing', all: 'everything', were: 'past of are', we: 'you and I', when: 'at what time', your: 'belonging to you', can: 'to be able to', said: 'spoke', there: 'in that place', use: 'to make use of', each: 'every one', which: 'what one', do: 'to perform', how: 'in what way', their: 'belonging to them', if: 'on condition that', will: 'going to', up: 'towards the top', other: 'different', about: 'concerning', out: 'outside', many: 'a large number', then: 'after that', them: 'those people', these: 'the ones here', so: 'therefore', some: 'a few', her: 'belonging to her', would: 'past of will', make: 'to create', like: 'similar to; to enjoy', him: 'that man', into: 'inside', time: 'the passing of hours', has: 'owns', look: 'to see', two: 'the number 2', more: 'a greater amount', write: 'to put words on paper', go: 'to move', see: 'to notice with the eyes', number: 'a count', no: 'not any', way: 'a path; a manner', could: 'was able to', people: 'human beings', my: 'belonging to me', than: 'compared with', first: 'before all others', water: 'the liquid we drink', been: 'past of be', call: 'to shout; to name', who: 'which person', oil: 'a slippery liquid', its: 'belonging to it', now: 'at this moment', find: 'to discover', long: 'not short', down: 'towards the ground', day: '24 hours', did: 'past of do', get: 'to obtain', come: 'to arrive', made: 'past of make', may: 'possibly', part: 'a piece of something', love: 'a deep feeling of care', life: 'being alive', night: 'the dark part of the day', story: 'a tale of events', book: 'a set of written pages', read: 'to look at words and understand them', listen: 'to hear with attention', voice: 'the sound a person makes when speaking', chapter: 'a part of a book', page: 'one side of a sheet in a book', friend: 'a person you like and trust', home: 'the place where you live', heart: 'the organ that pumps blood; the centre of feelings', light: 'brightness; not heavy', dark: 'without light', world: 'the earth and everything on it', hand: 'the part at the end of your arm', eye: 'the organ you see with', mind: 'the part of you that thinks', dream: 'images in sleep; a hope', truth: 'what is real and true', secret: 'something hidden', fear: 'being afraid', hope: 'wanting something to happen', smile: 'a happy face expression', tear: 'a drop from the eye when sad', memory: 'something remembered', message: 'words sent to someone', phone: 'a device for calling and messaging', midnight: '12 o’clock at night', sister: 'a female sibling', brother: 'a male sibling', mother: 'a female parent', father: 'a male parent', village: 'a small place where people live', river: 'a large stream of water', rain: 'water falling from the sky', fire: 'burning flames', wind: 'moving air', sky: 'the space above the earth', star: 'a bright point of light at night', moon: 'the bright object in the night sky', sun: 'the star that gives us daylight', road: 'a way for vehicles and people', door: 'an entrance', window: 'an opening to see outside', room: 'a part of a house', house: 'a building where people live', school: 'a place for learning', teacher: 'a person who teaches', student: 'a person who learns', question: 'something asked', answer: 'a reply', work: 'a job; effort', money: 'coins and notes used to buy things', morning: 'the early part of the day', evening: 'the late part of the day', today: 'this day', tomorrow: 'the next day', yesterday: 'the day before today'
};
function defineWord(word) {
  const w = (word || '').toLowerCase().replace(/[^a-z\u0c00-\u0c7f\u0900-\u097f]/g, '');
  if (!w) return null;
  return MINI_DICT[w] || null;
}

/* ---------------- themes / fonts / direction ---------------- */
function applyTheme() {
  document.body.dataset.theme = settings.theme;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', settings.theme === 'dark' ? '#141414' : settings.theme === 'white' ? '#ffffff' : '#f6efdd');
  // v3.1: sync the Lighting-tab theme swatches (white / cream / black)
  $$('#themeSwatches .swatch').forEach(b => b.classList.toggle('active', b.dataset.theme === settings.theme));
}
function applyFont() {
  document.body.classList.remove('font-serif', 'font-sans', 'font-telugu');
  document.body.classList.add('font-' + (settings.font || 'serif'));
  const fs = [15, 17, 18, 20, 22][clamp(settings.fontSize - 1, 0, 4)];
  const lh = [1.5, 1.7, 1.9][clamp(settings.lineSpacing - 1, 0, 2)];
  document.documentElement.style.setProperty('--fs', fs + 'px');
  document.documentElement.style.setProperty('--lh', lh);
  document.body.classList.toggle('large-text', !!settings.largeText);
  document.body.classList.toggle('high-contrast', !!settings.highContrast);
  // v3.1: sync the Text-tab controls — font circles, size/spacing % steppers, alignment
  $$('#fontPick .font-opt').forEach(b => b.classList.toggle('active', b.dataset.font === settings.font));
  const fsp = $('#fontSizePct'); if (fsp) fsp.textContent = [80, 90, 100, 115, 130][clamp(settings.fontSize - 1, 0, 4)] + '%';
  const lsp = $('#lineSpacingPct'); if (lsp) lsp.textContent = [100, 120, 140][clamp(settings.lineSpacing - 1, 0, 2)] + '%';
  const al = $('#setAlign'); if (al) al.value = settings.align || 'default';
  // v3.3 (item 6): text is JUSTIFIED by default — a real book page aligns
  // both edges, with hyphenation. 'left' is the only opt-out; 'default'
  // and 'justify' both mean justified book typesetting.
  const alignVal = settings.align === 'left' ? 'left' : 'justify';
  ['#pageContent', '#pageContent2'].forEach(sel => { const pc = $(sel); if (pc) pc.style.textAlign = alignVal; });
}
/* v3.1: reading brightness + night light (Lighting tab). The brightness
   overlay dims the page; the night-light overlay warms it. Both are cheap
   fixed overlays that never touch the text layout. */
function applyLighting() {
  const b = $('#brightOverlay'), n = $('#nightOverlay');
  if (b) b.style.opacity = (settings.brightnessOn && settings.brightness < 100) ? String(((100 - settings.brightness) / 100) * 0.6) : '0';
  if (n) n.style.opacity = settings.nightLight ? '1' : '0';
}
function cycleTheme() {
  const order = ['book', 'white', 'dark'];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
  saveSettings(); savePerBookSettings(); applyTheme();
  toast('Theme: ' + settings.theme);
}
function setDirection(dir) {
  settings.direction = dir === 'horizontal' ? 'horizontal' : 'vertical';
  saveSettings(); savePerBookSettings();
  const d = $('#setDirection'); if (d) d.value = settings.direction;
  renderChapter();
  toast(dir === 'horizontal' ? 'Horizontal page flip' : 'Vertical pages');
}

/* ---------------- screens ---------------- */
function showScreen(name) {
  $('#home').classList.toggle('hidden', name !== 'home');
  $('#reader').classList.toggle('hidden', name !== 'reader');
  if (name === 'home') { renderLibrary(); renderContinueCard(); }
}
function openReader() {
  showScreen('reader');
  document.body.classList.remove('focus-mode');
  // v3.2: paginate once the reader is actually visible — the open flow
  // paginates while the reader is still hidden (clientHeight 0), so only
  // now are the measurements real. Idempotent: nodes are re-attached from
  // state.pageNodes and repacked.
  if (state.meta) paginate();
}
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerScrim').classList.add('hidden'); }
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerScrim').classList.remove('hidden'); }

/* ---------------- library UI ---------------- */
function renderLibrary() {
  const list = $('#recentList');
  if (!list) return;
  list.innerHTML = '';
  if (!library.length) { list.appendChild(el('div', 'empty-note', t('noBooksYet'))); return; }
  library.forEach(b => {
    const card = el('button', 'book-card');
    if (b.coverUrl) { const img = el('img', 'book-cover'); img.src = b.coverUrl; img.alt = ''; card.appendChild(img); }
    else card.appendChild(el('div', 'book-cover-ph', '📖'));
    const meta = el('div', 'book-meta');
    meta.appendChild(el('div', 'book-title', b.title));
    meta.appendChild(el('div', 'book-author', b.author || ''));
    const prog = b.chapters ? Math.round((b.progress || 0)) + '% · ' + (b.language || '').toUpperCase() : '';
    meta.appendChild(el('div', 'book-prog', prog));
    card.appendChild(meta);
    card.onclick = () => reopenBook(b.id);
    list.appendChild(card);
  });
}
function renderContinueCard() {
  const card = $('#continueCard');
  if (!card) return;
  const last = library[0];
  if (!last || (last.lastChapter == null && last.lastSentence == null)) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  $('#continueTitle').textContent = last.title + ' — ' + (last.author || '');
  $('#continuePos').textContent = 'Chapter ' + ((last.lastChapter || 0) + 1) + ' of ' + (last.chapters || '?') + ' · ' + (last.progress || 0) + '%';
  const recapEl = $('#continueRecap');
  try {
    const pos = JSON.parse(localStorage.getItem('epubreader.pos.' + last.id) || 'null');
    const auto = JSON.parse(localStorage.getItem('epubreader.auto.' + last.id) || 'null');
    if (auto && auto.text) { recapEl.textContent = 'Last time you stopped here: "' + auto.text + '"'; recapEl.classList.remove('hidden'); }
    else recapEl.classList.add('hidden');
  } catch (e) { recapEl.classList.add('hidden'); }
  $('#btnContinue').onclick = () => reopenBook(last.id);
}
async function reopenBook(id) {
  // v3.2 (F24): IndexedDB first, Cache API fallback — whichever holds the file.
  const rec = await loadBookFile(id);
  if (!rec || !rec.data) { toast('Book file is no longer stored — please open it again'); return; }
  const entry = library.find(b => b.id === id);
  showLoad('Opening book…', 20);
  const token = ++loadToken;
  try {
    if (rec.type === 'pdf') await openPdf(rec.data, entry ? entry.title + '.pdf' : 'book.pdf');
    else await openEpub(rec.data, entry ? entry.title + '.epub' : 'book.epub');
    if (token !== loadToken) return;
    const pos = loadPosition();
    if (pos) {
      await loadChapter(pos.chapter || 0);
      state.pendingSentence = pos.sentence || 0;
      state.sentenceIndex = clamp(pos.sentence || 0, 0, Math.max(0, state.sentences.length - 1));
      buildSentenceSpans(); scrollToSentence();
    } else {
      await loadChapter(nextNarratableChapter(0) || 0);
    }
    if (token !== loadToken) return;
    hideLoad();
    openReader();
    startPreload();
    updateAudioBar();
    prepareVoiceForBook();   // v3: auto-download the book's language
  } catch (e) { if (token === loadToken) showLoadError('Could not reopen book: ' + e.message); }
}

/* ---------------- loading overlay (v3): never hangs, always a way out ---------------- */
let loadToken = 0;
let lastFile = null;
function showLoad(msg, pct) {
  const ov = $('#loadOverlay'); if (!ov) return;
  ov.classList.remove('hidden');
  $('#loadMsg').textContent = msg || 'Loading…';
  $('#loadFill').style.width = (pct || 0) + '%';
  $('#btnLoadRetry').classList.add('hidden');
}
function setLoadProgress(pct, msg) {
  const ov = $('#loadOverlay'); if (!ov || ov.classList.contains('hidden')) return;
  if (msg) $('#loadMsg').textContent = msg;
  $('#loadFill').style.width = (pct || 0) + '%';
}
function showLoadError(msg) {
  const ov = $('#loadOverlay'); if (!ov) return;
  ov.classList.remove('hidden');
  $('#loadMsg').textContent = msg;
  $('#loadFill').style.width = '100%';
  $('#btnLoadRetry').classList.remove('hidden');
  toast(msg);
}
function hideLoad() {
  const ov = $('#loadOverlay'); if (ov) ov.classList.add('hidden');
}
/* ---------------- open book flow ---------------- */
async function handleFile(file) {
  if (!file) return;
  lastFile = file;
  const name = file.name || 'book';
  const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
  const isEpub = /\.epub$/i.test(name) || file.type === 'application/epub+zip';
  if (!isPdf && !isEpub) { toast('Please pick an EPUB or PDF file'); return; }
  const token = ++loadToken;
  showLoad('Opening ' + (isPdf ? 'PDF' : 'book') + '…', 5);
  // a stalled load fails CLEANLY after 30s with a retry — it never hangs
  const loadTimer = setTimeout(() => {
    if (token === loadToken) showLoadError('Opening is taking too long — your connection may be slow. Try again.');
  }, 30000);
  try {
    const buf = await file.arrayBuffer();
    if (token !== loadToken) { clearTimeout(loadTimer); return; }
    setLoadProgress(30, 'Reading the file…');
    await sleep(0); // yield so the progress bar actually paints
    let meta;
    if (isPdf) meta = await openPdf(buf, name);
    else meta = await openEpub(buf, name);
    if (token !== loadToken) { clearTimeout(loadTimer); return; }
    setLoadProgress(70, 'Building chapters…');
    // v3.1 (Continue fix): the EPUB file itself MUST be persisted before the
    // reader opens. The v3 fire-and-forget put silently swallowed failures,
    // so "Continue" later found no file. Now we AWAIT it and READ IT BACK;
    // if it fails we tell the user plainly instead of pretending it saved.
    // v3.2 (F24): if IndexedDB itself cannot store the book, saveBookFile
    // falls back to the Cache API and says which store held it — the error
    // name is shown, never swallowed into a generic message.
    setLoadProgress(80, 'Saving the book for later…');
    const saved = await saveBookFile(meta, isPdf, buf);
    if (!saved.ok) {
      console.error('book persist failed', saved.error, saved.cacheError);
      toast('Book opened, but it could not be saved — Continue may not work. (' + (saved.error && saved.error.name ? saved.error.name : 'storage error') + ')');
    } else if (saved.via === 'cache') {
      console.warn('book saved to offline cache; IndexedDB failed:', saved.idbError);
      toast('Book saved to offline cache — Continue will work.');
    }
    try { localStorage.removeItem('epubreader.pos.' + meta.id); } catch (e) {}
    try { localStorage.removeItem('epubreader.auto.' + meta.id); } catch (e) {}
    await loadChapter(nextNarratableChapter(0) || 0);
    if (token !== loadToken) { clearTimeout(loadTimer); return; }
    setLoadProgress(100, 'Ready');
    clearTimeout(loadTimer);
    hideLoad();
    openReader();
    startPreload();
    updateAudioBar();
    prepareVoiceForBook();   // v3: the book's language downloads NOW, top bar
    if (isPdf) {
      toast('PDF converted — starting read-aloud');
      setTimeout(() => playFromStart(), 600);
    }
  } catch (e) {
    clearTimeout(loadTimer);
    if (token !== loadToken) return;
    console.error(e);
    showLoadError('Could not open this file: ' + (e.message || e));
  }
}

/* ---------------- search in book ---------------- */
async function searchBook(q) {
  const res = $('#searchResults');
  res.innerHTML = '';
  q = (q || '').trim();
  if (q.length < 2) return;
  const hits = [];
  for (let i = 0; i < state.chapters.length && hits.length < 20; i++) {
    const rec = await loadChapterText(i).catch(() => null);
    if (!rec) continue;
    rec.paras.forEach((p, pi) => {
      if (p.text && p.text.toLowerCase().indexOf(q.toLowerCase()) >= 0 && hits.length < 20) {
        hits.push({ ch: i, text: p.text });
      }
    });
  }
  if (!hits.length) { res.appendChild(el('div', null, 'No matches')); return; }
  hits.forEach(h => {
    const d = el('div', null, (state.chapters[h.ch] ? state.chapters[h.ch].title : '') + ' — ' + h.text.slice(0, 80));
    d.onclick = () => { loadChapter(h.ch); closeDrawer(); };
    res.appendChild(d);
  });
}

/* ---------------- selection menu (define / hear / highlight / copy) ---------------- */
let selText = '';
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  const menu = $('#selectionMenu');
  if (!sel || sel.isCollapsed || !sel.toString().trim()) { menu.classList.add('hidden'); return; }
  const range = sel.getRangeAt(0);
  const area = $('#pageContent');
  if (!area.contains(range.commonAncestorContainer)) { menu.classList.add('hidden'); return; }
  selText = sel.toString().trim();
  const r = range.getBoundingClientRect();
  menu.style.left = clamp(r.left, 8, window.innerWidth - 260) + 'px';
  menu.style.top = clamp(r.top - 48, 8, window.innerHeight - 60) + 'px';
  menu.classList.remove('hidden');
});
$('#selectionMenu') && $('#selectionMenu').addEventListener('click', ev => {
  const act = ev.target.dataset && ev.target.dataset.act;
  if (!act || !selText) return;
  const popup = $('#definePopup');
  if (act === 'copy') { navigator.clipboard && navigator.clipboard.writeText(selText).catch(() => {}); toast('Copied'); }
  if (act === 'hear') {
    const lang = state.meta ? state.meta.language : 'en';
    pauseNarration();
    speakNeural(selText, lang, { rate: 1 }).catch(() => toast('Voice needs one download — connect to the internet once, then it works offline.'));
  }
  if (act === 'highlight') {
    const note = prompt('Add a note (optional):', '') || '';
    addHighlight(selText, note);
  }
  if (act === 'define') {
    const def = defineWord(selText);
    popup.innerHTML = '<h4>' + esc(selText) + '</h4>' +
      (def ? '<p>' + esc(def) + '</p>' : '<p>Not in the offline dictionary. <a href="https://www.google.com/search?q=define+' + encodeURIComponent(selText) + '" target="_blank" rel="noopener">Search online</a> (needs internet).</p>');
    popup.classList.remove('hidden');
    const r = $('#selectionMenu').getBoundingClientRect();
    popup.style.left = clamp(r.left, 8, window.innerWidth - 340) + 'px';
    popup.style.top = clamp(r.bottom + 8, 8, window.innerHeight - 160) + 'px';
    setTimeout(() => popup.classList.add('hidden'), 9000);
  }
  $('#selectionMenu').classList.add('hidden');
  window.getSelection().removeAllRanges();
});

/* ---------------- tap-to-hear: tap a WORD to hear it, tap a paragraph to narrate from there ---------------- */
const pageClickHandler = ev => {
  // v3.2: a drag-curl release is not a tap — never speak a word for it.
  if (suppressClick) return;
  const wEl = ev.target.closest('.w');
  if (wEl && wEl.textContent) {
    const lang = state.meta ? state.meta.language : 'en';
    pauseNarration();
    speakNeural(wEl.textContent, lang, { rate: 1 }).catch(() => {});
    return;
  }
  const sEl = ev.target.closest('.sentence');
  if (sEl) return;
  const p = ev.target.closest('[data-para]');
  if (!p) return;
  const pi = Number(p.dataset.para);
  const idx = state.sentences.findIndex(s => s.paraIdx === pi);
  if (idx < 0) return;
  clearSentenceSpans();
  state.sentenceIndex = idx;
  if (!state.playing) playNarration();
  else { stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
};
// v3.2: tap-to-hear works on BOTH page panels in two-page mode.
$('#pageContent').addEventListener('click', pageClickHandler);
$('#pageContent2').addEventListener('click', pageClickHandler);

/* ---------------- backup / restore / storage / voices ---------------- */
function backupLibrary() {
  const data = { app: 'offline-epub-reader', version: 3, at: new Date().toISOString(), settings, library, positions: {}, bookmarks: {}, highlights: {} };
  library.forEach(b => {
    try { data.positions[b.id] = JSON.parse(localStorage.getItem('epubreader.pos.' + b.id) || 'null'); } catch (e) {}
    try { data.bookmarks[b.id] = JSON.parse(localStorage.getItem('epubreader.bm.' + b.id) || '[]'); } catch (e) {}
    try { data.highlights[b.id] = JSON.parse(localStorage.getItem('epubreader.hl.' + b.id) || '[]'); } catch (e) {}
  });
  downloadText(JSON.stringify(data, null, 2), 'epub-reader-backup.json');
  toast('Backup downloaded (book files are not included — re-open books after restore)');
}
async function restoreLibrary(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.settings) { settings = Object.assign({}, defaults, data.settings); saveSettings(); applyTheme(); applyFont(); applyI18n(); }
    if (Array.isArray(data.library)) {
      data.library.forEach(b => {
        if (!library.find(x => x.id === b.id)) library.push(b);
        if (data.positions && data.positions[b.id]) localStorage.setItem('epubreader.pos.' + b.id, JSON.stringify(data.positions[b.id]));
        if (data.bookmarks && data.bookmarks[b.id]) localStorage.setItem('epubreader.bm.' + b.id, JSON.stringify(data.bookmarks[b.id]));
        if (data.highlights && data.highlights[b.id]) localStorage.setItem('epubreader.hl.' + b.id, JSON.stringify(data.highlights[b.id]));
      });
      saveLibrary(); renderLibrary(); renderContinueCard();
    }
    toast('Library restored — re-open each book file once to listen again');
  } catch (e) { toast('Restore failed: ' + e.message); }
}
async function renderStoragePanel() {
  const p = $('#storagePanel');
  const est = await (navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({})).catch(() => ({}));
  const books = await idbAll('books').catch(() => []);
  // v3.3 (F35): count books from BOTH stores (IndexedDB + the Cache API
  // fallback) as a union by id — the old code counted IndexedDB only, so a
  // book held only in the cache showed as "No books cached yet" while its
  // library card insisted the file was stored.
  const cacheBooks = [];
  try {
    if (window.caches) {
      const cache = await caches.open(BOOK_CACHE);
      const keys = await cache.keys();
      for (const k of keys) {
        const id = decodeURIComponent(new URL(k.url).pathname.split('/').pop() || '');
        if (id && !books.some(b => b.id === id)) {
          let bm = null;
          try { bm = JSON.parse(localStorage.getItem('epubreader.bookmeta.' + id) || 'null'); } catch (e) {}
          const buf = await bookCacheGet(id).catch(() => null);
          cacheBooks.push({ id, title: (bm && bm.title) || id, data: buf ? { byteLength: buf.byteLength } : null, viaCache: true });
        }
      }
    }
  } catch (e) {}
  const all = books.concat(cacheBooks);
  let html = '<h3>Storage</h3>';
  html += '<p>Used: ' + ((est.usage || 0) / 1048576).toFixed(1) + ' MB of ' + ((est.quota || 0) / 1073741824).toFixed(1) + ' GB available.</p>';
  if (!all.length) html += '<p>No books cached yet.</p>';
  all.forEach(b => {
    html += '<div class="row"><span>' + esc(b.title || b.id) + ' — ' + ((b.data ? b.data.byteLength : 0) / 1048576).toFixed(1) + ' MB' + (b.viaCache ? ' (offline cache)' : '') + '</span><button class="mini-btn" data-del="' + esc(b.id) + '">Delete</button></div>';
  });
  p.innerHTML = html;
  p.classList.remove('hidden');
  p.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.del;
      await idbDelete('books', id).catch(() => {});
      // v3.3 (F35): a book may live in the Cache API fallback too — delete
      // that copy as well, or "Delete" leaves the file behind.
      try { if (window.caches) { const c = await caches.open(BOOK_CACHE); await c.delete(new Request(bookCacheKey(id))); } } catch (e) {}
      try { localStorage.removeItem('epubreader.bookmeta.' + id); } catch (e) {}
      const chs = await idbAll('chapters').catch(() => []);
      for (const c of chs.filter(c => c.key.indexOf(id + '::') === 0)) await idbDelete('chapters', c.key).catch(() => {});
      await idbClearAudioForBook(id).catch(() => {});
      library = library.filter(b => b.id !== id); saveLibrary();
      renderLibrary(); renderContinueCard(); renderStoragePanel();
      toast('Book removed from storage');
    };
  });
}
function updateVoicePanel() {
  const p = $('#voicePanel');
  if (!p) return;
  const status = NEURAL.status ? '<p class="voice-status">' + esc(NEURAL.status) + '</p>' : '';
  const cur = state.meta ? langDisplayName(langCode(state.meta.language)) : null;
  p.innerHTML = '<h3>Voices in this browser</h3>' +
    (cur ? '<p><b>This book (' + esc(cur) + '):</b> ' + (langCode(state.meta.language) === 'te' ? 'Google Telugu voice — clear and natural' : 'Kokoro — ' + esc(neuralVoiceFor(state.meta.language))) + '</p>' : '') +
    '<p><b>English:</b> Kokoro — af_bella (natural, expressive)</p>' +
    '<p><b>Hindi:</b> Kokoro — hf_alpha</p>' +
    '<p><b>Telugu:</b> Google Telugu voice — clear and natural. No device voice or install is needed.</p>' +
    '<p>Each voice downloads when you open a book in that language, then works offline. Nothing is installed on your device.</p>' +
    status;
}

/* ---------------- mood menu ---------------- */
function openMoodMenu() {
  const m = $('#moodMenu');
  m.innerHTML = '';
  Object.keys(MOODS).forEach(name => {
    if (name === 'dialogue') return;
    const b = el('button', null, MOODS[name].label + (state.chapters[state.currentChapter] && state.chapters[state.currentChapter].mood === name ? ' ✓' : ''));
    b.onclick = () => {
      if (state.chapters[state.currentChapter]) state.chapters[state.currentChapter].mood = name;
      setMood(name, true);
      m.classList.add('hidden');
      const si = state.sentenceIndex;
      state.sentences = parasToSentences(state.paragraphs, name);
      state.sentenceIndex = clamp(si, 0, Math.max(0, state.sentences.length - 1));
    };
    m.appendChild(b);
  });
  const off = el('button', null, settings.moodFollow ? 'Turn mood-following off' : 'Turn mood-following on');
  off.onclick = () => { settings.moodFollow = !settings.moodFollow; saveSettings(); setMood(state.mood); m.classList.add('hidden'); };
  m.appendChild(off);
  m.classList.remove('hidden');
}

/* ---------------- wiring ---------------- */
function wire() {
  // v3.2: re-paginate whenever the page area itself changes size (the
  // download bar showing/hiding is the common case — a window resize
  // does NOT fire for it, so the resize handler alone misses it).
  if (!flipRO && 'ResizeObserver' in window) {
    flipRO = new ResizeObserver(onFlipResize);
    const fw = document.querySelector('#flipWrap');
    if (fw) flipRO.observe(fw);
  }
  $('#btnOpenBook').onclick = () => $('#fileInput').click();
  $('#fileInput').addEventListener('change', ev => { handleFile(ev.target.files[0]); ev.target.value = ''; });
  $('#restoreInput').addEventListener('change', ev => { if (ev.target.files[0]) restoreLibrary(ev.target.files[0]); ev.target.value = ''; });
  $('#btnBack').onclick = () => { stopNarration(false); showScreen('home'); };
  $('#btnPlay').onclick = playNarration;
  $('#btnPlayBelow').onclick = playNarration;
  $('#btnPrev').onclick = prevSentence;
  $('#btnNext').onclick = nextSentence;
  $('#btnBack15').onclick = () => skipSeconds(-15);
  $('#btnFwd15').onclick = () => skipSeconds(15);
  $('#btnBookmark').onclick = () => addBookmark(false);
  $('#btnSleep').onclick = () => $('#sleepMenu').classList.toggle('hidden');
  $('#btnChapters').onclick = () => { const d = $('#drawer'); d.classList.contains('open') ? closeDrawer() : openDrawer(); };
  $('#btnDrawerClose').onclick = closeDrawer;
  $('#drawerScrim').onclick = closeDrawer;
  $('#btnTheme').onclick = cycleTheme;
  $('#btnFocus').onclick = () => document.body.classList.toggle('focus-mode');
  $('#btnReaderSettings').onclick = () => $('#settingsSheet').classList.remove('hidden');
  $('#btnHomeSettings').onclick = () => $('#settingsSheet').classList.remove('hidden');
  $('#btnSettingsClose').onclick = () => $('#settingsSheet').classList.add('hidden');
  $('#settingsSheet').addEventListener('click', ev => { if (ev.target.id === 'settingsSheet') ev.target.classList.add('hidden'); });
  $('#btnMoodMenu').onclick = openMoodMenu;
  $('#btnExportHighlights').onclick = exportHighlights;
  $('#btnBackup').onclick = backupLibrary;
  $('#btnRestore').onclick = () => $('#restoreInput').click();
  $('#btnStorage').onclick = () => { const p = $('#storagePanel'); p.classList.contains('hidden') ? renderStoragePanel() : p.classList.add('hidden'); };
  $('#btnVoiceSetup').onclick = () => { updateVoicePanel(); $('#voiceSheet').classList.remove('hidden'); };
  $('#btnVoiceClose').onclick = () => $('#voiceSheet').classList.add('hidden');
  $('#voiceSheet').addEventListener('click', ev => { if (ev.target.id === 'voiceSheet') ev.target.classList.add('hidden'); });
  $('#btnLanguages').onclick = () => { renderLangList(); $('#langSheet').classList.remove('hidden'); };
  $('#btnLangClose').onclick = () => $('#langSheet').classList.add('hidden');
  $('#langSheet').addEventListener('click', ev => { if (ev.target.id === 'langSheet') ev.target.classList.add('hidden'); });
  $('#btnLoadRetry').onclick = () => { if (lastFile) { hideLoad(); handleFile(lastFile); } else hideLoad(); };
  $('#btnLoadCancel').onclick = () => { loadToken++; hideLoad(); };
  $('#speedSel').addEventListener('change', ev => { state.speed = parseFloat(ev.target.value) || 1; savePerBookSettings(); });
  $('#sleepMenu').addEventListener('click', ev => {
    const min = ev.target.dataset && ev.target.dataset.min;
    if (min == null) return;
    settings.sleepDefault = parseInt(min, 10) || 0; saveSettings();
    $('#sleepMenu').classList.add('hidden');
    toast(min === '0' ? 'Sleep timer off' : 'Sleep timer: ' + min + ' min');
    if (state.playing) startSleepTimer();
  });
  $('#searchInput').addEventListener('input', ev => searchBook(ev.target.value));
  $('#btnGotoPage').onclick = () => {
    const n = parseInt($('#gotoPageInput').value, 10);
    if (!n || n < 1) return;
    const total = cachedPageTotal();
    const page = clamp(n, 1, total);
    showPage(page - 1, false, true);
    updatePageFooter();
  };
  let footerRaf = null;
  $('#pageContent').addEventListener('scroll', () => {
    if (footerRaf) return;
    footerRaf = requestAnimationFrame(() => { footerRaf = null; updatePageFooter(); });
  }, { passive: true });
  // v3: no native selection menu while reading — long-press/drag on the text
  // must not pop the OS Translate/Copy menu. Tap-to-hear still works.
  $('#pageContent').addEventListener('contextmenu', ev => ev.preventDefault());
  document.addEventListener('contextmenu', ev => {
    if (ev.target && ev.target.closest && ev.target.closest('#pageContent')) ev.preventDefault();
  });
  // v3.1: Text/Lighting tab controls (replaces the old setTheme/setFont/
  // setFontSize/setLineSpacing selects, which no longer exist).
  $('#setDirection').addEventListener('change', ev => setDirection(ev.target.value));
  $$('#themeSwatches .swatch').forEach(b => b.addEventListener('click', () => { settings.theme = b.dataset.theme; saveSettings(); savePerBookSettings(); applyTheme(); }));
  $$('#fontPick .font-opt').forEach(b => b.addEventListener('click', () => { settings.font = b.dataset.font; saveSettings(); savePerBookSettings(); applyFont(); if (state.meta) paginate(); }));
  $('#btnFontMinus').onclick = () => { settings.fontSize = clamp(settings.fontSize - 1, 1, 5); saveSettings(); applyFont(); if (state.meta) paginate(); };
  $('#btnFontPlus').onclick = () => { settings.fontSize = clamp(settings.fontSize + 1, 1, 5); saveSettings(); applyFont(); if (state.meta) paginate(); };
  $('#btnLineMinus').onclick = () => { settings.lineSpacing = clamp(settings.lineSpacing - 1, 1, 3); saveSettings(); applyFont(); if (state.meta) paginate(); };
  $('#btnLinePlus').onclick = () => { settings.lineSpacing = clamp(settings.lineSpacing + 1, 1, 3); saveSettings(); applyFont(); if (state.meta) paginate(); };
  $('#setAlign').addEventListener('change', ev => { settings.align = ev.target.value; saveSettings(); savePerBookSettings(); applyFont(); });
  // v3.1: Lighting tab — brightness + night light.
  $('#setBrightnessOn').addEventListener('change', ev => { settings.brightnessOn = ev.target.checked; saveSettings(); applyLighting(); });
  $('#setBrightness').addEventListener('input', ev => { settings.brightness = parseInt(ev.target.value, 10) || 100; saveSettings(); applyLighting(); });
  $('#setNightLight').addEventListener('change', ev => { settings.nightLight = ev.target.checked; saveSettings(); applyLighting(); });
  // v3.1: reading toggles (Lighting tab).
  $('#setPage3d').addEventListener('change', ev => { settings.page3d = ev.target.checked; saveSettings(); });
  // v3.2: two-page spread (Text tab) — one or two pages on wide screens.
  $('#setTwoPage').addEventListener('change', ev => { settings.twoPage = ev.target.checked; saveSettings(); savePerBookSettings(); if (state.meta) paginate(); });
  $('#setVolumeKeys').addEventListener('change', ev => { settings.volumeKeys = ev.target.checked; saveSettings(); });
  $('#setAutoReadAloud').addEventListener('change', ev => { settings.autoReadAloud = ev.target.checked; saveSettings(); });
  $('#setDefPreview').addEventListener('change', ev => { settings.defPreview = ev.target.checked; saveSettings(); });
  $('#setOfflineDict').addEventListener('change', ev => { settings.offlineDict = ev.target.checked; saveSettings(); });
  $('#setGenre').addEventListener('change', ev => { settings.genre = ev.target.value; saveSettings(); if (state.meta) { const m = moodOfChapter(state.chapters[state.currentChapter]); setMood(m); } });
  $('#setMoodFollow').addEventListener('change', ev => { settings.moodFollow = ev.target.checked; saveSettings(); setMood(state.mood); });
  $('#setSleepDefault').addEventListener('change', ev => { settings.sleepDefault = parseInt(ev.target.value, 10) || 0; saveSettings(); });
  $('#setLargeText').addEventListener('change', ev => { settings.largeText = ev.target.checked; saveSettings(); applyFont(); });
  $('#setHighContrast').addEventListener('change', ev => { settings.highContrast = ev.target.checked; saveSettings(); applyFont(); });
  document.addEventListener('keydown', ev => {
    // v3.2 (F25): Escape closes the Contents drawer (and any open sheet/menu)
    // — including from inside the drawer's search box, so this runs before
    // the input-field early return below.
    if (ev.key === 'Escape') { closeDrawer(); $('#settingsSheet').classList.add('hidden'); const rm = $('#readerMenu'); if (rm) rm.classList.add('hidden'); return; }
    if ($('#reader').classList.contains('hidden')) return;
    // v3.3 (F34): when the page slider has focus, ArrowRight/ArrowLeft must
    // turn by a full spread. The slider's native 1-page step stays inside
    // the same spread in two-page mode (floor alignment), so it looked dead.
    if (ev.target && ev.target.id === 'pageSlider' && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      ev.preventDefault();
      showPage(state.currentPage + (ev.key === 'ArrowRight' ? pageStep() : -pageStep()), false, true);
      return;
    }
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target.tagName === 'TEXTAREA') return;
    if (ev.code === 'Space') { ev.preventDefault(); playNarration(); }
    // v3.2: in every mode the arrow keys turn PAGES (the page is the unit —
    // vertical mode is paged too now, no scrolling). Volume keys turn pages
    // too when the setting is on.
    else if (ev.key === 'ArrowRight') { showPage(state.currentPage + pageStep(), false, true); }
    else if (ev.key === 'ArrowLeft') { showPage(state.currentPage - pageStep(), false, true); }
    else if ((ev.key === 'VolumeUp' || ev.key === 'VolumeDown') && settings.volumeKeys) { ev.preventDefault(); showPage(state.currentPage + (ev.key === 'VolumeUp' ? pageStep() : -pageStep()), false, true); }
    else if (ev.key === 'b' || ev.key === 'B') addBookmark(false);
    else if (ev.key === 'm' || ev.key === 'M') openMoodMenu();
  });
  // v3.2 — interactive drag-driven curl (Play Books): the page PEELS in real
  // time, following the finger/mouse during the drag — not a canned animation
  // after the swipe ends. On release past ~1/3 of the page (or a fast flick)
  // the turn completes; otherwise the leaf springs back to the current page.
  // A drag that ends in a tap must not trigger tap-to-hear (suppressClick).
  let swipeX = null, swipeY = null, swipeT0 = 0;
  let drag = null; // {dir, leaf, startX, panelW, target, origin, startAngle, swapped, progress}
  const fw = $('#flipWrap');
  fw.addEventListener('pointerdown', ev => {
    // v3.3 (F34): a press on a button (the on-page ‹ › turn buttons live
    // inside #flipWrap) must NOT start a drag or capture the pointer. The
    // old code captured every pointerdown, which retargeted the pointerup
    // to the wrap — the click then fired on the wrap instead of the button,
    // so the ‹ › buttons were dead for real mouse/touch input.
    if (ev.target && ev.target.closest && ev.target.closest('button, a, input, select, textarea')) return;
    swipeX = ev.clientX; swipeY = ev.clientY; swipeT0 = ev.timeStamp || 0; drag = null;
    // v3.3 (F08): do NOT capture the pointer here. Capturing on pointerdown
    // retargets the pointerup — and therefore the click — to #flipWrap, so
    // a plain tap on page text never reaches the tap-to-hear handler on
    // #pageContent/#pageContent2 (the click fires on the wrap, which is
    // the pages' PARENT, so it never bubbles through them). The pointer is
    // captured only once a drag actually starts (below), so taps keep
    // their click and drags still track outside the element.
  });
  fw.addEventListener('pointermove', ev => {
    if (swipeX == null) return;
    const dx = ev.clientX - swipeX, dy = ev.clientY - swipeY;
    if (!drag) {
      if (settings.direction !== 'horizontal' || Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      const dir = dx < 0 ? 1 : -1;
      const target = state.currentPage + dir * pageStep();
      let crossChapter = null;
      if (!state.pages.length || target < 0 || target >= state.pages.length) {
        // v3.3 (F34): a swipe past the chapter edge turns to the next /
        // previous chapter instead of dying. No adjacent chapter → dead.
        crossChapter = dir > 0 ? nextNarratableChapter(state.currentChapter + 1) : prevNarratableChapter(state.currentChapter - 1);
        if (crossChapter == null) { drag = { dead: true }; return; }
      }
      if (settings.page3d === false) { drag = { dead: true }; return; } // 3D off: plain swipe on release
      const turning = dir > 0 ? (perView() === 2 ? $('#pageNext') : $('#pageCurrent')) : $('#pageCurrent');
      const leaf = buildTurnLeaf(turning, dir);
      if (perView() === 2 && dir < 0) leaf.classList.add('spine-right');
      drag = { dir, leaf, startX: swipeX, panelW: Math.max(200, turning.clientWidth || 300), target: crossChapter != null ? null : target, origin: state.currentPage, startAngle: dir > 0 ? 0 : -180, swapped: false, progress: 0, crossChapter };
      // v3.3 (F08): capture the pointer NOW that a drag has started, so the
      // curl keeps tracking even if the finger/mouse leaves the element.
      // (Capturing on pointerdown broke tap-to-hear — the tap's click was
      // retargeted to the wrap instead of the page text.)
      try { fw.setPointerCapture(ev.pointerId); } catch (e) {}
      leaf.style.transform = 'rotateY(' + drag.startAngle + 'deg)';
      // v3.3 (F34): fall through and process THIS move's progress at once.
      // The old code returned here, so a stepped drag (one big jump, then
      // release) created the drag but never set progress — the release saw
      // progress 0 and sprang back. Only smooth multi-move drags worked.
    }
    if (drag.dead) return;
    const dx2 = ev.clientX - drag.startX;
    const progress = clamp(Math.abs(dx2) / drag.panelW, 0, 1);
    const angle = drag.dir > 0 ? -180 * progress : -180 * (1 - progress);
    const pinch = 1 - 0.06 * Math.sin(progress * Math.PI); // paper bends a little mid-turn
    drag.leaf.style.transform = 'rotateY(' + angle.toFixed(1) + 'deg) scaleX(' + pinch.toFixed(3) + ')';
    drag.progress = progress;
    // the new page is revealed UNDER the leaf as it curls away; if the user
    // drags back, the old page comes back under it. (Cross-chapter drags
    // have no in-chapter target page — the next chapter opens on release.)
    if (drag.target != null && progress > 0.06 && !drag.swapped) { paintPages(drag.target); drag.swapped = true; }
    else if (drag.target != null && progress <= 0.06 && drag.swapped) { paintPages(drag.origin); drag.swapped = false; }
  });
  const endDrag = ev => {
    if (swipeX == null && !drag) return;
    const dx = swipeX == null ? 0 : ev.clientX - swipeX;
    const dy = swipeY == null ? 0 : ev.clientY - swipeY;
    if (drag && drag.leaf) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 350);
      const dt = Math.max(1, (ev.timeStamp || 0) - (swipeT0 || ev.timeStamp || 0));
      const vx = Math.abs(dx) / dt; // px per ms
      const complete = (drag.progress || 0) >= 0.33 || ((drag.progress || 0) >= 0.12 && vx > 0.6);
      const endAngle = drag.dir > 0 ? (complete ? -180 : 0) : (complete ? 0 : -180);
      if (complete) {
        if (drag.crossChapter != null) {
          // v3.3 (F34): the curl finishes, then the next/previous chapter opens.
          const chIdx = drag.crossChapter, d = drag.dir;
          loadChapter(chIdx).then(() => showPage(d > 0 ? 0 : state.totalPages - 1, true));
        } else {
          // a completed manual turn detaches the view from the narration —
          // set it BEFORE painting, so paintPages re-attaches if the landed
          // spread holds the sentence being read. The explicit re-check after
          // is for the mid-drag paint (progress > 0.06 already painted the
          // target before the detach was set).
          if (state.playing) state.followNarration = false;
          if (!drag.swapped) paintPages(drag.target);
          if (state.playing) { const np = pageForSentence(state.sentenceIndex); if (np >= state.currentPage && np < state.currentPage + perView()) state.followNarration = true; }
        }
      } else if (drag.swapped) {
        paintPages(drag.origin);
      }
      const leaf = drag.leaf;
      leaf.classList.add('settling'); // CSS transition animates to the end angle
      leaf.style.transform = 'rotateY(' + endAngle + 'deg)';
      setTimeout(() => leaf.remove(), 320);
      drag = null; swipeX = null; swipeY = null;
      return;
    }
    drag = null;
    // no interactive drag: a quick flick still turns the page (v3.1 swipe).
    if (swipeX != null && settings.direction === 'horizontal' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) showPage(state.currentPage + pageStep(), false, true);
      else showPage(state.currentPage - pageStep(), false, true);
    } else if (swipeX != null && settings.direction !== 'horizontal' && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      // v3.2: vertical mode is paged too — a vertical swipe turns the page.
      if (dy < 0) showPage(state.currentPage + 1, false, true);
      else showPage(state.currentPage - 1, false, true);
    }
    swipeX = null; swipeY = null;
  };
  fw.addEventListener('pointerup', endDrag);
  fw.addEventListener('pointercancel', () => {
    if (drag && drag.leaf) {
      const leaf = drag.leaf;
      if (drag.swapped) paintPages(drag.origin);
      leaf.classList.add('settling');
      leaf.style.transform = 'rotateY(' + drag.startAngle + 'deg)';
      setTimeout(() => leaf.remove(), 320);
    }
    drag = null; swipeX = null; swipeY = null;
  });
  window.addEventListener('resize', () => { if (state.meta && settings.direction === 'horizontal') paginate(); if (state.meta) scheduleSettle(); });

  /* ================= v3.1 wiring ================= */
  // Contents drawer tabs: Chapters / Bookmarks / Notes.
  $$('.drawer-tab').forEach(b => b.addEventListener('click', () => {
    $$('.drawer-tab').forEach(x => x.classList.toggle('active', x === b));
    $('#drawerTabChapters').classList.toggle('hidden', b.dataset.tab !== 'chapters');
    $('#drawerTabBookmarks').classList.toggle('hidden', b.dataset.tab !== 'bookmarks');
    $('#drawerTabNotes').classList.toggle('hidden', b.dataset.tab !== 'notes');
    if (b.dataset.tab === 'notes') renderNotes();
    if (b.dataset.tab === 'chapters') updateChapterList();
  }));
  // Settings sheet tabs: Text / Lighting.
  $$('.sheet-tab').forEach(b => b.addEventListener('click', () => {
    $$('.sheet-tab').forEach(x => x.classList.toggle('active', x === b));
    $('#setTabText').classList.toggle('hidden', b.dataset.tab !== 'text');
    $('#setTabLighting').classList.toggle('hidden', b.dataset.tab !== 'lighting');
  }));
  // Reader 3-dot menu (Play Books): Remove bookmark, Read aloud, Settings, Help, Feedback.
  $('#btnMenu').onclick = ev => { ev.stopPropagation(); $('#readerMenu').classList.toggle('hidden'); };
  document.addEventListener('click', ev => {
    const m = $('#readerMenu');
    if (m && !m.classList.contains('hidden') && !ev.target.closest('#readerMenu') && ev.target.id !== 'btnMenu') m.classList.add('hidden');
  });
  $('#menuRemoveBookmark').onclick = () => { $('#readerMenu').classList.add('hidden'); removeCurrentBookmark(); };
  $('#menuReadAloud').onclick = () => { $('#readerMenu').classList.add('hidden'); playNarration(); };
  $('#menuSettings').onclick = () => { $('#readerMenu').classList.add('hidden'); $('#settingsSheet').classList.remove('hidden'); };
  $('#menuHelp').onclick = () => { $('#readerMenu').classList.add('hidden'); toast('Swipe or use ‹ › to turn pages. Tap a word to hear it. Touch & hold text to add a note.', 4000); };
  $('#menuFeedback').onclick = () => { $('#readerMenu').classList.add('hidden'); toast('Thanks — tell Ira what to improve.'); };
  // On-page ‹ › turn buttons.
  $('#btnPagePrev').onclick = () => showPage(state.currentPage - pageStep(), false, true);
  $('#btnPageNext').onclick = () => showPage(state.currentPage + pageStep(), false, true);
  // Bottom page slider (Play Books footer): drag to jump to a page.
  $('#pageSlider').addEventListener('input', ev => {
    const total = cachedPageTotal();
    const page = clamp(parseInt(ev.target.value, 10) || 1, 1, Math.max(1, total));
    showPage(page - 1, true, true);
  });
  // New-version banner reload.
  $('#btnUpdateReload').onclick = () => location.reload();
  // Long-press (touch & hold) on reading text adds a NOTE (Play Books Notes
  // empty state). A short tap still speaks the word (tap-to-hear).
  let lpTimer = null, lpFired = false;
  // v3.2: long-press notes work on BOTH page panels in two-page mode.
  ['#pageContent', '#pageContent2'].forEach(sel => {
    const pcEl = $(sel);
    if (!pcEl) return;
    pcEl.addEventListener('pointerdown', ev => {
      lpFired = false;
      lpTimer = setTimeout(() => {
        lpFired = true;
        const s = state.sentences[state.sentenceIndex];
        const cur = s ? s.text : '';
        const note = window.prompt('Add a note about this passage:\n\n“' + cur.slice(0, 120) + '”');
        if (note) addNote(note);
      }, 650);
    });
    ['pointerup', 'pointermove', 'pointercancel', 'pointerleave'].forEach(t =>
      pcEl.addEventListener(t, () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }));
  });
  // Definition preview (Lighting tab): when on, selecting text shows the
  // definition automatically instead of waiting for the Define tap.
  document.addEventListener('selectionchange', () => {
    if (!settings.defPreview || !settings.offlineDict) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const word = (sel.toString() || '').trim().split(/\s+/)[0];
    if (!word || word.length < 2) return;
    const def = MINI_DICT[word.toLowerCase()];
    if (def) {
      const pop = $('#definePopup');
      if (pop && pop.classList.contains('hidden')) {
        pop.innerHTML = '<h4>' + esc(word) + '</h4><p>' + esc(def) + '</p>';
        pop.classList.remove('hidden');
        setTimeout(() => pop.classList.add('hidden'), 5000);
      }
    }
  });
}

/* ---------------- service worker (offline Google audio cache) ---------------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // updateViaCache:'none' + an explicit update() so the SW itself is never
    // the reason an old build keeps serving (v3 stale-cache defect).
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(reg => { try { reg.update(); } catch (e) {} })
      .catch(() => {});
    // If a newer SW takes over while the page is open, check whether a newer
    // build is actually deployed before offering a reload. (controllerchange
    // also fires on FIRST install, when there is no older version — showing
    // the banner then is a false positive.)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      checkForUpdate();
    });
  } catch (e) {}
}

/* v3.1 — version check (stale-cache fix). Fetches version.json with no-store;
   if the deployed version is newer than the running one, shows the banner. */
async function checkForUpdate() {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.version && data.version !== APP_VERSION) showUpdateBanner();
  } catch (e) {}
}
function showUpdateBanner() {
  const b = $('#updateBanner'); if (!b) return;
  b.classList.remove('hidden');
}

/* ---------------- init ---------------- */
function init() {
  // v3.1 (defect 5): a loading state IS visible on app start — the v3 test
  // saw "no loading progress indicator on any load". Show the overlay with
  // progress while the library renders, then hide it.
  showLoad('Loading…', 15);
  // v3: app UI language follows the BROWSER (no picker, no list)
  settings.uiLang = browserUiLang();
  applyI18n();
  applyTheme();
  applyFont();
  applyLighting(); // v3.1: brightness / night light overlays
  const sd = $('#setDirection'); if (sd) sd.value = settings.direction;
  const sg = $('#setGenre'); if (sg) sg.value = settings.genre;
  const ss = $('#setSleepDefault'); if (ss) ss.value = String(settings.sleepDefault || 0);
  const sm = $('#setMoodFollow'); if (sm) sm.checked = !!settings.moodFollow;
  const sl = $('#setLargeText'); if (sl) sl.checked = !!settings.largeText;
  const sh = $('#setHighContrast'); if (sh) sh.checked = !!settings.highContrast;
  // v3.1: sync the Lighting-tab toggles + brightness slider.
  const sbo = $('#setBrightnessOn'); if (sbo) sbo.checked = !!settings.brightnessOn;
  const sb = $('#setBrightness'); if (sb) sb.value = settings.brightness || 100;
  const snl = $('#setNightLight'); if (snl) snl.checked = !!settings.nightLight;
  const sp3 = $('#setPage3d'); if (sp3) sp3.checked = settings.page3d !== false;
  const s2p = $('#setTwoPage'); if (s2p) s2p.checked = settings.twoPage !== false;
  const svk = $('#setVolumeKeys'); if (svk) svk.checked = !!settings.volumeKeys;
  const sar = $('#setAutoReadAloud'); if (sar) sar.checked = !!settings.autoReadAloud;
  const sdp = $('#setDefPreview'); if (sdp) sdp.checked = settings.defPreview !== false;
  const sod = $('#setOfflineDict'); if (sod) sod.checked = settings.offlineDict !== false;
  const ver = $('#appVersion'); if (ver) ver.textContent = 'Version ' + APP_VERSION;
  setMood('neutral');
  wire();
  renderLibrary();
  renderContinueCard();
  showScreen('home');
  setLoadProgress(100, 'Ready');
  setTimeout(hideLoad, 450); // keep the loading state visible long enough to see
  registerServiceWorker();
  checkForUpdate(); // v3.1: stale-cache fix — offer reload if a newer build is live
  window.__reader = {
    state, settings,
    openEpub, openPdf, handleFile, loadChapter, playNarration, pauseNarration,
    showPage, nextSentence, prevSentence, buildSentenceSpans,
    version: APP_VERSION
  };
}
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
