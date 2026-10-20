import { LEVELS, BANK, TEST_PLAN, PASS_SCORE } from "./bank.js";
import * as SP from "./speech.js";

// The Claude client loads from a CDN, so pull it in only when needed; the rest works offline
const ai = () => import("./ai.js");

const LV = LEVELS.map(l => l.id);
const XP_PER_LEVEL = 300;
const MISSIONS = [
  { key: "W", name: "쓰기 · 순간영작", n: 5, mins: 5 },
  { key: "S", name: "듣고 말하기", n: 5, mins: 10 },
  { key: "X", name: "오답 복습", n: 3, mins: 5 },
];
const TYPE_NAME = { W: "쓰기", L: "듣기", R: "따라 말하기", Q: "듣고 대답하기", O: "의견 말하기" };
const KIND_NAME = { test: "레벨 테스트", write: "쓰기 연습", speak: "듣고 말하기", review: "오답 복습" };

// ---------- state ----------
const STORE = "elu.v1";
const fresh = () => ({
  v: 1, level: "A2", levelNote: "대화 연습에서 추정한 시작 레벨", xp: 0,
  settings: { key: "", accent: "US", rate: 1 },
  streak: { last: "", count: 0 }, days: {}, seen: {},
  sections: null, history: [], wrong: [],
});
let state = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.v === 1) return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } }; } catch (e) {}
  return fresh();
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch (e) { toast("저장 공간이 부족해요. 설정에서 백업 후 오래된 기록을 지워 주세요."); }
}

// ---------- ui state (not saved) ----------
const ui = { view: "home", session: null, rec: null, draft: "", plays: 0, rate: 1, showText: false, askOpen: null, askBusy: false,
  testTarget: null, testSource: "bank", histFilter: "all", detail: null, confirmReset: false, keyStatus: "" };

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>").replace(/\n/g, "<br>");
const plain = s => String(s || "").replace(/\*\*/g, "");
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortDate = iso => { const [, m, d] = iso.split("-"); return `${+m}/${+d}`; };
const lvInfo = id => LEVELS.find(l => l.id === id) || LEVELS[0];
const nextLv = id => LV[Math.min(LV.indexOf(id) + 1, LV.length - 1)];
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
const hasKey = () => !!state.settings.key;
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3200); }

const ICON = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  pen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  mic: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  micBig: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  stop: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  redo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>',
  play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  sound: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  flame: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--speak)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 .8 1.2 1.6 1.6 2.4 1.6C11.4 7.5 11 5.5 12 3z"/></svg>',
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
  level: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  book: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v16l-7-4-7 4z"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

// ---------- question items ----------
function fromBank(level, t, idx) {
  const r = BANK[level][t][idx], id = `${level}:${t}:${idx}`;
  if (t === "W") return { t, id, level, ko: r[0], answers: r[1], prompt: r[0] };
  if (t === "L") { // shuffle options so the right answer moves around
    const order = [0, 1, 2].sort(() => Math.random() - .5);
    return { t, id, level, say: r[0], q: r[1], options: order.map(k => r[2][k]), answer: order.indexOf(r[3]), prompt: r[1] };
  }
  if (t === "R") return { t, id, level, text: r, prompt: r };
  return { t, id, level, prompt: r[0], hint: r[1], sample: r[2] };
}
// Least recently seen first, so the same level keeps showing different questions
function pick(level, t, n) {
  const ids = BANK[level][t].map((_, i) => i)
    .map(i => [state.seen[`${level}:${t}:${i}`] || 0, Math.random(), i])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, n).map(x => x[2]);
  const now = Date.now();
  ids.forEach(i => state.seen[`${level}:${t}:${i}`] = now);
  return ids.map(i => fromBank(level, t, i));
}
function fromGenerated(level, g) {
  const stamp = Date.now(), out = [];
  g.W.forEach((x, i) => out.push({ t: "W", id: `ai:${stamp}:W${i}`, level, ko: x.ko, answers: x.answers, prompt: x.ko }));
  g.L.forEach((x, i) => out.push({ t: "L", id: `ai:${stamp}:L${i}`, level, say: x.say, q: x.q, options: x.options.slice(0, 3), answer: Math.max(0, Math.min(2, x.answer)), prompt: x.q }));
  g.R.forEach((x, i) => out.push({ t: "R", id: `ai:${stamp}:R${i}`, level, text: x.text, prompt: x.text }));
  ["Q", "O"].forEach(t => g[t].forEach((x, i) => out.push({ t, id: `ai:${stamp}:${t}${i}`, level, prompt: x.prompt, hint: x.hint, sample: x.sample })));
  return out;
}
function testFromBank(level) {
  return Object.entries(TEST_PLAN).flatMap(([t, n]) => pick(level, t, n));
}

// ---------- grading ----------
const norm = s => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\bwanna\b/g, "want to").replace(/\bgonna\b/g, "going to")
  .replace(/\bi'm\b/g, "i am").replace(/\b(\w+)'s\b/g, "$1 is").replace(/\b(\w+)'ve\b/g, "$1 have").replace(/\b(\w+)'ll\b/g, "$1 will")
  .replace(/\b(\w+)'d\b/g, "$1 would").replace(/\b(\w+)n't\b/g, "$1 not").replace(/\bseven\b/g, "7").replace(/\bthree\b/g, "3")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const scoreOf = v => v === "ok" ? 100 : v === "minor" ? 60 : 0;
const verdictOf = s => s >= 75 ? "ok" : s >= 50 ? "minor" : "wrong";

async function grade(item, sess) {
  const key = state.settings.key, lv = sess.level;
  try {
    if (item.t === "W") {
      if (key) {
        const r = await (await ai()).gradeWriting(key, lv, item, item.mine);
        item.res = { ...r, score: scoreOf(r.verdict) };
      } else {
        const ok = item.answers.some(a => norm(a) === norm(item.mine));
        item.res = { verdict: ok ? "ok" : "wrong", score: ok ? 100 : 0, fix: ok ? item.mine : item.answers[0],
          tip: ok ? "" : "모범 답안과 똑같은지만 비교했어요. API 키를 넣으면 뜻이 통하는 답도 정답으로 인정해요." };
      }
    } else if (item.t === "L") {
      const ok = item.choice === item.answer;
      item.res = { verdict: ok ? "ok" : "wrong", score: ok ? 100 : 0, fix: item.options[item.answer], tip: `들린 문장: ${item.say}` };
    } else if (item.t === "R") {
      const c = SP.compareReading(item.text, item.mine);
      item.res = { verdict: c.score >= 85 ? "ok" : c.score >= 60 ? "minor" : "wrong", score: c.score, fix: item.text, display: c.display,
        tip: c.missed.length ? `잘 안 들린 단어: ${[...new Set(c.missed)].slice(0, 6).join(", ")}. 원어민 음성을 듣고 다시 따라 해 보세요.` : "모든 단어가 또렷하게 인식됐어요." };
    } else if (item.self != null) {
      const v = verdictOf(item.self);
      item.res = { verdict: v, score: item.self, fix: v === "ok" ? item.mine : item.sample, better: item.sample, tip: "스스로 채점한 결과예요. API 키를 넣으면 Claude가 채점해요." };
    } else {
      const r = await (await ai()).gradeSpeaking(key, lv, item, item.mine, item.t);
      item.res = { ...r, score: Math.max(0, Math.min(100, r.score)) };
    }
  } catch (e) {
    item.res = { verdict: "wait", score: null, fix: item.t === "W" ? item.answers[0] : item.sample || item.text || "", tip: e.message, failed: true };
  }
  if (ui.session === sess) paintLastFeedback();
}

