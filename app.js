// أذكار الصباح والمساء — data from the Hisn al-Muslim API (hisnmuslim.com)
(() => {
  "use strict";

  // باب 27: أذكار الصباح والمساء — باب 28: أذكار النوم (منه آخر آيتين من سورة البقرة)
  const CHAPTERS = [27, 28];
  const apiUrl = (n) => `https://www.hisnmuslim.com/api/ar/${n}.json`;
  const fallbackUrl = (n) => `data/hisn-${n}.json`; // نسخة محلية لو الـ API وقع
  const cacheKey = (n) => `azkar:data:v2:${n}`;

  // الكتاب بيقول "(إذا أصبح)" أو "(إذا أمسى)" على بعض الأذكار
  const MORNING_ONLY = new Set([93, 94, 95]);
  // 92 («لا إله إلا الله وحده…» 10 مرات) نفس نص 93 (100 مرة إذا أصبح)،
  // فالصبح بنعرض الـ 100 بس (بتغطي الـ 10)، وبالليل بنعرض الـ 10
  const EVENING_ONLY = new Set([97, 92]);
  // عدد المرات مكتوب في النص بس ناقص في حقل REPEAT
  const REPEAT_FIX = { 83: 7 };
  // آخر آيتين من سورة البقرة (من باب أذكار النوم) — تتقرأ بالليل، فبنضيفها للمساء بعد المعوذات
  // المعوذات جاية في الكتاب ذكر واحد (76) — بنقسمها 3 سور، كل سورة تتقرأ 3 مرات
  const SPLIT_SURAHS = { 76: ["سورة الإخلاص", "سورة الفلق", "سورة الناس"] };
  // after: null = أول حاجة في القائمة
  const EVENING_EXTRA = [{ id: 101, after: null }];
  // صيغة المساء: الكتاب بيكتبها كملاحظة "[وإذا أمسى قال: ...]" ومختصرة أحيانًا،
  // فبنبدّل في نص الصباح الكلمات اللي الكتاب بيقول تتغير بس. لو أي تبديل ما لقاش مكانه،
  // بنرجع نعرض الملاحظة زي ما هي بدل ما نطلع نص غلط.
  const EVENING_SWAPS = {
    77: [
      ["أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ", "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ"],
      ["خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيرَ مَا بَعْدَهُ", "خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا"],
      ["شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ", "شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا"],
    ],
    78: [
      ["بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا", "بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا"],
      ["وَإِلَيْكَ النُّشُورُ", "وَإِلَيْكَ الْمَصِيرُ"],
    ],
    80: [["أَصْبَحْتُ", "أَمْسَيْتُ"]],
    81: [["مَا أَصْبَحَ بِي", "مَا أَمْسَى بِي"]],
    89: [
      ["أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ", "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ"],
      ["خَيْرَ هَذَا الْيَوْمِ:فَتْحَهُ، وَنَصْرَهُ، وَنورَهُ، وَبَرَكَتَهُ، وَهُدَاهُ", "خَيْرَ هَذِهِ اللَّيْلَةِ: فَتْحَهَا، وَنَصْرَهَا، وَنُورَهَا، وَبَرَكَتَهَا، وَهُدَاهَا"],
      ["مِنْ شَرِّ مَا فِيهِ وَشَرِّ مَا بَعْدَهُ", "مِنْ شَرِّ مَا فِيهَا وَشَرِّ مَا بَعْدَهَا"],
    ],
    90: [["أَصْبَحْنا عَلَى", "أَمْسَيْنَا عَلَى"]],
  };

  // ترتيب علامات التشكيل على نفس الحرف (شدة + ضمة مثلًا) بيختلف من مصدر للتاني وشكلها واحد،
  // فبنرتّبها ترتيب ثابت قبل المقارنة
  const sortMarks = (s) => s.replace(/[ً-ْ]{2,}/g, (m) => [...m].sort().join(""));

  function eveningVersion(id, text) {
    const swaps = EVENING_SWAPS[id];
    if (!swaps) return "";
    let out = sortMarks(text);
    for (const [from, to] of swaps) {
      const f = sortMarks(from);
      if (!out.includes(f)) { console.warn("evening swap not found", id, from); return ""; }
      out = out.replace(f, to);
    }
    return out;
  }

  // فضل كل ذكر ومصدره (virtues.js)
  const VIRTUES = window.AZKAR_VIRTUES || {};

  const $ = (sel) => document.querySelector(sel);
  const list = $("#list");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  let items = [];
  let time = new Date().getHours() >= 3 && new Date().getHours() < 15 ? "morning" : "evening";
  let progress = {};

  // ---------- data ----------
  async function fetchJson(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  async function loadChapter(n) {
    try {
      const data = await fetchJson(apiUrl(n), 8000);
      store.set(cacheKey(n), data);
      return data;
    } catch {
      return store.get(cacheKey(n), null) || fetchJson(fallbackUrl(n), 8000);
    }
  }
  const loadData = () => Promise.all(CHAPTERS.map(loadChapter));

  // الكتاب بيكتب صيغة المساء بين أقواس: [وإذا أمسى قال: ...]
  const EVENING_NOTE = /\[\s*وإذا أمسى قال:\s*([^\]]+?)\s*\]/g;

  function parse([ch27, ch28]) {
    const main = toItems(Object.values(ch27)[0] || []).flatMap(splitSurahs).map((it) => ({
      ...it,
      when: MORNING_ONLY.has(it.id) ? "morning" : EVENING_ONLY.has(it.id) ? "evening" : "both",
    }));
    const sleep = toItems(Object.values(ch28 || {})[0] || []);
    for (const extra of EVENING_EXTRA) {
      const it = sleep.find((s) => s.id === extra.id);
      if (!it) continue;
      const at = extra.after == null ? -1 : main.findIndex((m) => m.id === extra.after);
      main.splice(at + 1, 0, { ...it, when: "evening" });
    }
    // الأذكار اللي بتتقال 100 مرة تنزل آخر القائمة (الترتيب بين الباقي زي ما هو)
    return main.sort((a, b) => (a.repeat >= 100) - (b.repeat >= 100));
  }

  // كل سورة بتبدأ بـ "بسم الله الرحمن الرحيم"، فبنقسم عليها
  function splitSurahs(it) {
    const names = SPLIT_SURAHS[it.id];
    if (!names) return [it];
    const parts = it.text.split(/(?=بسم الله الرحمن الرحيم)/).map((s) => s.trim().replace(/\s*\.$/, "")).filter(Boolean);
    if (parts.length !== names.length) return [it]; // لو شكل النص اتغير، نسيبه زي ما هو
    return parts.map((text, i) => ({
      ...it,
      id: `${it.id}-${i + 1}`,
      text,
      hint: names[i],
      vid: i === 0 ? it.id : null,     // الفضل يظهر مرة واحدة تحت أول سورة
    }));
  }

  function toItems(raw) {
    return raw.map((x) => {
      const text = String(x.ARABIC_TEXT || "");
      const notes = [...text.matchAll(EVENING_NOTE)].map((m) => m[1].trim());
      // بعد شيل (( )) حوالين الذكر، اللي يفضل بين قوسين مفردين هو تعليمات زي "(ثلاث مرات)"
      // العدد بيظهر في العدّاد، والمعلومة الزيادة (عند الكسل، في اليوم) بتنزل سطر صغير تحت النص
      const hints = [];
      const main = text
        .replace(EVENING_NOTE, "")
        .replace(/\(\(|\)\)/g, "")
        .replace(/\(([^()]*)\)/g, (_, inner) => {
          const plain = inner.replace(/[ً-ْ]/g, "");
          if (/الكسل/.test(plain)) hints.push("أو " + inner.trim());
          else if (/اليوم/.test(plain)) hints.push(inner.trim());
          return "";
        })
        .replace(/\s*[،,]\s*أَوْ\s*(?=[.\s]*$)/, "")
        .replace(/\s+/g, " ")
        .replace(/\s*\.?\s*$/, "")
        .replace(/\s+([.،,])/g, "$1")
        .trim();
      return {
        id: x.ID,
        vid: x.ID,
        text: main,
        eveningText: eveningVersion(x.ID, main),
        hint: hints.join("، "),
        eveningNotes: notes,
        repeat: REPEAT_FIX[x.ID] || Math.max(1, parseInt(x.REPEAT, 10) || 1),
      };
    });
  }

  // ---------- progress (يتصفّر كل يوم) ----------
  const today = () => new Date().toLocaleDateString("en-CA");
  const progressKey = () => `azkar:progress:${today()}:${time}`;
  const loadProgress = () => { progress = store.get(progressKey(), {}); };
  const saveProgress = () => store.set(progressKey(), progress);

  // ---------- render ----------
  const arNum = (n) => n.toLocaleString("ar-EG");
  const timesLabel = (n) => n === 1 ? "مرة واحدة" : n === 2 ? "مرتان" : n <= 10 ? `${arNum(n)} مرات` : `${arNum(n)} مرة`;

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    }
    for (const kid of kids) if (kid != null) e.append(kid);
    return e;
  }

  function render() {
    document.body.dataset.time = time;
    $("#doneTime").textContent = time === "morning" ? "الصباح" : "المساء";
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.time === time)));

    list.replaceChildren(...visible().map(card));
    updateProgress();
  }

  function card(item) {
    const left = () => item.repeat - (progress[item.id] || 0);
    const counter = el("button", { class: "counter", "aria-label": "عدّ" });
    const box = el("article", { class: "card" });

    const paint = () => {
      const l = left();
      box.classList.toggle("finished", l <= 0);
      counter.textContent = l <= 0 ? "✓ تمّ" : item.repeat === 1 ? "اضغط للإتمام" : `متبقٍّ ${arNum(l)} من ${arNum(item.repeat)}`;
    };

    const tick = () => {
      if (left() <= 0) return;
      progress[item.id] = (progress[item.id] || 0) + 1;
      saveProgress();
      if (navigator.vibrate) navigator.vibrate(left() <= 0 ? [30, 40, 30] : 15);
      box.classList.add("tapped");
      setTimeout(() => box.classList.remove("tapped"), 120);
      paint();
      updateProgress();
      if (left() <= 0) {
        const next = box.nextElementSibling;
        if (next && !next.classList.contains("finished")) setTimeout(() => next.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
      }
    };

    counter.addEventListener("click", tick);
    const useEvening = time === "evening" && item.eveningText;
    const shownText = useEvening ? item.eveningText : item.text;
    const zikr = el("p", { class: "zikr", title: "اضغط على النص للعدّ" }, shownText);
    zikr.addEventListener("click", () => { if (!window.getSelection().toString()) tick(); });

    const hint = item.hint ? el("p", { class: "hint" }, item.hint) : null;
    let note = null;
    if (time === "evening" && !useEvening && item.eveningNotes.length) {
      note = el("div", { class: "note" }, el("b", {}, "في المساء تقول: "));
      item.eveningNotes.forEach((n, i) => { if (i) note.append(el("br")); note.append(n); });
    }

    const mini = el("div", { class: "mini" });
    const copy = el("button", { "aria-label": "نسخ" }, "نسخ");
    copy.addEventListener("click", async () => {
      const txt = shownText + (note ? "\n\n" + note.innerText : "");
      try { await navigator.clipboard.writeText(txt); copy.textContent = "✓ نُسخ"; } catch { copy.textContent = "تعذّر"; }
      setTimeout(() => (copy.textContent = "نسخ"), 1500);
    });
    mini.append(copy);

    const v = VIRTUES[item.vid];
    const virtue = v ? el("div", { class: "virtue" },
      v.fadl ? el("p", { class: "virtue-text" }, el("b", {}, "فضله: "), v.fadl) : null,
      v.src ? el("p", { class: "virtue-src" }, v.src) : null) : null;

    box.append(zikr, hint || "", note || "", virtue || "", el("div", { class: "card-foot" }, counter, mini));
    paint();
    return box;
  }

  const visible = () => items.filter((i) => i.when === "both" || i.when === time);

  function updateProgress() {
    const shown = visible();
    const done = shown.filter((i) => (progress[i.id] || 0) >= i.repeat).length;
    const pct = shown.length ? (done / shown.length) * 100 : 0;
    $("#progressBar").style.width = pct + "%";
    $("#progressText").textContent = shown.length ? `${arNum(done)} من ${arNum(shown.length)} ذكرًا` : "";
    $("#doneBox").hidden = !(shown.length && done === shown.length);
  }

  // ---------- settings ----------
  function applyFont(px) {
    px = Math.min(2.4, Math.max(1.05, px));
    document.documentElement.style.setProperty("--fs", px + "rem");
    store.set("azkar:fs", px);
    return px;
  }
  let fs = applyFont(store.get("azkar:fs", 1.45));
  $("#fontUp").addEventListener("click", () => (fs = applyFont(fs + 0.15)));
  $("#fontDown").addEventListener("click", () => (fs = applyFont(fs - 0.15)));

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  function applyTheme(t) { document.documentElement.dataset.theme = t; store.set("azkar:theme", t); }
  applyTheme(store.get("azkar:theme", prefersDark ? "dark" : "light"));
  $("#themeBtn").addEventListener("click", () =>
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      if (t.dataset.time === time) return;
      time = t.dataset.time;
      loadProgress();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));

  const reset = () => { progress = {}; saveProgress(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("#resetBtn").addEventListener("click", reset);
  $("#resetBtn2").addEventListener("click", reset);

  // ---------- تطبيق على الموبايل (PWA) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  // زرار «تثبيت»: بيظهر دايمًا على الموبايل (طالما التطبيق مش متثبّت ومفتوح منه).
  // لو المتصفح بيدعم التثبيت المباشر (Chrome أندرويد) بنفتح نافذة التثبيت على طول،
  // غير كده (آيفون، أو متصفح واتساب/فيسبوك) بنعرض الخطوات المناسبة للجهاز.
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|; wv\)/i.test(ua);
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  let installPrompt = null;
  const installBtn = $("#installBtn");
  const sheet = $("#installSheet");
  const showBtn = () => { installBtn.hidden = isStandalone() || !(installPrompt || isIOS || isAndroid); };
  showBtn();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    showBtn();
  });

  function installSteps() {
    if (inAppBrowser) return [
      "إنت فاتح اللينك من جوه تطبيق تاني (زي فيسبوك أو إنستجرام)، وده مش بيسمح بالتثبيت.",
      isIOS ? "دوس على ⋯ أو زرار المشاركة واختار «فتح في Safari»." : "دوس على ⋮ فوق واختار «فتح في Chrome».",
      "وبعدها دوس «تثبيت» تاني.",
    ];
    if (isIOS) return [
      "دوس زرار المشاركة ⬆️ تحت في Safari.",
      "انزل واختار «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).",
      "دوس «إضافة»، وهتلاقي «أذكارك» على الشاشة.",
    ];
    return [
      "دوس على ⋮ فوق على اليمين في Chrome.",
      "اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».",
      "دوس «تثبيت»، وهتلاقي «أذكارك» مع تطبيقاتك.",
    ];
  }

  installBtn.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      showBtn();
      return;
    }
    $("#installSteps").replaceChildren(...installSteps().map((s) => el("li", {}, s)));
    sheet.showModal();
  });
  $("#installClose").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; installBtn.hidden = true; });

  // ---------- start ----------
  loadProgress();
  loadData()
    .then((data) => { items = parse(data); render(); })
    .catch(() => {
      list.replaceChildren(el("p", { class: "status" }, "تعذّر تحميل الأذكار، تأكد من الاتصال بالإنترنت ثم أعد المحاولة."));
    });
})();
