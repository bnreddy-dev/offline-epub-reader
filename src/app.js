/* =====================================================================
   Offline EPUB Reader — single-file app (v1, browser voice only)
   Spec: Offline_EPUB_Reader_App_Requirements.md v3 FINAL
   No Kokoro in v1. No network calls except: PDF worker is inlined;
   dictionary "search online" is a user-tapped link only.
   ===================================================================== */
'use strict';

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
const I18N = {
  en: { appTitle: 'Offline EPUB Reader', appSub: 'Read or listen to any book — fully offline, free, private.', openBook: '📖 Open a book', openHint: 'EPUB or PDF — the file never leaves your device.', continueListening: 'Continue listening', continue: '▶ Continue', all: 'All', recentBooks: 'Recent books', noBooksYet: 'No books yet. Open an EPUB or PDF to begin.', backup: '⬇ Backup library', restore: '⬆ Restore library', storage: '🗄 Storage', voices: '🔊 Voices', chapters: 'Chapters', bookmarks: 'Bookmarks', highlights: 'Highlights', searchPh: 'Search in book…', gotoPagePh: 'Page #', go: 'Go', playBelow: '▶ Read aloud', settings: 'Settings', theme: 'Theme', themeBook: 'Book page', themeWhite: 'White', themeDark: 'Dark', direction: 'Page direction', dirVertical: 'Vertical scroll', dirHorizontal: 'Horizontal flip', font: 'Font', fontSerif: 'Serif (book)', fontSans: 'Sans (clean)', fontTelugu: 'Telugu', fontSize: 'Font size', lineSpacing: 'Line spacing', uiLanguage: 'App language', voice: 'Voice', voiceAuto: 'Automatic', genre: 'Genre', moodFollow: 'Follow mood', sleepDefault: 'Sleep timer default', off: 'Off', largeText: 'Large text', highContrast: 'High contrast', kokoroNote: 'Kokoro neural voice (English/Hindi) is not in this version — browser voice only, fully offline.', exportHighlights: 'Export highlights', nowMood: 'Now:', mood: 'Mood', define: 'Define', hear: '🔊 Hear', highlight: '✎ Highlight', copy: 'Copy' },
  te: { appTitle: 'ఆఫ్‌లైన్ EPUB రీడర్', appSub: 'ఏ పుస్తకాన్నైనా చదవండి లేదా వినండి — పూర్తిగా ఆఫ్‌లైన్, ఉచితం, ప్రైవేట్.', openBook: '📖 పుస్తకం తెరవండి', openHint: 'EPUB లేదా PDF — ఫైల్ మీ పరికరాన్ని వదలదు.', continueListening: 'వినడం కొనసాగించండి', continue: '▶ కొనసాగించు', all: 'అన్నీ', recentBooks: 'ఇటీవలి పుస్తకాలు', noBooksYet: 'ఇంకా పుస్తకాలు లేవు. ప్రారంభించడానికి EPUB లేదా PDF తెరవండి.', backup: '⬇ లైబ్రరీ బ్యాకప్', restore: '⬆ లైబ్రరీ పునరుద్ధరణ', storage: '🗄 నిల్వ', voices: '🔊 గొంతులు', chapters: 'అధ్యాయాలు', bookmarks: 'బుక్‌మార్కులు', highlights: 'హైలైట్లు', searchPh: 'పుస్తకంలో వెతకండి…', gotoPagePh: 'పేజీ #', go: 'వెళ్ళు', playBelow: '▶ బిగ్గరగా చదవండి', settings: 'సెట్టింగులు', theme: 'థీమ్', themeBook: 'పుస్తక పేజీ', themeWhite: 'తెలుపు', themeDark: 'చీకటి', direction: 'పేజీ దిశ', dirVertical: 'నిలువు స్క్రోల్', dirHorizontal: 'అడ్డంగా తిప్పండి', font: 'ఫాంట్', fontSerif: 'సెరిఫ్ (పుస్తకం)', fontSans: 'సాన్స్ (స్పష్టం)', fontTelugu: 'తెలుగు', fontSize: 'అక్షర పరిమాణం', lineSpacing: 'లైన్ అంతరం', uiLanguage: 'యాప్ భాష', voice: 'గొంతు', voiceAuto: 'ఆటోమేటిక్', genre: 'శైలి', moodFollow: 'మూడ్ అనుసరించు', sleepDefault: 'స్లీప్ టైమర్', off: 'ఆపివేయి', largeText: 'పెద్ద అక్షరాలు', highContrast: 'అధిక కాంట్రాస్ట్', kokoroNote: 'Kokoro న్యూరల్ వాయిస్ ఈ వెర్షన్‌లో లేదు — బ్రౌజర్ వాయిస్ మాత్రమే, పూర్తిగా ఆఫ్‌లైన్.', exportHighlights: 'హైలైట్లు ఎగుమతి', nowMood: 'ఇప్పుడు:', mood: 'మూడ్', define: 'అర్థం', hear: '🔊 వినండి', highlight: '✎ హైలైట్', copy: 'కాపీ' },
  hi: { appTitle: 'ऑफ़लाइन EPUB रीडर', appSub: 'कोई भी किताब पढ़ें या सुनें — पूरी तरह ऑफ़लाइन, मुफ़्त, निजी।', openBook: '📖 किताब खोलें', openHint: 'EPUB या PDF — फ़ाइल आपके डिवाइस से बाहर नहीं जाती।', continueListening: 'सुनना जारी रखें', continue: '▶ जारी रखें', all: 'सभी', recentBooks: 'हाल की किताबें', noBooksYet: 'अभी कोई किताब नहीं। शुरू करने के लिए EPUB या PDF खोलें।', backup: '⬇ लाइब्रेरी बैकअप', restore: '⬆ लाइब्रेरी पुनर्स्थापित करें', storage: '🗄 भंडारण', voices: '🔊 आवाज़ें', chapters: 'अध्याय', bookmarks: 'बुकमार्क', highlights: 'हाइलाइट', searchPh: 'किताब में खोजें…', gotoPagePh: 'पृष्ठ #', go: 'जाएँ', playBelow: '▶ ज़ोर से पढ़ें', settings: 'सेटिंग्स', theme: 'थीम', themeBook: 'किताब का पन्ना', themeWhite: 'सफ़ेद', themeDark: 'अंधेरा', direction: 'पन्ने की दिशा', dirVertical: 'ऊर्ध्व स्क्रॉल', dirHorizontal: 'क्षैतिज पलटें', font: 'फ़ॉन्ट', fontSerif: 'सेरिफ़ (किताब)', fontSans: 'सैन्स (साफ़)', fontTelugu: 'तेलुगु', fontSize: 'अक्षर आकार', lineSpacing: 'पंक्ति अंतर', uiLanguage: 'ऐप भाषा', voice: 'आवाज़', voiceAuto: 'स्वचालित', genre: 'शैली', moodFollow: 'मूड का पालन करें', sleepDefault: 'स्लीप टाइमर', off: 'बंद', largeText: 'बड़े अक्षर', highContrast: 'उच्च कंट्रास्ट', kokoroNote: 'Kokoro न्यूरल आवाज़ इस संस्करण में नहीं है — केवल ब्राउज़र आवाज़, पूरी तरह ऑफ़लाइन।', exportHighlights: 'हाइलाइट निर्यात करें', nowMood: 'अभी:', mood: 'मूड', define: 'अर्थ', hear: '🔊 सुनें', highlight: '✎ हाइलाइट', copy: 'कॉपी' }
};
function t(key) { const lang = settings.uiLang || 'en'; return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
function applyI18n() {
  $$('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
  document.documentElement.lang = settings.uiLang || 'en';
}

/* ---------------- settings (localStorage) ---------------- */
const SETTINGS_KEY = 'epubreader.settings.v1';
const defaults = { theme: 'book', direction: 'vertical', font: 'serif', fontSize: 3, lineSpacing: 2, uiLang: 'en', voicePick: {}, genre: 'thriller', moodFollow: true, sleepDefault: 0, largeText: false, highContrast: false };
let settings = Object.assign({}, defaults);
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); settings = Object.assign({}, defaults, s); } catch (e) {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

/* ---------------- IndexedDB (book bytes + chapter cache) ---------------- */
const DB_NAME = 'epubreader', DB_VER = 1;
let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
function idbPut(store, value) { return openDB().then(db => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = res; tx.onerror = () => rej(tx.error); })); }
function idbGet(store, key) { return openDB().then(db => new Promise((res, rej) => { const req = db.transaction(store).objectStore(store).get(key); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); })); }
function idbDelete(store, key) { return openDB().then(db => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); })); }
function idbAll(store) { return openDB().then(db => new Promise((res, rej) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error); })); }
function idbCountChapters(bookId) { return idbAll('chapters').then(all => all.filter(c => c.key.indexOf(bookId + '::') === 0).length); }