// ---------- sessions ----------
function startSession(kind, opts = {}) {
  const level = opts.level || state.level;
  let items = opts.items;
  if (!items) {
    if (kind === "write") items = pick(level, "W", 5);
    else if (kind === "speak") items = opts.mode === "Q" ? [...pick(level, "Q", 4), ...pick(level, "O", 1)] : pick(level, "R", 5);
    else if (kind === "review") items = state.wrong.slice().sort(() => Math.random() - .5).slice(0, 5).map(w => ({ ...w.item, fromWrong: true }));
    else if (kind === "test") items = testFromBank(level);
  }
  items = items.map(it => ({ ...it, mine: "", res: null, choice: null, self: null, fromWrong: it.fromWrong }));
  if (!items.length) { toast("오답노트가 비어 있어요."); return; }
  ui.session = { kind, mode: opts.mode, level, items, i: 0, pending: [], startedAt: Date.now(), source: opts.source || "bank", retryOf: opts.retryOf };
  resetCard();
  ui.view = "session";
  save();
  render();
  autoplay();
}
function resetCard() { stopRec(); ui.draft = ""; ui.plays = 0; ui.showText = false; ui.selfStep = false; }

function submitCurrent(value) {
  const s = ui.session, item = s.items[s.i];
  if (item.t === "L") item.choice = value;
  else item.mine = String(value ?? "").trim();
  if ((item.t === "Q" || item.t === "O") && !hasKey() && item.self == null) { ui.selfStep = true; render(); return; }
  s.pending.push(grade(item, s));
  advance();
}
function advance() {
  const s = ui.session;
  s.i++;
  resetCard();
  if (s.i >= s.items.length) return finishSession();
  render();
  autoplay();
}

async function finishSession() {
  const s = ui.session;
  s.done = true; s.grading = true;
  ui.view = "result"; render();
  await Promise.allSettled(s.pending);
  s.grading = false;
  const items = s.items, d = new Date();
  const entry = { id: String(d.getTime()), date: day(d), time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`,
    kind: s.kind, mode: s.mode, level: s.level, source: s.source, items: items.map(compact) };
  const scored = items.filter(it => typeof it.res?.score === "number");
  entry.score = avg(scored.map(it => it.res.score));

  if (s.kind === "test") {
    const sec = t => avg(items.filter(it => t.includes(it.t) && typeof it.res?.score === "number").map(it => it.res.score));
    entry.sections = { W: sec(["W"]), L: sec(["L"]), S: sec(["R", "Q", "O"]) };
    entry.passed = Object.values(entry.sections).every(v => v >= PASS_SCORE);
    entry.prevLevel = state.level;
    if (entry.passed && LV.indexOf(s.level) >= LV.indexOf(state.level)) {
      entry.levelUp = s.level !== state.level;
      state.level = s.level; state.xp = 0;
      state.levelNote = `${shortDate(entry.date)} ${s.level} 테스트 합격`;
    }
    state.sections = { ...entry.sections, level: s.level, date: entry.date };
  } else {
    state.xp = Math.min(XP_PER_LEVEL, state.xp + items.reduce((a, it) => a + (it.res?.verdict === "ok" ? 10 : it.res?.verdict === "minor" ? 5 : 0), 0));
    const k = s.kind === "write" ? "W" : s.kind === "speak" ? "S" : "X";
    const today = state.days[day()] || (state.days[day()] = {});
    today[k] = (today[k] || 0) + items.length;
  }
  // wrong notebook: add misses, drop items now answered well
  for (const it of items) {
    const v = it.res?.verdict;
    if (!v || v === "wait") continue;
    const prev = state.wrong.find(w => w.item.id === it.id);
    if (v === "ok") { if (prev) state.wrong = state.wrong.filter(w => w !== prev); continue; }
    if (it.t === "L") continue; // listening misses are reviewed through the test record
    state.wrong = state.wrong.filter(w => w !== prev);
    state.wrong.push({ item: strip(it), mine: it.mine, fix: it.res.fix, tip: it.res.tip, date: entry.date, qa: prev?.qa || [] });
  }
  state.wrong = state.wrong.slice(-80);
  // streak
  const today = day(), y = new Date(); y.setDate(y.getDate() - 1);
  if (state.streak.last !== today) { state.streak.count = state.streak.last === day(y) ? state.streak.count + 1 : 1; state.streak.last = today; }
  state.history.push(entry);
  state.history = state.history.slice(-150).map((r, i, a) => { if (i < a.length - 40 && r.items) { const { items, ...rest } = r; return rest; } return r; });
  s.entry = entry;
  save();
  render();
  if (s.kind === "test" && hasKey()) {
    const wrongs = items.filter(it => it.res && it.res.verdict !== "ok").map(it => `- [${TYPE_NAME[it.t]}] ${it.prompt} / 답: ${it.t === "L" ? it.options[it.choice] ?? "(무응답)" : it.mine || "(무응답)"}`);
    try {
      entry.summary = await (await ai()).summarizeTest(state.settings.key, s.level, entry.sections, wrongs);
      save();
      if (ui.view === "result") render();
    } catch (e) {}
  }
}
const strip = it => { const { res, mine, choice, self, fromWrong, ...rest } = it; return rest; };
const compact = it => ({ ...strip(it), mine: it.mine, choice: it.choice, res: it.res ? { ...it.res } : null });

// ---------- recording ----------
function startRec() {
  SP.stopSpeaking();
  ui.rec = { active: true, heard: "", err: "" };
  ui.rec.stop = SP.listen({
    accent: state.settings.accent,
    onUpdate: t => { ui.rec.heard = t; const el = $("#heard"); if (el) el.textContent = t; },
    done: r => {
      if (!ui.rec) return;
      ui.rec.active = false;
      ui.rec.heard = r.text || ui.rec.heard;
      ui.draft = ui.rec.heard;
      if (r.error && !ui.rec.heard) ui.rec.err = r.error === "not-allowed" || r.error === "service-not-allowed"
        ? "마이크 권한이 꺼져 있어요. 휴대폰 설정에서 이 앱(브라우저)의 마이크를 허용해 주세요."
        : r.error === "no-speech" ? "목소리가 들리지 않았어요. 다시 눌러서 말해 보세요." : "음성 인식이 안 됐어요. 아래 칸에 키보드 마이크로 입력해도 돼요.";
      render();
    },
  });
  render();
}
function stopRec() { if (ui.rec?.active) ui.rec.stop?.(); ui.rec = null; }

async function play(text, rate) {
  ui.plays++;
  const ok = await SP.speak(text, { accent: state.settings.accent, rate: rate || ui.rate || state.settings.rate });
  if (!ok && !SP.canSpeak()) toast("이 브라우저는 영어 음성 재생을 지원하지 않아요.");
}
function autoplay() {
  const s = ui.session; if (!s || s.done) return;
  const it = s.items[s.i];
  if (it.t === "L") setTimeout(() => play(it.say), 350);
  if (it.t === "Q" || it.t === "O") setTimeout(() => play(it.prompt), 350);
}

// ---------- views ----------
function render() {
  const v = ui.view, app = $("#app");
  const inRun = v === "session";
  $("#tabs").hidden = inRun;
  $("#tabs").innerHTML = [["home", "홈", ICON.home], ["practice", "연습", ICON.pen], ["test", "레벨", ICON.level], ["notes", "오답노트", ICON.book], ["settings", "설정", ICON.gear]]
    .map(([k, n, ic]) => `<button data-act="tab" data-v="${k}" ${tabOf(v) === k ? 'aria-current="page"' : ""}>${ic}${n}</button>`).join("");
  app.innerHTML = (VIEWS[v] || VIEWS.home)();
  const ta = $("#answer"); if (ta) { ta.value = ui.draft; if (inRun && !SP.canListen() || ui.session?.items[ui.session.i]?.t === "W") ta.focus({ preventScroll: true }); }
  if (inRun) paintLastFeedback();
}
const tabOf = v => ({ home: "home", practice: "practice", test: "test", result: ui.session?.kind === "test" ? "test" : "practice", history: "test", detail: "test", notes: "notes", settings: "settings" }[v] || "home");

const VIEWS = {
  home() {
    const lv = lvInfo(state.level), nx = nextLv(state.level), sec = state.sections, today = state.days[day()] || {};
    const pct = Math.round(state.xp / XP_PER_LEVEL * 100), ready = state.xp >= XP_PER_LEVEL && nx !== state.level;
    const doneN = MISSIONS.filter(m => (today[m.key] || 0) >= m.n).length;
    const nextM = MISSIONS.find(m => (today[m.key] || 0) < m.n && !(m.key === "X" && !state.wrong.length));
    const d = new Date(), wd = "일월화수목금토"[d.getDay()];
    return `
    <div class="between">
      <div><span class="small muted">${d.getMonth() + 1}월 ${d.getDate()}일 ${wd}요일</span><h1>오늘의 영어</h1></div>
      <span class="chip-streak">${ICON.flame}${state.streak.count && state.streak.last >= day(new Date(Date.now() - 864e5)) ? state.streak.count : 0}일 연속</span>
    </div>
    <section class="hero" aria-label="내 레벨">
      <div class="between" style="align-items:flex-end">
        <div><span class="label">현재 레벨</span><div class="row" style="align-items:baseline;gap:10px"><span class="lvbig">${lv.id}</span><b>${lv.ko}</b></div></div>
        ${nx !== state.level ? `<div style="text-align:right"><span class="label">다음 레벨</span><div class="lvbig" style="font-size:28px;color:var(--hero-accent)">${nx}</div></div>` : ""}
      </div>
      <div class="stack" style="gap:6px">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="between small" style="color:var(--hero-muted)"><span>승급 준비 ${state.xp} / ${XP_PER_LEVEL}</span><span>${ready ? "승급 테스트를 볼 때예요" : "테스트는 언제든 볼 수 있어요"}</span></div>
      </div>
      <div class="trio">${[["W", "쓰기"], ["L", "듣기"], ["S", "말하기"]].map(([k, n]) => `<div><span class="small" style="color:var(--hero-muted)">${n}</span><b ${sec && sec[k] < PASS_SCORE ? 'style="color:#FFB48A"' : ""}>${sec ? sec[k] : "–"}</b></div>`).join("")}</div>
      <span class="small" style="color:var(--hero-muted)">${sec ? `${shortDate(sec.date)} ${sec.level} 테스트 영역 점수` : esc(state.levelNote)}</span>
    </section>
    <section class="stack" aria-label="오늘의 미션">
      <div class="between"><h2>오늘의 미션</h2><span class="small muted">${doneN} / 3 완료 · 약 20분</span></div>
      ${MISSIONS.map(m => {
        const n = today[m.key] || 0, done = n >= m.n, isNext = nextM === m, empty = m.key === "X" && !state.wrong.length;
        const ic = done ? `<span class="ic done">${ICON.check}</span>` : m.key === "S" ? `<span class="ic sp">${ICON.mic}</span>` : m.key === "W" ? `<span class="ic">${ICON.pen}</span>` : `<span class="ic">${ICON.redo}</span>`;
        const sub = done ? `${Math.min(n, m.n)} / ${m.n} 완료` : empty ? "틀린 문장이 아직 없어요" : `${n} / ${m.n} · 약 ${m.mins}분`;
        return `<button class="mission ${done ? "done" : ""} ${isNext ? "next" : ""}" data-act="mission" data-k="${m.key}" ${empty && !done ? "disabled" : ""}>${ic}<span class="stack" style="gap:0"><span class="t">${m.name} ${m.n}문장</span><span class="small muted">${sub}</span></span>${isNext ? '<span class="go">시작</span>' : ""}</button>`;
      }).join("")}
    </section>
    ${installHint()}
    ${!hasKey() ? `<div class="note">설정에서 <b>Claude API 키</b>를 넣으면 뜻이 통하는 답도 정답으로 인정하고, 말하기 답변도 채점해요. 지금은 정답과 그대로 비교해요.</div>` : ""}`;
  },

  practice() {
    return `
    <h1>연습</h1>
    <p class="muted">지금 레벨(${state.level}) 문제가 나와요. 레벨은 설정에서 바꿀 수 있어요.</p>
    <button class="mission" data-act="start" data-kind="write"><span class="ic">${ICON.pen}</span><span class="stack" style="gap:0"><span class="t">쓰기 · 순간영작</span><span class="small muted">한국어를 보고 2~3초 안에 영어로 · 5문장</span></span></button>
    <button class="mission" data-act="start" data-kind="speak" data-mode="R"><span class="ic sp">${ICON.mic}</span><span class="stack" style="gap:0"><span class="t">따라 말하기</span><span class="small muted">원어민 문장을 듣고 소리 내어 읽기 · 5문장</span></span></button>
    <button class="mission" data-act="start" data-kind="speak" data-mode="Q"><span class="ic sp">${ICON.sound}</span><span class="stack" style="gap:0"><span class="t">듣고 대답하기</span><span class="small muted">영어 질문을 듣고 말로 답하기 · 5문제</span></span></button>
    <button class="mission" data-act="start" data-kind="review" ${state.wrong.length ? "" : "disabled"}><span class="ic">${ICON.redo}</span><span class="stack" style="gap:0"><span class="t">오답 복습</span><span class="small muted">${state.wrong.length ? `오답노트 ${state.wrong.length}문장 중 5개` : "틀린 문장이 아직 없어요"}</span></span></button>
    ${!SP.canListen() ? `<div class="warn">이 브라우저에서는 앱 안 마이크 인식이 안 돼요. 말하기 문제는 <b>키보드의 마이크 버튼</b>(받아쓰기)으로 말해서 입력하면 돼요.</div>` : ""}`;
  },

  test() {
    const target = ui.testTarget || (state.level === "C1" ? "C1" : nextLv(state.level));
    const tests = state.history.filter(h => h.kind === "test");
    return `
    <h1>레벨 테스트</h1>
    <section class="card lift">
      <div class="stack" style="gap:4px"><span class="label">볼 레벨</span>
        <div class="row">${LV.map(l => `<button class="chip" data-act="target" data-l="${l}" aria-pressed="${l === target}">${l}</button>`).join("")}</div>
        <span class="small muted">${target} ${lvInfo(target).ko}: ${lvInfo(target).can}</span></div>
      <div class="stack" style="gap:4px"><span class="label">문제</span>
        <div class="row"><button class="chip" data-act="source" data-s="bank" aria-pressed="${ui.testSource === "bank"}">문제 은행</button>
        <button class="chip" data-act="source" data-s="ai" aria-pressed="${ui.testSource === "ai"}" ${hasKey() ? "" : "disabled"}>Claude가 새로 출제</button></div>
        <span class="small muted">${ui.testSource === "ai" ? "매번 처음 보는 문제를 레벨 기준에 맞춰 새로 만들어요." : `레벨마다 쓰기 15 · 듣기 10 · 말하기 21문항 중에서 안 본 문제부터 나와요.`}</span></div>
      <div class="note"><b>15문항 · 약 15분</b><br>쓰기 5 · 듣기 5 · 말하기 5 (따라 읽기 2, 질문에 답하기 2, 의견 말하기 1)<br>세 영역이 모두 <b>${PASS_SCORE}점 이상</b>이면 ${target} 합격, 레벨이 올라가요.</div>
      <button class="btn wide" data-act="start-test" data-l="${target}">${target} 테스트 시작</button>
      <p class="small muted">CEFR 기준과 공인 말하기 시험(토익스피킹 · OPIc · 캠브리지)의 문제 유형을 따랐어요. 연습용 판정이라 공식 성적은 아니에요.</p>
    </section>
    <section class="stack">
      <div class="between"><h2>지난 테스트</h2>${state.history.length ? '<button class="chip" data-act="view" data-v="history">전체 기록</button>' : ""}</div>
      ${tests.length ? trendChart(tests.slice(-6)) + tests.slice(-3).reverse().map(histRow).join("") : '<p class="muted small">아직 본 테스트가 없어요.</p>'}
    </section>`;
  },

  history() {
    const f = ui.histFilter, list = state.history.slice().reverse().filter(h => f === "all" || (f === "test" ? h.kind === "test" : h.kind !== "test"));
    return `
    <div class="topbar"><button class="iconbtn" data-act="view" data-v="test" aria-label="뒤로">${ICON.back}</button><h1>지난 기록</h1></div>
    <div class="row">${[["all", "전체"], ["test", "레벨 테스트"], ["practice", "연습"]].map(([k, n]) => `<button class="chip" data-act="hfilter" data-f="${k}" aria-pressed="${f === k}">${n}</button>`).join("")}</div>
    <div class="stack">${list.length ? list.map(histRow).join("") : '<p class="muted">기록이 없어요.</p>'}</div>`;
  },

  detail() { return resultView(ui.detail, true); },
  result() { return resultView(ui.session, false); },
  session() { return sessionView(); },

  notes() {
    const w = state.wrong.slice().reverse();
    return `
    <div class="between"><h1>오답노트</h1>${state.wrong.length ? `<button class="chip" data-act="start" data-kind="review">다시 풀기</button>` : ""}</div>
    ${w.length ? `<section class="card"><div class="list">${w.map((x, ri) => noteItem(x, state.wrong.length - 1 - ri)).join("")}</div></section>`
      : '<p class="muted">틀린 문장이 없어요. 연습과 테스트에서 틀린 문장이 여기에 모여요.</p>'}`;
  },

  settings() {
    const k = state.settings;
    return `
    <h1>설정</h1>
    <section class="card">
      <h2>내 레벨</h2>
      <div class="row">${LV.map(l => `<button class="chip" data-act="setlevel" data-l="${l}" aria-pressed="${l === state.level}">${l} ${lvInfo(l).ko}</button>`).join("")}</div>
      <p class="small muted">연습 문제는 이 레벨로 나와요. 테스트에 합격하면 자동으로 올라가요. (${esc(state.levelNote)})</p>
    </section>
    <section class="card">
      <h2>Claude 채점</h2>
      <label class="small" for="apikey">Anthropic API 키</label>
      <input id="apikey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${esc(k.key)}">
      <div class="row"><button class="btn ghost" data-act="savekey">저장하고 확인</button>${k.key ? '<button class="btn ghost" data-act="clearkey">키 지우기</button>' : ""}</div>
      ${ui.keyStatus ? `<p class="small">${esc(ui.keyStatus)}</p>` : ""}
      <p class="small muted">키는 이 휴대폰에만 저장되고 채점할 때 Anthropic으로만 보내져요. 키는 console.anthropic.com 에서 만들 수 있고, Claude 구독과 별도로 사용량만큼 요금이 나가요.</p>
    </section>
    <section class="card">
      <h2>듣기</h2>
      <div class="row"><span class="small" style="width:56px">발음</span><button class="chip" data-act="accent" data-a="US" aria-pressed="${k.accent === "US"}">미국</button><button class="chip" data-act="accent" data-a="GB" aria-pressed="${k.accent === "GB"}">영국</button></div>
      <div class="row"><span class="small" style="width:56px">속도</span>${[[0.75, "느리게"], [1, "보통"]].map(([r, n]) => `<button class="chip" data-act="rate" data-r="${r}" aria-pressed="${k.rate === r}">${n}</button>`).join("")}</div>
      <button class="btn ghost" data-act="testvoice">${ICON.sound} 목소리 들어 보기</button>
      ${!SP.canListen() ? '<p class="small muted">이 브라우저는 앱 안 음성 인식을 지원하지 않아요. 키보드 마이크(받아쓰기)로 말해서 입력하면 돼요.</p>' : ""}
    </section>
    <section class="card">
      <h2>백업</h2>
      <p class="small muted">기록은 이 휴대폰에만 저장돼요. 휴대폰을 바꾸기 전에 백업 파일을 저장해 두세요.</p>
      <div class="row"><button class="btn ghost" data-act="export">백업 파일 저장</button><label class="btn ghost" for="importfile">백업 불러오기</label></div>
      <input id="importfile" type="file" accept="application/json,.json" hidden>
      ${ui.confirmReset ? `<div class="warn">기록, 오답노트, 레벨이 모두 지워져요. 되돌릴 수 없어요.<div class="row" style="margin-top:8px"><button class="btn" style="background:var(--bad);color:#fff" data-act="reset-yes">모두 지우기</button><button class="btn ghost" data-act="reset-no">취소</button></div></div>`
        : '<button class="chip" data-act="reset" style="align-self:flex-start">처음부터 다시 시작</button>'}
    </section>`;
  },
};

function installHint() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="note"><b>홈 화면에 추가하기</b><br>${ios ? "Safari 아래쪽 공유 버튼 → <b>홈 화면에 추가</b>" : "Chrome 오른쪽 위 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>"}<br>앱처럼 아이콘으로 바로 열려요.</div>`;
}

function histRow(h) {
  const name = KIND_NAME[h.kind] + (h.kind === "speak" ? (h.mode === "Q" ? " · 대답" : " · 따라") : "");
  const right = h.kind === "test" ? `<span class="row" style="gap:6px"><span class="pill ${h.passed ? "" : "no"}">${h.level} ${h.passed ? "합격" : "불합격"}</span></span>` : `<span class="num">${h.score}점</span>`;
  return `<button class="hrow" data-act="detail" data-id="${h.id}" ${h.items ? "" : "disabled"}><span><span class="small muted">${shortDate(h.date)} ${h.time || ""}</span><br>${name} <span class="small muted">${h.level}</span></span>${right}</button>`;
}

function trendChart(tests) {
  return `<div class="card"><div class="between"><h3>테스트 점수 변화</h3><span class="small muted">세 영역 평균</span></div>
    <div class="trend">${tests.map(t => { const s = avg(Object.values(t.sections || {})); return `<div><span>${s}</span><i class="${t.passed ? "pass" : ""}" style="height:${Math.max(4, s)}%"></i></div>`; }).join("")}</div>
    <div class="trendx">${tests.map(t => `<span>${shortDate(t.date)}<br>${t.level}${t.passed ? " 합격" : ""}</span>`).join("")}</div></div>`;
}

// ---------- session screens ----------
function sessionView() {
  const s = ui.session, it = s.items[s.i], n = s.items.length;
  const head = s.kind === "test" ? `${s.level} 레벨 테스트 · ${TYPE_NAME[it.t]}` : `${KIND_NAME[s.kind]} · ${TYPE_NAME[it.t]}`;
  return `
  <div class="topbar">
    <button class="iconbtn" data-act="quit" aria-label="그만하기">${ICON.back}</button>
    <div class="stack" style="gap:0;flex:1"><span class="label">${esc(head)}</span><b>${s.i + 1} / ${n}</b></div>
  </div>
  <div class="progress"><i style="width:${s.i / n * 100}%"></i></div>
  ${ui.quitAsk ? `<div class="warn">${s.kind === "test" ? "테스트를 그만두면 결과가 저장되지 않아요." : "지금까지 푼 문제는 저장되지 않아요."}<div class="row" style="margin-top:8px"><button class="btn dark" data-act="quit-yes">그만하기</button><button class="btn ghost" data-act="quit-no">계속하기</button></div></div>` : ""}
  ${CARD[it.t](it, s)}
  ${s.kind !== "test" && s.i > 0 ? `<section class="stack" style="gap:6px"><span class="label">방금 문제</span><div class="card" id="lastfb"></div></section>` : ""}`;
}

const answerBox = (placeholder, readonly) => `<textarea id="answer" rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="${placeholder}" ${readonly ? "readonly" : ""}></textarea>`;

function micBlock(label) {
  const r = ui.rec, on = r?.active;
  if (!SP.canListen()) return `<p class="small muted">키보드의 마이크 버튼을 누르고 영어로 말하면 아래 칸에 입력돼요.</p>${answerBox("여기에 말하거나 써서 입력")}`;
  return `
  <div class="stack" style="align-items:center;gap:8px">
    <button class="mic ${on ? "on" : ""}" data-act="mic" aria-label="${on ? "녹음 멈추기" : label}">${on ? ICON.stop : ICON.micBig}</button>
    <span class="small muted">${on ? "듣고 있어요. 다 말하면 눌러서 멈추세요." : label}</span>
  </div>
  <div class="card" style="gap:6px"><span class="label">내가 한 말</span><p class="heard" id="heard">${esc(r?.heard || ui.draft || "")}</p>${r?.err ? `<p class="small" style="color:var(--bad)">${esc(r.err)}</p>` : ""}</div>`;
}

function player(text, { limit, showText = true } = {}) {
  const left = limit ? Math.max(0, limit - ui.plays) : null;
  const bars = [12, 24, 34, 20, 28, 14, 30, 22, 10, 26, 18, 32, 16, 24, 12];
  return `<div class="player">
    <div class="row" style="gap:14px;flex-wrap:nowrap">
      <button class="play" data-act="play" aria-label="듣기" ${left === 0 ? "disabled" : ""}>${ICON.play}</button>
      <div class="wave" aria-hidden="true">${bars.map(h => `<i style="height:${h}px"></i>`).join("")}</div>
    </div>
    <div class="row">
      <button class="chip" data-act="speed" data-r="0.75" aria-pressed="${ui.rate === 0.75}">0.75배</button>
      <button class="chip" data-act="speed" data-r="1" aria-pressed="${ui.rate === 1}">보통 속도</button>
      ${showText ? `<button class="chip" data-act="toggletext" aria-pressed="${ui.showText}" style="margin-left:auto">${ui.showText ? "문장 숨기기" : "문장 보기"}</button>` : ""}
      ${left != null ? `<span class="small" style="margin-left:auto;color:var(--hero-muted)">남은 듣기 ${left}회</span>` : ""}
    </div>
    ${ui.showText && showText ? `<p class="en" style="color:var(--hero-muted)">${esc(text)}</p>` : ""}
  </div>`;
}

const CARD = {
  W(it) {
    return `<section class="card lift">
      <span class="small muted">한국어를 보고 2~3초 안에 영어로</span>
      <p class="prompt-ko">${esc(it.ko)}</p>
      <label class="small muted" for="answer">영어로 쓰기 (키보드 마이크로 말해도 돼요)</label>
      ${answerBox("")}
      <div class="row"><button class="btn ghost" data-act="skip">모르겠어요</button><button class="btn" data-act="submit" style="flex-grow:2">다음</button></div>
    </section>`;
  },
  L(it, s) {
    return `<section class="stack">
      ${player(it.say, { limit: s.kind === "test" ? 2 : null, showText: s.kind !== "test" })}
      <section class="card lift"><p style="font-weight:700">${esc(it.q)}</p>
        <div class="opts">${it.options.map((o, k) => `<button class="opt" data-act="choose" data-k="${k}">${k + 1}. ${esc(o)}</button>`).join("")}</div>
      </section></section>`;
  },
  R(it, s) {
    if (ui.selfStep) return selfCard(it);
    const has = !!(ui.rec?.heard || ui.draft);
    return `<section class="stack">
      <section class="card lift"><span class="small muted">소리 내어 읽어 보세요</span><p class="prompt-en">${esc(it.text)}</p>
        ${s.kind !== "test" ? `<button class="chip" data-act="play" style="align-self:flex-start">${ICON.sound} 원어민 먼저 듣기</button>` : ""}</section>
      ${micBlock("누르고 읽기")}
      <div class="row">${s.kind !== "test" ? '<button class="btn ghost" data-act="skip">건너뛰기</button>' : ""}<button class="btn speak" data-act="submit" ${has || !SP.canListen() ? "" : "disabled"} style="flex-grow:2">다음</button></div>
    </section>`;
  },
  Q(it, s) { return speakCard(it, s, "누르고 영어로 대답하기"); },
  O(it, s) { return speakCard(it, s, "누르고 의견 말하기 (30초~1분)"); },
};
function speakCard(it, s) {
  if (ui.selfStep) return selfCard(it);
  const has = !!(ui.rec?.heard || ui.draft);
  return `<section class="stack">
    ${player(it.prompt, { limit: s.kind === "test" && it.t === "Q" ? 2 : null })}
    <p class="small muted">${esc(it.hint)}${it.t === "O" ? " 이유를 하나 이상 들어 3~5문장으로 말해 보세요." : ""}</p>
    ${micBlock(it.t === "O" ? "누르고 의견 말하기" : "누르고 영어로 대답하기")}
    <div class="row">${s.kind !== "test" ? '<button class="btn ghost" data-act="skip">건너뛰기</button>' : ""}<button class="btn speak" data-act="submit" ${has || !SP.canListen() ? "" : "disabled"} style="flex-grow:2">다음</button></div>
  </section>`;
}
function selfCard(it) {
  return `<section class="card lift">
    <h3>모범 답변과 비교해 보세요</h3>
    <div class="stack" style="gap:2px"><span class="label">내가 한 말</span><p class="en">${esc(it.mine || "(무응답)")}</p></div>
    <div class="stack" style="gap:2px"><span class="label">모범 답변</span><p class="en">${esc(it.sample)}</p>
      <button class="chip" data-act="playsample" style="align-self:flex-start">${ICON.sound} 들어 보기</button></div>
    <p class="small muted">API 키가 없어서 스스로 채점해요.</p>
    <div class="row"><button class="btn ghost" data-act="self" data-v="85">비슷하게 말했다</button><button class="btn ghost" data-act="self" data-v="60">절반 정도</button><button class="btn ghost" data-act="self" data-v="25">거의 못 했다</button></div>
  </section>`;
}

// Feedback for the previous item while practicing; filled in when its grading finishes
function paintLastFeedback() {
  const el = $("#lastfb"), s = ui.session;
  if (!el || !s || s.done) return;
  el.innerHTML = feedback(s.items[s.i - 1], true);
}
function feedback(it, live) {
  if (!it) return "";
  const r = it.res;
  if (!r) return `<div class="fb"><span class="v wait">…</span><div><p class="small muted">${esc(it.prompt)}</p><p class="small muted">채점 중…</p></div></div>`;
  const icon = { ok: "○", minor: "△", wrong: "✕", wait: "?" }[r.verdict];
  const mine = it.t === "L" ? (it.options[it.choice] ?? "(무응답)") : it.mine || "(무응답)";
  let body;
  if (it.t === "R") body = `<p class="fix">${(r.display || []).map(w => w.ok ? esc(w.tok) : `<span class="miss">${esc(w.tok)}</span>`).join(" ")}</p><p class="small muted">인식: ${esc(mine)}</p>`;
  else if (r.verdict === "ok") body = `<p class="fix">${fmt(r.fix || mine)}</p>`;
  else body = `<p class="mine">${esc(mine)}</p><p class="fix">${fmt(r.fix)}</p>`;
  const audio = it.t !== "L" ? `<button class="chip" data-act="say" data-text="${esc(plain(it.t === "R" ? it.text : r.better || r.fix || ""))}">${ICON.sound} ${it.t === "Q" || it.t === "O" ? "좋은 답변 듣기" : "발음 듣기"}</button>` : "";
  return `<div class="fb"><span class="v ${r.verdict}" aria-label="${r.verdict}">${icon}</span><div class="stack" style="gap:4px">
    <p class="small muted">${esc(it.prompt)}${typeof r.score === "number" && it.t !== "W" && it.t !== "L" ? ` · <b>${r.score}점</b>` : ""}</p>
    ${body}
    ${r.better && r.verdict !== "ok" ? `<p class="small"><span class="label">더 좋은 답변</span><br><span class="en">${fmt(r.better)}</span></p>` : ""}
    ${r.tip ? `<p class="tip">${fmt(r.tip)}</p>` : ""}
    ${live ? `<div class="row">${audio}</div>` : audio ? `<div class="row">${audio}</div>` : ""}
  </div></div>`;
}

function resultView(s, past) {
  if (!s) return VIEWS.home();
  if (!past && s.grading) return `<section class="card lift"><h2>채점 중…</h2><p class="muted">${hasKey() ? "Claude가 답을 하나씩 확인하고 있어요." : "답을 확인하고 있어요."}</p></section>`;
  const e = past ? s : s.entry, items = past ? s.items : s.items;
  if (!e) return "";
  const isTest = e.kind === "test";
  const prev = isTest ? state.history.filter(h => h.kind === "test" && h.id < e.id).pop() : null;
  const title = KIND_NAME[e.kind];
  let top = "";
  if (isTest) {
    top = `<section class="banner ${e.passed ? "" : "fail"}">
      <span class="small">${e.passed ? "승급 조건 충족" : `합격선 ${PASS_SCORE}점에 조금 못 미쳤어요`}</span>
      <div class="row" style="gap:12px">${e.levelUp ? `<span class="lvbig" style="font-size:36px;opacity:.7">${e.prevLevel}</span><span aria-hidden="true">→</span>` : ""}<span class="lvbig" style="font-size:48px">${e.level}</span><b>${e.passed ? (e.levelUp ? `${lvInfo(e.level).ko} 달성` : "합격") : "불합격"}</b></div>
      <span class="small">${e.passed ? (e.levelUp ? "레벨이 올랐어요. 연습 문제도 이 레벨로 나와요." : "이 레벨을 확실히 다졌어요.") : "약한 영역을 연습하고 언제든 다시 도전하세요."}</span>
    </section>
    <section class="card"><div class="between"><h2>영역별 점수</h2><span class="small muted">세로선 = 합격선</span></div>
      <div class="scores">${[["W", "쓰기"], ["L", "듣기"], ["S", "말하기"]].map(([k, n]) => `<span>${n}</span><div class="sbar"><i class="${k === "S" ? "sp" : ""}" style="width:${e.sections[k]}%"></i><b></b></div><span class="num">${e.sections[k]}</span>`).join("")}</div>
      ${prev ? `<p class="small muted">직전 테스트 ${shortDate(prev.date)} ${prev.level}: 쓰기 ${prev.sections.W} · 듣기 ${prev.sections.L} · 말하기 ${prev.sections.S}</p>` : ""}
      ${e.summary ? `<p class="tip"><b>잘한 점</b> ${esc(e.summary.strength)}<br><b>연습할 점</b> ${esc(e.summary.weakness)}<br><b>이번 주 할 일</b> ${esc(e.summary.next)}</p>` : hasKey() && !past ? '<p class="small muted">Claude가 총평을 쓰고 있어요…</p>' : ""}
    </section>`;
  } else {
    top = `<section class="card"><div class="between"><h2>${title} 결과</h2><span class="lvbig" style="font-size:34px">${e.score}<span class="small muted">점</span></span></div>
      <p class="small muted">${e.level} · ${items.filter(i => i.res?.verdict === "ok").length} / ${items.length} 정답${!past ? ` · 승급 준비 +${items.reduce((a, it) => a + (it.res?.verdict === "ok" ? 10 : it.res?.verdict === "minor" ? 5 : 0), 0)}` : ""}</p></section>`;
  }
  return `
  ${past ? `<div class="topbar"><button class="iconbtn" data-act="view" data-v="history" aria-label="기록 목록">${ICON.back}</button><div class="stack" style="gap:0"><span class="label">${shortDate(e.date)} ${e.time || ""}</span><b>${title}</b></div></div>` : ""}
  ${top}
  <section class="card"><h2>문항별 결과</h2><div class="list">${items.map(it => feedback(it, false)).join("")}</div></section>
  <div class="row">
    ${past ? '<button class="btn ghost" data-act="retry">같은 문제 다시 풀기</button>' : `<button class="btn ghost" data-act="tab" data-v="home">홈으로</button>`}
    ${!past ? (isTest ? '<button class="btn" data-act="tab" data-v="practice">연습하러 가기</button>' : `<button class="btn" data-act="again">한 번 더</button>`) : ""}
  </div>
  ${!past ? '<p class="small muted">틀린 문장은 오답노트에 저장했어요. 결과는 레벨 탭의 지난 기록에서 다시 볼 수 있어요.</p>' : ""}`;
}

function noteItem(w, idx) {
  const it = w.item, open = ui.askOpen === idx, qa = w.qa || [];
  return `<div class="fb"><span class="v wrong">✕</span><div class="stack" style="gap:4px">
    <p class="small muted">${TYPE_NAME[it.t]} · ${it.level} · ${esc(it.prompt)}</p>
    <p class="mine">${esc(w.mine || "(무응답)")}</p><p class="fix">${fmt(w.fix)}</p>
    ${w.tip ? `<p class="tip">${fmt(w.tip)}</p>` : ""}
    <div class="row">
      <button class="chip" data-act="say" data-text="${esc(plain(w.fix))}">${ICON.sound} 듣기</button>
      <button class="chip" data-act="ask" data-i="${idx}" aria-expanded="${open}" style="${open ? "" : "border-color:var(--accent);color:var(--accent)"}">${open ? "질문 닫기" : qa.length ? `질문하기 (${qa.length})` : "질문하기"}</button>
      <button class="chip" data-act="delwrong" data-i="${idx}">외웠어요</button>
    </div>
    ${open ? `<div class="stack" style="gap:8px;padding:12px;border-radius:12px;background:var(--bg)">
      ${qa.map(m => `<div class="bubble me">${esc(m.q)}</div><div class="bubble ai">${m.a ? fmt(m.a) : "생각하는 중…"}</div>`).join("")}
      ${hasKey() ? `<div class="row">${["왜 틀렸어요?", "비슷한 예문 3개", "다르게 말하는 법", "비슷한 문제 내 주세요"].map(q => `<button class="chip" data-act="quick" data-q="${q}" ${ui.askBusy ? "disabled" : ""}>${q}</button>`).join("")}</div>
        <label class="small muted" for="askq">궁금한 점을 물어보세요</label>
        <textarea id="askq" rows="2" placeholder="예: the는 언제 붙여요?" ${ui.askBusy ? "disabled" : ""}></textarea>
        <button class="btn" data-act="asksend" ${ui.askBusy ? "disabled" : ""}>${ui.askBusy ? "답변 쓰는 중…" : "질문 보내기"}</button>`
        : '<p class="small muted">질문하려면 설정에서 Claude API 키를 넣어 주세요.</p>'}
    </div>` : ""}
  </div></div>`;
}

async function ask(q) {
  q = (q || "").trim();
  const w = state.wrong[ui.askOpen];
  if (!q || !w || ui.askBusy) return;
  w.qa = w.qa || [];
  const entry = { q, a: "" };
  w.qa.push(entry); ui.askBusy = true; render();
  try {
    entry.a = await (await ai()).askAbout(state.settings.key, { prompt: w.item.prompt, mine: w.mine, fix: plain(w.fix), tip: w.tip }, w.qa);
  } catch (e) { w.qa.pop(); toast(e.message); }
  ui.askBusy = false; save(); render();
}

// ---------- events ----------
document.addEventListener("input", e => { if (e.target.id === "answer") { ui.draft = e.target.value; const b = document.querySelector('[data-act="submit"]'); if (b) b.disabled = false; } });
document.addEventListener("keydown", e => {
  if (e.target.id === "answer" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitCurrent(e.target.value); }
});
document.addEventListener("change", async e => {
  if (e.target.id !== "importfile" || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (data?.v !== 1 || !Array.isArray(data.history)) throw new Error();
    const key = state.settings.key;
    state = { ...fresh(), ...data, settings: { ...fresh().settings, ...data.settings, key: data.settings?.key || key } };
    save(); toast("백업을 불러왔어요."); render();
  } catch (err) { toast("이 파일은 영어 레벨업 백업 파일이 아니에요."); }
});

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act, s = ui.session;
  switch (a) {
    case "tab": stopRec(); SP.stopSpeaking(); ui.view = b.dataset.v; ui.session = ui.view === "home" || ui.view === "practice" ? null : ui.session; ui.askOpen = null; ui.confirmReset = false; render(); scrollTo(0, 0); break;
    case "view": ui.view = b.dataset.v; render(); scrollTo(0, 0); break;
    case "mission": {
      const k = b.dataset.k;
      if (k === "W") startSession("write"); else if (k === "S") startSession("speak", { mode: Math.random() < .5 ? "R" : "Q" }); else startSession("review");
      break;
    }
    case "start": startSession(b.dataset.kind, { mode: b.dataset.mode }); break;
    case "again": startSession(s.kind, { mode: s.mode }); break;
    case "target": ui.testTarget = b.dataset.l; render(); break;
    case "source": ui.testSource = b.dataset.s; render(); break;
    case "start-test": {
      const lv = b.dataset.l;
      if (ui.testSource === "ai" && hasKey()) {
        b.disabled = true; b.textContent = "Claude가 문제를 만들고 있어요…";
        try {
          const avoid = state.history.filter(h => h.kind === "test" && h.items).flatMap(h => h.items.map(i => i.prompt));
          const g = await (await ai()).generateTest(state.settings.key, lv, TEST_PLAN, avoid);
          startSession("test", { level: lv, items: fromGenerated(lv, g), source: "ai" });
        } catch (err) { toast(`${err.message} 문제 은행으로 시작할게요.`); startSession("test", { level: lv }); }
      } else startSession("test", { level: lv });
      break;
    }
    case "submit": submitCurrent(s.items[s.i].t === "L" ? null : ($("#answer")?.value ?? ui.rec?.heard ?? ui.draft)); break;
    case "skip": submitCurrent(""); break;
    case "choose": submitCurrent(+b.dataset.k); break;
    case "self": { const it = s.items[s.i]; it.self = +b.dataset.v; ui.selfStep = false; s.pending.push(grade(it, s)); advance(); break; }
    case "mic": if (ui.rec?.active) ui.rec.stop(); else startRec(); break;
    case "play": { const it = s.items[s.i]; play(it.t === "L" ? it.say : it.t === "R" ? it.text : it.prompt); if (it.t !== "R") render(); break; }
    case "speed": ui.rate = +b.dataset.r; render(); break;
    case "toggletext": ui.showText = !ui.showText; render(); break;
    case "playsample": play(s.items[s.i].sample, 1); break;
    case "say": SP.speak(b.dataset.text, { accent: state.settings.accent, rate: state.settings.rate }); break;
    case "quit": ui.quitAsk = true; render(); break;
    case "quit-no": ui.quitAsk = false; render(); break;
    case "quit-yes": ui.quitAsk = false; stopRec(); SP.stopSpeaking(); ui.session = null; ui.view = "home"; render(); break;
    case "hfilter": ui.histFilter = b.dataset.f; render(); break;
    case "detail": ui.detail = state.history.find(h => h.id === b.dataset.id); ui.view = "detail"; render(); scrollTo(0, 0); break;
    case "retry": { const d = ui.detail; startSession(d.kind, { level: d.level, mode: d.mode, items: d.items.map(strip), source: d.source }); break; }
    case "ask": ui.askOpen = ui.askOpen === +b.dataset.i ? null : +b.dataset.i; render(); break;
    case "quick": ask(b.dataset.q); break;
    case "asksend": ask($("#askq")?.value); break;
    case "delwrong": state.wrong.splice(+b.dataset.i, 1); ui.askOpen = null; save(); render(); break;
    case "setlevel": state.level = b.dataset.l; state.xp = 0; state.levelNote = `${shortDate(day())} 직접 정한 레벨`; ui.testTarget = null; save(); render(); toast(`레벨을 ${state.level}(으)로 바꿨어요.`); break;
    case "savekey": {
      const k = $("#apikey").value.trim();
      state.settings.key = k; save();
      if (!k) { ui.keyStatus = ""; render(); break; }
      ui.keyStatus = "키를 확인하고 있어요…"; render();
      try { await (await ai()).checkKey(k); ui.keyStatus = "연결됐어요. 이제 Claude가 채점해요."; }
      catch (err) { ui.keyStatus = err.message; }
      render(); break;
    }
    case "clearkey": state.settings.key = ""; ui.keyStatus = "키를 지웠어요."; save(); render(); break;
    case "accent": state.settings.accent = b.dataset.a; save(); render(); break;
    case "rate": state.settings.rate = +b.dataset.r; ui.rate = state.settings.rate; save(); render(); break;
    case "testvoice": SP.speak("Hi! Let's practice English together every day.", { accent: state.settings.accent, rate: state.settings.rate }); break;
    case "export": {
      const { key, ...settings } = state.settings;
      const blob = new Blob([JSON.stringify({ ...state, settings }, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `english-levelup-${day()}.json`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("백업 파일을 저장했어요. (API 키는 빼고 저장해요)");
      break;
    }
    case "reset": ui.confirmReset = true; render(); break;
    case "reset-no": ui.confirmReset = false; render(); break;
    case "reset-yes": { const key = state.settings.key; state = fresh(); state.settings.key = key; ui.confirmReset = false; save(); toast("처음부터 다시 시작해요."); ui.view = "home"; render(); break; }
  }
});

ui.rate = state.settings.rate;
render();