/* ---------------- library index (localStorage) ---------------- */
const LIB_KEY = 'epubreader.library.v1';
let library = [];
try { library = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { library = []; }
function saveLibrary() { try { localStorage.setItem(LIB_KEY, JSON.stringify(library)); } catch (e) {} }
function bookIdFor(title, author) { return 'b' + Math.abs([...(title + '|' + author)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)).toString(36); }

/* ---------------- global state ---------------- */
const state = {
  book: null,            // epub.js book object (EPUB) or null (PDF)
  bookType: null,        // 'epub' | 'pdf'
  meta: null,            // {id,title,author,subtitle,language,description,coverUrl}
  chapters: [],          // [{title, href, spineIndex, kind, mood}]
  currentChapter: 0,
  paragraphs: [],        // current chapter paragraphs [{html, text}]
  sentences: [],         // current chapter sentences [{text, paraIdx, mood}]
  sentenceIndex: 0,
  playing: false,
  speaking: false,
  speed: 1,
  mood: 'neutral',
  pages: [],             // horizontal mode pages: [{startPara, endPara}]
  currentPage: 0,
  totalPages: 0,
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
  perBook: {},           // per-book settings overrides
  resumeRecap: null,
  pdfPages: null,        // for PDF books: array of page texts
  searchIndex: [],       // [{chapter, text}]
};
let currentUtterance = null;
let pauseTimer = null;
let boundaryHandler = null;

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

/* ---------------- voices (browser SpeechSynthesis only in v1) ---------------- */
function refreshVoices() {
  try { state.voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { state.voices = []; }
  const sel = $('#setVoice');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(t('voiceAuto')) + '</option>';
    state.voices.forEach(v => {
      const o = el('option', null, v.name + ' (' + (v.lang || '?') + ')');
      o.value = v.name; sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }
  updateVoicePanel();
}
function langCode(lang) { return (lang || 'en').toLowerCase().slice(0, 2); }
function pickVoice(lang) {
  const code = langCode(lang);
  const picked = settings.voicePick && settings.voicePick[code];
  if (picked) { const v = state.voices.find(x => x.name === picked); if (v) return v; }
  const pref = { te: ['te-IN', 'te'], hi: ['hi-IN', 'hi'], en: ['en-IN', 'en-US', 'en-GB', 'en'] }[code] || [code];
  for (const p of pref) { const v = state.voices.find(x => (x.lang || '').toLowerCase().startsWith(p.toLowerCase())); if (v) return v; }
  return state.voices.find(x => (x.lang || '').toLowerCase().startsWith(code)) || null;
}
function voiceLangTag(lang) { return { te: 'te-IN', hi: 'hi-IN', en: 'en-IN' }[langCode(lang)] || lang; }
function hasVoiceFor(lang) { return !!pickVoice(lang); }
if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = refreshVoices;
  refreshVoices();
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
  // Split after . ! ? । … followed by space or end; keep quotes with the sentence.
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
  // classic reveal rhythm: very short sentence after a long one
  return prevLen > 120 && s.length < 40;
}

/* ---------------- text preparation before speaking (spec §5.5) ---------------- */
function prepForSpeech(text, lang) {
  let s = String(text || '');
  s = s.replace(/\[image\]/gi, ' ');
  s = s.replace(/\[\d+\]/g, ' ');            // footnote markers
  s = s.replace(/\s+/g, ' ').trim();
  if (langCode(lang) === 'en') {
    s = s.replace(/\bDr\./g, 'Doctor').replace(/\bMr\./g, 'Mister').replace(/\bMrs\./g, 'Missus').replace(/\bSt\./g, 'Saint');
  }
  return s;
}

/* ---------------- chapter extraction from an epub.js section ---------------- */
function extractParagraphs(doc) {
  const paras = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
  let node;
  const blocks = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'LI', 'DIV']);
  while ((node = walker.nextNode())) {
    // XMLDocument (epub.js) keeps tagName lowercase ('p'); HTMLDocument uppercases ('P')
    const tag = (node.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    if (tag === 'IMG') {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      paras.push({ kind: 'img', src, alt, text: '' });
      continue;
    }
    if (blocks.has(tag)) {
      // only leaf-ish blocks: skip a DIV that contains P children
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
  const coverUrl = await getCoverUrl(book).catch(() => null);

  // Build chapter list from navigation TOC, mapped to spine index
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
  // Fallback: no TOC — use spine order
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
  // detect language from first chapter text if metadata missing
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
    // NB: plain section.load() uses XHR and fails on file:// — pass book.load (archive) explicitly
    await section.load(state.book.load.bind(state.book));
    paras = extractParagraphs(section.document);
    // resolve images
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
  const rec = await loadChapterText(chIdx);
  if (!rec) return false;
  state.currentChapter = chIdx;
  state.paragraphs = rec.paras;
  const mood = moodOfChapter(state.chapters[chIdx]);
  state.sentences = parasToSentences(rec.paras, mood);
  state.sentenceIndex = 0;
  if (opts.keepPosition && state.pendingSentence != null) {
    state.sentenceIndex = clamp(state.pendingSentence, 0, Math.max(0, state.sentences.length - 1));
    state.pendingSentence = null;
  }
  renderChapter();
  updateChapterList();
  updateCacheInfo();
  savePosition();
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
  // group pages into chapters of ~6 pages (or fewer at the end)
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
  applyTheme(); applyFont();
}
function savePerBookSettings() {
  if (!state.meta) return;
  state.perBook = { theme: settings.theme, font: settings.font, direction: settings.direction, speed: state.speed };
  try { localStorage.setItem('epubreader.pb.' + state.meta.id, JSON.stringify(state.perBook)); } catch (e) {}
}

/* ---------------- rendering ---------------- */
function renderChapter() {
  const content = $('#pageContent');
  content.innerHTML = '';
  content.classList.remove('two-col');
  const ch = state.chapters[state.currentChapter];
  // the chapter file usually carries its own <h1> (already in paragraphs) — don't print the title twice
  const firstIsTitle = state.paragraphs.length && ['h1','h2','h3'].indexOf(state.paragraphs[0].kind) >= 0 && state.paragraphs[0].text.replace(/\s+/g, ' ').trim() === (ch ? ch.title : '').replace(/\s+/g, ' ').trim();
  if (!firstIsTitle) {
    const h = el('h1', null, ch ? ch.title : '');
    content.appendChild(h);
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
  // word-level spans for the current chapter (built lazily per sentence on demand)
  paginate();
  updatePageFooter();
  updateChapterList();
}
function paraElements() { return Array.from($('#pageContent').children).filter(n => n.dataset && n.dataset.para != null); }
function paginate() {
  const content = $('#pageContent');
  state.pages = [];
  state.totalPages = 0;
  if (settings.direction !== 'horizontal') { state.totalPages = 1; return; }
  // measure: walk paragraph nodes, split into pages by height
  const area = $('#flipWrap');
  const pageH = Math.max(200, area.clientHeight - 8);
  const nodes = paraElements();
  let pages = [], cur = [], acc = 0;
  const h1 = content.querySelector('h1');
  if (h1) acc += h1.offsetHeight + 10;
  nodes.forEach(n => {
    const h = n.offsetHeight || 40;
    if (acc + h > pageH && cur.length) { pages.push(cur); cur = []; acc = 0; }
    cur.push(n); acc += h;
  });
  if (cur.length) pages.push(cur);
  state.pages = pages;
  state.totalPages = Math.max(1, pages.length);
  showPage(0, true);
}
function showPage(idx, instant) {
  const content = $('#pageContent');
  if (settings.direction !== 'horizontal' || !state.pages.length) { content.style.display = ''; state.currentPage = 0; updatePageFooter(); return; }
  idx = clamp(idx, 0, state.pages.length - 1);
  const doShow = () => {
    state.currentPage = idx;
    const page = $('#pageCurrent');
    // rebuild page content: heading on page 0 + this page's paragraphs
    content.innerHTML = '';
    if (idx === 0) {
      const ch = state.chapters[state.currentChapter];
      content.appendChild(el('h1', null, ch ? ch.title : ''));
    }
    state.pages[idx].forEach(n => content.appendChild(n));
    content.scrollTop = 0;
    updatePageFooter();
  };
  if (instant) { doShow(); return; }
  const page = $('#pageCurrent');
  page.classList.remove('flip-in');
  page.classList.add('flip-out');
  setTimeout(() => { doShow(); page.classList.remove('flip-out'); page.classList.add('flip-in'); setTimeout(() => page.classList.remove('flip-in'), 480); }, 230);
}
function pageForSentence(si) {
  if (settings.direction !== 'horizontal' || !state.pages.length) return 0;
  const s = state.sentences[si];
  if (!s) return 0;
  for (let i = 0; i < state.pages.length; i++) {
    if (state.pages[i].some(n => Number(n.dataset.para) === s.paraIdx)) return i;
  }
  return 0;
}
function updatePageFooter() {
  const total = settings.direction === 'horizontal' ? (state.totalPages || 1) : estimatePages();
  const cur = settings.direction === 'horizontal' ? (state.currentPage + 1) : currentScrollPage();
  $('#pageNum').textContent = 'Page ' + cur + ' of ' + total;
  const ch = state.chapters[state.currentChapter];
  $('#chapterPos').textContent = ch ? ('Chapter ' + (state.currentChapter + 1) + ' of ' + state.chapters.length) : '';
}
function estimatePages() {
  const content = $('#pageContent');
  if (!content || !content.scrollHeight) return 1;
  return Math.max(1, Math.ceil(content.scrollHeight / Math.max(1, content.clientHeight)));
}
function currentScrollPage() {
  const content = $('#pageContent');
  if (!content || !content.clientHeight) return 1;
  return clamp(Math.floor(content.scrollTop / content.clientHeight) + 1, 1, estimatePages());
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
    if (i === state.currentChapter) li.classList.add('active');
    li.onclick = () => { stopNarration(false); loadChapter(i); closeDrawer(); };
    ul.appendChild(li);
  });
  renderBookmarks(); renderHighlights();
}
function updateCacheInfo() {
  const n = $('#cacheInfo');
  if (!n) return;
  n.textContent = state.cacheCount + ' of ' + state.chapters.length + ' chapters saved for offline';
}

/* ---------------- sentence display: word spans + bounce ---------------- */
function buildSentenceSpans() {
  // Rebuild the active sentence's paragraph into word/letter spans for bounce highlight.
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  const nodes = paraElements();
  const node = nodes.find(n => Number(n.dataset.para) === s.paraIdx);
  if (!node) return;
  const para = state.paragraphs[s.paraIdx];
  if (!para) return;
  // find the sentence text inside the paragraph text
  const ptext = para.text;
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
    [...part].forEach(ch => w.appendChild(el('span', 'l', ch)));
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
      n.textContent = p ? p.text : n.textContent;
      delete n.dataset.built;
    }
  });
}
function markWord(charIndex) {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  const node = paraElements().find(n => Number(n.dataset.para) === s.paraIdx);
  if (!node) return;
  const sent = node.querySelector('.sentence');
  if (!sent) return;
  // charIndex is relative to the utterance text; map to word index
  let acc = 0, wi = -1;
  const words = s.text.split(/(\s+)/);
  for (let i = 0; i < words.length; i++) {
    if (/^\s+$/.test(words[i])) { acc += words[i].length; continue; }
    if (charIndex >= acc && charIndex < acc + words[i].length) { wi = i; break; }
    acc += words[i].length;
  }
  if (wi < 0) return;
  const wEls = sent.querySelectorAll('.w');
  let vis = -1;
  for (let i = 0; i < words.length; i++) { if (!/^\s+$/.test(words[i])) { vis++; if (i === wi) break; } }
  const target = wEls[vis];
  if (!target || target.classList.contains('on')) return;
  sent.querySelectorAll('.w.on').forEach(w => w.classList.remove('on'));
  target.classList.add('on');
  // staggered letter delays
  target.querySelectorAll('.l').forEach((lEl, li) => { lEl.style.animationDelay = (li * 45) + 'ms'; });
  // keep the speaking sentence visible
  if (settings.direction === 'vertical') {
    const r = sent.getBoundingClientRect(), c = $('#pageContent').getBoundingClientRect();
    if (r.top < c.top + 60 || r.bottom > c.bottom - 120) sent.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
function scrollToSentence() {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  if (settings.direction === 'horizontal') {
    const pg = pageForSentence(state.sentenceIndex);
    if (pg !== state.currentPage) showPage(pg);
  }
  const node = paraElements().find(n => Number(n.dataset.para) === s.paraIdx);
  if (node && settings.direction === 'vertical') node.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* ---------------- narration engine (browser voice only, spec §5) ---------------- */
function currentMoodRule() {
  const s = state.sentences[state.sentenceIndex];
  const moodName = s ? s.mood : state.mood;
  return MOODS[moodName] || MOODS.neutral;
}
function effectiveRate() {
  const genreBase = (GENRES[settings.genre] || GENRES.thriller).base;
  return clamp(state.speed * currentMoodRule().speed * genreBase, 0.4, 2.5);
}
function effectivePitch() {
  const p = 1 + (currentMoodRule().pitch * 0.12);
  return clamp(p, 0, 2);
}
function pauseAfterSentence() {
  const s = state.sentences[state.sentenceIndex];
  const rule = currentMoodRule();
  let ms = rule.pause;
  if (s && s.reveal) ms = Math.max(ms, rule.reveal);
  if (s && /\.\.\.|…/.test(s.text)) ms += 400;
  return ms;
}
function pickVoiceForCurrent() {
  const lang = state.meta ? state.meta.language : 'en';
  const v = pickVoice(lang);
  if (v) return v;
  return null;
}
function speakCurrent() {
  if (!state.playing) return;
  const s = state.sentences[state.sentenceIndex];
  if (!s) { advanceChapterOrStop(); return; }
  if (s.image) { state.sentenceIndex++; setTimeout(() => speakCurrent(), 150); return; }
  if (!window.speechSynthesis) { toast('Speech is not supported in this browser'); stopNarration(true); return; }
  const lang = state.meta ? state.meta.language : 'en';
  const voice = pickVoiceForCurrent();
  if (!voice) {
    stopNarration(true);
    showVoiceHelp(lang);
    return;
  }
  const u = new SpeechSynthesisUtterance(s.text);
  u.lang = voice.lang || voiceLangTag(lang);
  u.voice = voice;
  u.rate = effectiveRate();
  u.pitch = effectivePitch();
  u.volume = 1;
  const started = Date.now();
  state.speaking = true;
  currentUtterance = u;
  u.onboundary = e => {
    if (e.name === 'word' && typeof e.charIndex === 'number') markWord(e.charIndex);
  };
  u.onend = () => {
    state.speaking = false;
    const dur = (Date.now() - started) / 1000;
    if (dur > 0.5) state.avgSentenceSec = state.avgSentenceSec * 0.8 + dur * 0.2;
    if (!state.playing) return;
    const pause = pauseAfterSentence();
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    pauseTimer = setTimeout(() => { buildSentenceSpans(); scrollToSentence(); speakCurrent(); }, pause);
  };
  u.onerror = ev => {
    state.speaking = false;
    if (ev && ev.error === 'canceled') return;
    if (!state.playing) return;
    // skip the failing sentence and continue
    state.sentenceIndex++;
    if (state.sentenceIndex < state.sentences.length) { buildSentenceSpans(); scrollToSentence(); setTimeout(speakCurrent, 200); }
    else advanceChapterOrStop();
  };
  buildSentenceSpans();
  scrollToSentence();
  setMood(s.mood);
  speechSynthesis.speak(u);
  state.lastSpokenAt = Date.now();
  updateAudioBar();
}
function playNarration() {
  if (!state.meta || !state.sentences.length) return;
  if (state.playing) { pauseNarration(); return; }
  state.playing = true;
  $('#btnPlay').textContent = '⏸';
  $('#btnPlayBelow').textContent = '⏸ Pause';
  startSleepTimer();
  speakCurrent();
}
function pauseNarration() {
  state.playing = false;
  clearTimeout(pauseTimer);
  try { speechSynthesis.cancel(); } catch (e) {}
  state.speaking = false;
  $('#btnPlay').textContent = '▶';
  $('#btnPlayBelow').textContent = '▶ Read aloud';
  savePosition();
  updateAudioBar();
}
function stopNarration(resetBtn) {
  state.playing = false;
  clearTimeout(pauseTimer);
  try { speechSynthesis.cancel(); } catch (e) {}
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
  if (state.playing) { try { speechSynthesis.cancel(); } catch (e) {} state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
  else { buildSentenceSpans(); scrollToSentence(); }
  savePosition();
}
function nextSentence() {
  if (state.sentenceIndex < state.sentences.length - 1) {
    clearSentenceSpans(); state.sentenceIndex++;
    if (state.playing) { try { speechSynthesis.cancel(); } catch (e) {} state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
    else { buildSentenceSpans(); scrollToSentence(); }
  } else advanceChapterOrStop();
  savePosition();
}
function prevSentence() {
  clearSentenceSpans();
  state.sentenceIndex = Math.max(0, state.sentenceIndex - 1);
  if (state.playing) { try { speechSynthesis.cancel(); } catch (e) {} state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
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
  const ch = state.chapters[state.currentChapter];
  const total = state.sentences.length || 1;
  const pct = Math.round((state.sentenceIndex / total) * 100);
  $('#abProgressFill').style.width = pct + '%';
  const remaining = Math.max(0, (total - state.sentenceIndex)) * state.avgSentenceSec;
  info.textContent = (ch ? ch.title : '') + ' · ' + state.sentenceIndex + '/' + total + ' · ' + fmtTime(remaining) + ' left in chapter';
}
function timeRemainingBook() {
  let secs = 0;
  for (let i = state.currentChapter; i < state.chapters.length; i++) {
    secs += 0; // estimated from cached chapter sentence counts where available
  }
  return secs;
}

/* ---------------- narration order: Title → Subtitle → Author → Intro → chapters (spec §15.9) ---------------- */
async function playFromStart() {
  if (!state.meta) return;
  // Build the opening sequence as spoken text, then flow into the intro chapter.
  const m = state.meta;
  const openLines = [];
  if (m.title) openLines.push({ text: m.title, paraIdx: -1, mood: 'neutral' });
  if (m.subtitle) openLines.push({ text: m.subtitle, paraIdx: -1, mood: 'neutral' });
  if (m.author) openLines.push({ text: 'by ' + m.author, paraIdx: -1, mood: 'neutral' });
  const introIdx = state.chapters.findIndex(c => c.kind === 'intro');
  const firstIdx = nextNarratableChapter(0);
  const target = introIdx >= 0 ? introIdx : (firstIdx != null ? firstIdx : 0);
  await loadChapter(target);
  // prepend the opening lines to this chapter's queue
  state.sentences = openLines.concat(state.sentences);
  state.sentenceIndex = 0;
  state.playing = true;
  $('#btnPlay').textContent = '⏸';
  startSleepTimer();
  speakCurrent();
}

/* ---------------- rolling background pre-load (spec §15.8) ---------------- */
async function startPreload() {
  if (!state.meta || state.preloadBusy) return;
  state.preloadBusy = true;
  try {
    let next = state.currentChapter + 1;
    // continue from where the cache left off
    const done = await idbCountChapters(state.meta.id).catch(() => 0);
    state.cacheCount = done;
    updateCacheInfo();
    while (next < state.chapters.length) {
      const cached = await idbGet('chapters', state.meta.id + '::' + next).catch(() => null);
      if (!cached) await loadChapterText(next).catch(() => null);
      state.cacheCount = await idbCountChapters(state.meta.id).catch(() => state.cacheCount + 1);
      updateCacheInfo();
      next++;
      // never block the UI: yield between chapters
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
  // toggle: tapping again at the same spot removes the bookmark instead of duplicating it
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
  the: 'used to point to a specific person or thing', a: 'one; any', an: 'one; any', and: 'joining word', of: 'belonging to', to: 'towards', in: 'inside', is: 'exists; equals', it: 'that thing', you: 'the person spoken to', that: 'the one over there', he: 'a man or boy', she: 'a woman or girl', was: 'past of is', for: 'meant for', on: 'on top of', are: 'plural of is', with: 'together with', his: 'belonging to him', they: 'more than one person', i: 'myself', at: 'in a place', be: 'to exist', this: 'the one here', have: 'to own', from: 'starting at', or: 'either one', one: 'a single thing', had: 'past of have', by: 'near; through', word: 'a unit of language', but: 'however', not: 'no', what: 'which thing', all: 'everything', were: 'past of are', we: 'you and I', when: 'at what time', your: 'belonging to you', can: 'to be able to', said: 'spoke', there: 'in that place', use: 'to make use of', an: 'one', each: 'every one', which: 'what one', she: 'a woman', do: 'to perform', how: 'in what way', their: 'belonging to them', if: 'on condition that', will: 'going to', up: 'towards the top', other: 'different', about: 'concerning', out: 'outside', many: 'a large number', then: 'after that', them: 'those people', these: 'the ones here', so: 'therefore', some: 'a few', her: 'belonging to her', would: 'past of will', make: 'to create', like: 'similar to; to enjoy', him: 'that man', into: 'inside', time: 'the passing of hours', has: 'owns', look: 'to see', two: 'the number 2', more: 'a greater amount', write: 'to put words on paper', go: 'to move', see: 'to notice with the eyes', number: 'a count', no: 'not any', way: 'a path; a manner', could: 'was able to', people: 'human beings', my: 'belonging to me', than: 'compared with', first: 'before all others', water: 'the liquid we drink', been: 'past of be', call: 'to shout; to name', who: 'which person', oil: 'a slippery liquid', its: 'belonging to it', now: 'at this moment', find: 'to discover', long: 'not short', down: 'towards the ground', day: '24 hours', did: 'past of do', get: 'to obtain', come: 'to arrive', made: 'past of make', may: 'possibly', part: 'a piece of something', love: 'a deep feeling of care', life: 'being alive', night: 'the dark part of the day', story: 'a tale of events', book: 'a set of written pages', read: 'to look at words and understand them', listen: 'to hear with attention', voice: 'the sound a person makes when speaking', chapter: 'a part of a book', page: 'one side of a sheet in a book', friend: 'a person you like and trust', home: 'the place where you live', heart: 'the organ that pumps blood; the centre of feelings', light: 'brightness; not heavy', dark: 'without light', world: 'the earth and everything on it', hand: 'the part at the end of your arm', eye: 'the organ you see with', mind: 'the part of you that thinks', dream: 'images in sleep; a hope', truth: 'what is real and true', secret: 'something hidden', fear: 'being afraid', hope: 'wanting something to happen', smile: 'a happy face expression', tear: 'a drop from the eye when sad', memory: 'something remembered', voice: 'sound of speaking', message: 'words sent to someone', phone: 'a device for calling and messaging', midnight: '12 o’clock at night', sister: 'a female sibling', brother: 'a male sibling', mother: 'a female parent', father: 'a male parent', village: 'a small place where people live', river: 'a large stream of water', rain: 'water falling from the sky', fire: 'burning flames', wind: 'moving air', sky: 'the space above the earth', star: 'a bright point of light at night', moon: 'the bright object in the night sky', sun: 'the star that gives us daylight', road: 'a way for vehicles and people', door: 'an entrance', window: 'an opening to see outside', room: 'a part of a house', house: 'a building where people live', school: 'a place for learning', teacher: 'a person who teaches', student: 'a person who learns', question: 'something asked', answer: 'a reply', work: 'a job; effort', money: 'coins and notes used to buy things', morning: 'the early part of the day', evening: 'the late part of the day', today: 'this day', tomorrow: 'the next day', yesterday: 'the day before today'
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
  const sel = $('#setTheme'); if (sel) sel.value = settings.theme;
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
  const fsz = $('#setFontSize'); if (fsz) fsz.value = settings.fontSize;
  const ls = $('#setLineSpacing'); if (ls) ls.value = settings.lineSpacing;
  const f = $('#setFont'); if (f) f.value = settings.font;
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
  toast(dir === 'horizontal' ? 'Horizontal page flip' : 'Vertical scroll');
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
}
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerScrim').classList.add('hidden'); }
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerScrim').classList.remove('hidden'); }

/* ---------------- library UI ---------------- */
function renderLibrary(filter) {
  const list = $('#recentList');
  if (!list) return;
  const f = filter || 'all';
  const items = library.filter(b => f === 'all' || langCode(b.language) === f);
  list.innerHTML = '';
  if (!items.length) { list.appendChild(el('div', 'empty-note', t('noBooksYet'))); return; }
  items.forEach(b => {
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
  const rec = await idbGet('books', id).catch(() => null);
  if (!rec || !rec.data) { toast('Book file is no longer stored — please open it again'); return; }
  const entry = library.find(b => b.id === id);
  try {
    if (rec.type === 'pdf') await openPdf(rec.data, entry ? entry.title + '.pdf' : 'book.pdf');
    else await openEpub(rec.data, entry ? entry.title + '.epub' : 'book.epub');
    const pos = loadPosition();
    if (pos) {
      await loadChapter(pos.chapter || 0);
      state.pendingSentence = pos.sentence || 0;
      state.sentenceIndex = clamp(pos.sentence || 0, 0, Math.max(0, state.sentences.length - 1));
      buildSentenceSpans(); scrollToSentence();
    } else {
      await loadChapter(nextNarratableChapter(0) || 0);
    }
    openReader();
    startPreload();
    updateAudioBar();
  } catch (e) { toast('Could not reopen book: ' + e.message); }
}

/* ---------------- open book flow ---------------- */
async function handleFile(file) {
  if (!file) return;
  const name = file.name || 'book';
  const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
  const isEpub = /\.epub$/i.test(name) || file.type === 'application/epub+zip';
  if (!isPdf && !isEpub) { toast('Please pick an EPUB or PDF file'); return; }
  toast(isPdf ? 'Converting PDF…' : 'Opening book…');
  try {
    const buf = await file.arrayBuffer();
    let meta;
    if (isPdf) meta = await openPdf(buf, name);
    else meta = await openEpub(buf, name);
    // store the file bytes for reopening + offline use
    idbPut('books', { id: meta.id, type: isPdf ? 'pdf' : 'epub', data: buf, title: meta.title }).catch(() => {});
    const pos = loadPosition();
    if (pos && pos.chapter != null) {
      await loadChapter(pos.chapter);
      state.sentenceIndex = clamp(pos.sentence || 0, 0, Math.max(0, state.sentences.length - 1));
      buildSentenceSpans(); scrollToSentence();
    } else {
      await loadChapter(nextNarratableChapter(0) || 0);
    }
    openReader();
    startPreload();
    updateAudioBar();
    if (!hasVoiceFor(meta.language)) showVoiceHelp(meta.language);
    if (isPdf) {
      toast('PDF converted — starting read-aloud');
      setTimeout(() => playFromStart(), 600);
    }
  } catch (e) {
    console.error(e);
    toast('Could not open this file: ' + (e.message || e));
  }
}
function showVoiceHelp(lang) {
  const names = { te: 'Telugu', hi: 'Hindi', en: 'English' };
  const langName = names[langCode(lang)] || lang;
  const panel = $('#voicePanel');
  panel.innerHTML = '<h3>No ' + esc(langName) + ' voice on this device</h3>' +
    '<p>Install a ' + esc(langName) + ' voice to hear this book:</p>' +
    '<p><b>Android:</b> Settings → System → Languages → Text-to-speech → Google Text-to-Speech → Install voice data → ' + esc(langName) + '.</p>' +
    '<p>You can still read the book without audio.</p>';
  $('#voiceSheet').classList.remove('hidden');
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
    const v = pickVoice(lang);
    if (v && window.speechSynthesis) { const u = new SpeechSynthesisUtterance(selText); u.voice = v; u.lang = v.lang || voiceLangTag(lang); speechSynthesis.speak(u); }
    else toast('No voice for this language');
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

/* ---------------- click-to-hear: tap a paragraph to narrate from there ---------------- */
$('#pageContent').addEventListener('click', ev => {
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
  else { try { speechSynthesis.cancel(); } catch (e) {} state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
});

/* ---------------- backup / restore / storage / voices ---------------- */
function backupLibrary() {
  const data = { app: 'offline-epub-reader', version: 1, at: new Date().toISOString(), settings, library, positions: {}, bookmarks: {}, highlights: {} };
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
  let html = '<h3>Storage</h3>';
  html += '<p>Used: ' + ((est.usage || 0) / 1048576).toFixed(1) + ' MB of ' + ((est.quota || 0) / 1073741824).toFixed(1) + ' GB available.</p>';
  if (!books.length) html += '<p>No books cached yet.</p>';
  books.forEach(b => {
    html += '<div class="row"><span>' + esc(b.title || b.id) + ' — ' + ((b.data ? b.data.byteLength : 0) / 1048576).toFixed(1) + ' MB</span><button class="mini-btn" data-del="' + esc(b.id) + '">Delete</button></div>';
  });
  p.innerHTML = html;
  p.classList.remove('hidden');
  p.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.del;
      await idbDelete('books', id).catch(() => {});
      const chs = await idbAll('chapters').catch(() => []);
      for (const c of chs.filter(c => c.key.indexOf(id + '::') === 0)) await idbDelete('chapters', c.key).catch(() => {});
      library = library.filter(b => b.id !== id); saveLibrary();
      renderLibrary(); renderContinueCard(); renderStoragePanel();
      toast('Book removed from storage');
    };
  });
}
function updateVoicePanel() {
  const p = $('#voicePanel');
  if (!p) return;
  const groups = {};
  state.voices.forEach(v => { const l = langCode(v.lang || 'und'); (groups[l] = groups[l] || []).push(v.name + ' (' + (v.lang || '?') + ')'); });
  let html = '<h3>Voices on this device</h3>';
  ['te', 'hi', 'en'].forEach(l => {
    html += '<p><b>' + l.toUpperCase() + ':</b> ' + ((groups[l] && groups[l].length) ? esc(groups[l].join(', ')) : '— none found') + '</p>';
  });
  if (!groups.te) html += '<p>Telugu voice missing? Android: Settings → Text-to-speech → Google Text-to-Speech → Install voice data → Telugu.</p>';
  p.innerHTML = html;
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
      // rebuild sentences with the new mood
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
  $('#btnChapters').onclick = openDrawer;
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
    if (settings.direction === 'horizontal') showPage(n - 1);
    else { const c = $('#pageContent'); c.scrollTop = (n - 1) * c.clientHeight; }
  };
  $('#langChips').addEventListener('click', ev => {
    const chip = ev.target.closest('.chip'); if (!chip) return;
    $$('#langChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderLibrary(chip.dataset.lang);
  });
  // settings controls
  $('#setTheme').addEventListener('change', ev => { settings.theme = ev.target.value; saveSettings(); savePerBookSettings(); applyTheme(); });
  $('#setDirection').addEventListener('change', ev => setDirection(ev.target.value));
  $('#setFont').addEventListener('change', ev => { settings.font = ev.target.value; saveSettings(); savePerBookSettings(); applyFont(); });
  $('#setFontSize').addEventListener('input', ev => { settings.fontSize = parseInt(ev.target.value, 10); saveSettings(); applyFont(); paginate(); });
  $('#setLineSpacing').addEventListener('input', ev => { settings.lineSpacing = parseInt(ev.target.value, 10); saveSettings(); applyFont(); paginate(); });
  $('#setUiLang').addEventListener('change', ev => { settings.uiLang = ev.target.value; saveSettings(); applyI18n(); refreshVoices(); });
  $('#setVoice').addEventListener('change', ev => {
    const lang = state.meta ? langCode(state.meta.language) : 'en';
    settings.voicePick[lang] = ev.target.value || null;
    saveSettings();
  });
  $('#setGenre').addEventListener('change', ev => { settings.genre = ev.target.value; saveSettings(); if (state.meta) { const m = moodOfChapter(state.chapters[state.currentChapter]); setMood(m); } });
  $('#setMoodFollow').addEventListener('change', ev => { settings.moodFollow = ev.target.checked; saveSettings(); setMood(state.mood); });
  $('#setSleepDefault').addEventListener('change', ev => { settings.sleepDefault = parseInt(ev.target.value, 10) || 0; saveSettings(); });
  $('#setLargeText').addEventListener('change', ev => { settings.largeText = ev.target.checked; saveSettings(); applyFont(); });
  $('#setHighContrast').addEventListener('change', ev => { settings.highContrast = ev.target.checked; saveSettings(); applyFont(); });
  // keyboard shortcuts (desktop)
  document.addEventListener('keydown', ev => {
    if ($('#reader').classList.contains('hidden')) return;
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target.tagName === 'TEXTAREA') return;
    if (ev.code === 'Space') { ev.preventDefault(); playNarration(); }
    else if (ev.key === 'ArrowRight') nextSentence();
    else if (ev.key === 'ArrowLeft') prevSentence();
    else if (ev.key === 'b' || ev.key === 'B') addBookmark(false);
    else if (ev.key === 'm' || ev.key === 'M') openMoodMenu();
  });
  // swipe to flip in horizontal mode
  let touchX = null;
  $('#flipWrap').addEventListener('touchstart', ev => { touchX = ev.touches[0].clientX; }, { passive: true });
  $('#flipWrap').addEventListener('touchend', ev => {
    if (touchX == null || settings.direction !== 'horizontal') return;
    const dx = ev.changedTouches[0].clientX - touchX;
    if (dx < -50) showPage(state.currentPage + 1);
    else if (dx > 50) showPage(state.currentPage - 1);
    touchX = null;
  }, { passive: true });
  window.addEventListener('resize', () => { if (state.meta && settings.direction === 'horizontal') paginate(); });
}

/* ---------------- init ---------------- */
function init() {
  applyI18n();
  applyTheme();
  applyFont();
  const st = $('#setTheme'); if (st) st.value = settings.theme;
  const sd = $('#setDirection'); if (sd) sd.value = settings.direction;
  const sg = $('#setGenre'); if (sg) sg.value = settings.genre;
  const su = $('#setUiLang'); if (su) su.value = settings.uiLang;
  const ss = $('#setSleepDefault'); if (ss) ss.value = String(settings.sleepDefault || 0);
  const sm = $('#setMoodFollow'); if (sm) sm.checked = !!settings.moodFollow;
  const sl = $('#setLargeText'); if (sl) sl.checked = !!settings.largeText;
  const sh = $('#setHighContrast'); if (sh) sh.checked = !!settings.highContrast;
  setMood('neutral');
  wire();
  refreshVoices();
  renderLibrary();
  renderContinueCard();
  showScreen('home');
  // test hook for the automated harness
  window.__reader = {
    state, settings,
    openEpub, openPdf, handleFile, loadChapter, playNarration, pauseNarration,
    version: '1.0.0'
  };
}
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
