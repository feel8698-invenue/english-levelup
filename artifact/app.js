// Artifact build: a follow-up ("꼬리물기") English conversation coach. Claude runs on the viewer's own
// Claude account through the sample capability; records live in the viewer's private db subtree.

const LEVELS = [
  { id: "A1", ko: "입문", can: "자기소개와 아주 간단한 질문·대답" },
  { id: "A2", ko: "초급 상", can: "일상 주제를 짧은 문장으로 대화" },
  { id: "B1", ko: "중급", can: "경험·계획·의견을 이어서 말하기" },
  { id: "B2", ko: "중상급", can: "원어민과 자연스럽게, 이유를 들어 의견 설명" },
  { id: "C1", ko: "고급", can: "업무·학업에서 유창하고 정확하게" },
];
const LV = LEVELS.map(l => l.id);
const TYPE_NAME = { C: "대화", W: "쓰기", L: "듣기", R: "따라 말하기", Q: "듣고 대답하기", O: "의견 말하기" };
const DAILY_GOAL = 15; // answers per day

// ---------- state ----------
const STORE = "elu.v1";
const fresh = () => ({
  v: 1, level: "A2", levelNote: "대화 연습에서 추정한 시작 레벨",
  settings: { accent: "US", rate: 1 },
  streak: { last: "", count: 0 }, days: {}, chat: null, history: [], wrong: [],
});
let state = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.v === 1) return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } }; } catch (e) {}
  return fresh();
}

// Saved in the viewer's Claude account (private per person): one profile doc (with the conversation in
// progress), one doc per finished conversation and per wrong-notebook item. Browser storage keeps a copy.
let profileRef = null, histCol = null, wrongCol = null, syncedHist = new Set(), syncedWrong = new Set(), saveTimer = null;
const docId = s => String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 150);
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  if (!profileRef) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(syncAll, 400);
}
async function syncAll() {
  try {
    // seen, xp and sections belonged to the old practice and test screens
    const { history, wrong, seen, xp, sections, ...profile } = state;
    await profileRef.set(profile);
    const histIds = new Set(history.map(h => docId(h.id)));
    for (const h of history) { const id = docId(h.id); if (!syncedHist.has(id) || h.dirty) { delete h.dirty; await histCol.doc(id).set(h); syncedHist.add(id); } }
    for (const id of [...syncedHist]) if (!histIds.has(id)) { await histCol.doc(id).delete(); syncedHist.delete(id); }
    const wrongIds = new Set(wrong.map(w => docId(w.item.id)));
    for (const w of wrong) { const id = docId(w.item.id); if (!syncedWrong.has(id) || w.dirty) { delete w.dirty; await wrongCol.doc(id).set(w); syncedWrong.add(id); } }
    for (const id of [...syncedWrong]) if (!wrongIds.has(id)) { await wrongCol.doc(id).delete(); syncedWrong.delete(id); }
  } catch (e) { toast("기록을 계정에 저장하지 못했어요. 이 브라우저에는 남아 있어요."); }
}
async function connect() {
  if (!window.claude) return;
  const [db, user, s] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("sample")]);
  sampleCap = s;
  if (db && user) {
    try {
      const id = await user.id();
      if (id) {
        const base = db.collection("data/users/" + id);
        profileRef = base.doc("elu");
        histCol = profileRef.collection("history");
        wrongCol = profileRef.collection("wrong");
        const [p, hs, ws] = await Promise.all([profileRef.get(), histCol.get(), wrongCol.get()]);
        if (p.exists) {
          // snapshots arrive frozen; the app edits state in place, so work on copies
          const copy = d => structuredClone(d.data());
          const history = hs.docs.map(copy).sort((a, b) => a.id < b.id ? -1 : 1);
          const wrong = ws.docs.map(copy).sort((a, b) => (a.date || "") < (b.date || "") ? -1 : 1);
          hs.docs.forEach(d => syncedHist.add(d.id)); ws.docs.forEach(d => syncedWrong.add(d.id));
          const prof = copy(p);
          state = { ...fresh(), ...prof, settings: { ...fresh().settings, ...prof.settings }, history, wrong };
          try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
        } else await syncAll(); // first open in this account: carry over what this browser has
      }
    } catch (e) { toast("계정 기록을 불러오지 못했어요. 이 브라우저 기록으로 보여 줘요."); }
  }
  if (!ui.busy) render();
}

// ---------- ui state (not saved) ----------
const ui = { view: "home", draft: "", busy: false, ko: new Set(), vopen: new Set(), hint: false, summary: null,
  askOpen: null, askBusy: false, detail: null, confirmReset: false };

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>").replace(/\n/g, "<br>");
const plain = s => String(s || "").replace(/\*\*/g, "");
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortDate = iso => { const [, m, d] = iso.split("-"); return `${+m}/${+d}`; };
const lvInfo = id => LEVELS.find(l => l.id === id) || LEVELS[0];
let sampleCap = null;
const hasKey = () => !!sampleCap;
// iOS dictation follows the keyboard language, so a Korean keyboard turns spoken English into Hangul
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3200); }
let speechWarned = false;
async function say(text) {
  const r = await SP.speak(plain(text), { accent: state.settings.accent, rate: state.settings.rate });
  if (r !== "ended" && !speechWarned) {
    speechWarned = true;
    toast(SP.canSpeak() ? "음성이 재생되지 않았어요. 듣기 버튼을 눌러 보고, 그래도 안 나오면 무음 모드와 음량을 확인해 주세요." : "이 화면에서는 영어 음성을 재생할 수 없어요.");
  }
}
const answered = chat => chat.turns.filter(t => t.a != null);

const ICON = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  sound: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  flame: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--speak)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 .8 1.2 1.6 1.6 2.4 1.6C11.4 7.5 11 5.5 12 3z"/></svg>',
  chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  list: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  book: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v16l-7-4-7 4z"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

// ---------- conversation ----------
async function startChat() {
  if (ui.busy) return;
  if (state.chat) endChat(false);
  ui.busy = true; ui.view = "chat"; ui.ko = new Set(); ui.hint = false; ui.draft = ""; render();
  try {
    const avoid = state.history.filter(h => h.kind === "chat").slice(-8).map(h => h.topic);
    const r = await AI.startChat(state.level, avoid);
    state.chat = { id: String(Date.now()), level: state.level, topic: r.topic, turns: [{ q: r.next, ko: r.ko, hint: r.hint, words: r.words }] };
    save();
    ui.busy = false; render(); say(r.next);
  } catch (e) { ui.busy = false; ui.view = "home"; render(); toast(e.message); }
}

async function sendAnswer(text) {
  const chat = state.chat;
  if (!chat || ui.busy) return;
  text = String(text ?? "").trim();
  if (HANGUL.test(text)) { toast("한글이 섞여 있어요. English 키보드로 바꿔서 다시 말해 주세요."); return; }
  const turn = chat.turns[chat.turns.length - 1];
  turn.a = text; ui.draft = ""; ui.hint = false; ui.busy = true; render();
  try {
    const r = await AI.chatTurn(chat.level, chat.topic, chat.turns, text);
    Object.assign(turn, { verdict: r.verdict, fix: r.fix, tip: r.tip, mywords: r.mywords });
    chat.turns.push({ reply: r.reply, q: r.next, ko: r.ko, hint: r.hint, words: r.words });
    record(chat, turn);
    ui.busy = false; save(); render(); say(`${r.reply} ${r.next}`);
  } catch (e) {
    delete turn.a; ui.draft = text; ui.busy = false; render(); toast(e.message);
  }
}

// Daily count, streak and the wrong notebook update per answer, so nothing is lost if the chat is never ended
function record(chat, turn) {
  const today = day(), y = new Date(); y.setDate(y.getDate() - 1);
  const d = state.days[today] || (state.days[today] = {});
  d.C = (d.C || 0) + 1;
  if (state.streak.last !== today) { state.streak.count = state.streak.last === day(y) ? state.streak.count + 1 : 1; state.streak.last = today; }
  if (turn.verdict === "minor" || turn.verdict === "wrong") {
    const i = chat.turns.indexOf(turn);
    state.wrong.push({ item: { id: `c:${chat.id}:${i}`, t: "C", level: chat.level, prompt: turn.q }, mine: turn.a, fix: turn.fix, tip: turn.tip, date: today, qa: [] });
    state.wrong = state.wrong.slice(-150);
  }
}

function endChat(show = true) {
  const chat = state.chat;
  if (!chat) return;
  const turns = answered(chat), d = new Date();
  state.chat = null;
  if (turns.length) {
    const entry = { id: chat.id, date: day(d), time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`, kind: "chat",
      level: chat.level, topic: chat.topic, turns: turns.map(({ q, ko, reply, a, verdict, fix, tip, words, mywords }) => ({ q, ko, reply, a, verdict, fix, tip, words, mywords })) };
    state.history.push(entry);
    state.history = state.history.slice(-200);
    if (show) ui.summary = entry;
  }
  save();
  if (show) { ui.view = turns.length ? "summary" : "home"; render(); scrollTo(0, 0); }
}

// ---------- views ----------
function render() {
  const v = ui.view, app = $("#app");
  const inChat = v === "chat";
  $("#tabs").hidden = inChat;
  $("#tabs").innerHTML = [["home", "대화", ICON.chat], ["history", "기록", ICON.list], ["notes", "오답노트", ICON.book], ["settings", "설정", ICON.gear]]
    .map(([k, n, ic]) => `<button data-act="tab" data-v="${k}" ${tabOf(v) === k ? 'aria-current="page"' : ""}>${ic}${n}</button>`).join("");
  app.innerHTML = (VIEWS[v] || VIEWS.home)();
  const ta = $("#answer"); if (ta) ta.value = ui.draft;
  if (inChat) scrollTo(0, document.body.scrollHeight);
}
const tabOf = v => ({ home: "home", chat: "home", summary: "home", history: "history", detail: "history", notes: "notes", settings: "settings" }[v] || "home");

const VIEWS = {
  home() {
    const lv = lvInfo(state.level), today = state.days[day()]?.C || 0, chat = state.chat;
    const d = new Date(), wd = "일월화수목금토"[d.getDay()];
    const streak = state.streak.count && state.streak.last >= day(new Date(Date.now() - 864e5)) ? state.streak.count : 0;
    const pct = Math.min(100, Math.round(today / DAILY_GOAL * 100));
    return `
    <div class="between">
      <div><span class="small muted">${d.getMonth() + 1}월 ${d.getDate()}일 ${wd}요일</span><h1>꼬리물기 영어</h1></div>
      <span class="chip-streak">${ICON.flame}${streak}일 연속</span>
    </div>
    <section class="hero" aria-label="오늘의 대화">
      <div class="between" style="align-items:flex-end">
        <div><span class="label">내 레벨</span><div class="row" style="align-items:baseline;gap:10px"><span class="lvbig">${lv.id}</span><b>${lv.ko}</b></div></div>
        <div style="text-align:right"><span class="label">오늘 대답</span><div class="lvbig" style="font-size:28px;color:var(--hero-accent)">${today}</div></div>
      </div>
      <div class="stack" style="gap:6px">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="between small" style="color:var(--hero-muted)"><span>하루 목표 ${DAILY_GOAL}개</span><span>${today >= DAILY_GOAL ? "오늘 목표 달성" : `${DAILY_GOAL - today}개 남았어요`}</span></div>
      </div>
    </section>
    ${chat ? `<section class="card lift">
        <span class="label">이어서 하기</span>
        <h2>${esc(chat.topic)}</h2>
        <p class="small muted">${chat.level} · 대답 ${answered(chat).length}개 · 마지막 질문: <span class="en">${esc(chat.turns[chat.turns.length - 1].q)}</span></p>
        <button class="btn wide speak" data-act="resume">대화 이어 하기</button>
        <button class="btn ghost wide" data-act="new" ${hasKey() ? "" : "disabled"}>새 주제로 시작</button>
      </section>`
      : `<section class="card lift">
        <h2>Claude가 묻고, 내가 답하고, 또 묻고</h2>
        <p class="small muted">Claude가 질문 하나로 시작해서 내 대답에서 꼬리를 물고 계속 질문해요. 대답할 때마다 틀린 표현을 짧게 고쳐 주고, 고친 문장은 오답노트에 모여요.</p>
        <button class="btn wide speak" data-act="new" ${hasKey() && !ui.busy ? "" : "disabled"}>${ui.busy ? "첫 질문을 만들고 있어요…" : "대화 시작"}</button>
      </section>`}
    ${!hasKey() ? `<div class="note">대화하려면 Claude에 로그인한 상태로 열고 <b>Claude 사용을 허락</b>해 주세요.</div>` : ""}
    <div class="warn">말할 때는 키보드를 <b>English</b>로 바꾸고 키보드의 마이크 버튼(받아쓰기)을 누르세요. 한글 키보드에서는 영어도 한글로 받아 적어요.</div>`;
  },

  chat() {
    const chat = state.chat;
    if (!chat) return `<section class="card lift"><h2>첫 질문을 만들고 있어요…</h2><p class="muted">Claude가 오늘 이야기할 주제를 고르고 있어요.</p></section>`;
    const last = chat.turns.length - 1;
    return `
    <div class="topbar">
      <button class="iconbtn" data-act="tab" data-v="home" aria-label="나가기 (대화는 저장돼요)">${ICON.back}</button>
      <div class="stack" style="gap:0;flex:1;min-width:0"><span class="label">${chat.level} · 대답 ${answered(chat).length}개</span><b>${esc(chat.topic)}</b></div>
      <button class="chip" data-act="end" ${ui.busy ? "disabled" : ""}>끝내기</button>
    </div>
    <section class="chat">${chat.turns.map((t, i) => turnView(t, `c${i}`, i === last)).join("")}
      ${ui.busy ? `<div class="bubble ai coach muted">생각하는 중…</div>` : ""}</section>
    ${ui.busy ? "" : `<section class="card" style="gap:10px">
      ${ui.hint && chat.turns[last].hint ? `<div class="note"><span class="label">이렇게 답해 볼 수 있어요</span><br><span class="en">${fmt(chat.turns[last].hint)}</span>
        <button class="chip" data-act="say" data-text="${esc(plain(chat.turns[last].hint))}" style="margin-top:6px">${ICON.sound} 듣기</button></div>` : ""}
      <label class="small muted" for="answer">영어로 대답하기 (English 키보드의 마이크로 말해도 돼요)</label>
      <textarea id="answer" lang="en" rows="3" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="Type or dictate your answer"></textarea>
      <p id="kowarn" class="warn" ${HANGUL.test(ui.draft) ? "" : "hidden"}>키보드가 한글이면 영어 발음도 한글로 받아 적어요. 지구본 버튼으로 <b>English 키보드</b>로 바꾼 뒤 마이크를 눌러 주세요.</p>
      <div class="row">
        <button class="btn ghost" data-act="hint" aria-pressed="${ui.hint}">${ui.hint ? "힌트 닫기" : "힌트"}</button>
        <button class="btn ghost" data-act="pass">모르겠어요</button>
        <button class="btn speak" data-act="send" style="flex-grow:2">보내기</button>
      </div>
    </section>`}`;
  },

  summary() {
    const e = ui.summary;
    if (!e) return VIEWS.home();
    const ok = e.turns.filter(t => t.verdict === "ok").length, fixed = e.turns.filter(t => t.verdict === "minor" || t.verdict === "wrong");
    return `
    <section class="banner">
      <span class="small">${esc(e.topic)} · ${e.level}</span>
      <div class="row" style="gap:12px;align-items:baseline"><span class="lvbig" style="font-size:48px">${e.turns.length}</span><b>번 대답했어요</b></div>
      <span class="small">자연스러운 대답 ${ok}개 · 고친 문장 ${fixed.length}개 (오답노트에 저장했어요)</span>
    </section>
    ${fixed.length ? `<section class="card"><h2>고친 문장</h2><div class="list">${fixed.map(corrView).join("")}</div></section>` : ""}
    <div class="row"><button class="btn ghost" data-act="tab" data-v="home">홈으로</button><button class="btn speak" data-act="new" ${hasKey() ? "" : "disabled"}>새 대화</button></div>`;
  },

  history() {
    const list = state.history.filter(h => h.kind === "chat").reverse();
    return `
    <h1>지난 대화</h1>
    <div class="stack">${list.length ? list.map(h => {
      const n = h.turns.filter(t => t.verdict === "minor" || t.verdict === "wrong").length;
      return `<button class="hrow" data-act="detail" data-id="${h.id}"><span><span class="small muted">${shortDate(h.date)} ${h.time || ""} · ${h.level}</span><br>${esc(h.topic)}</span><span class="small muted" style="text-align:right">대답 ${h.turns.length}<br>고침 ${n}</span></button>`;
    }).join("") : '<p class="muted">아직 끝낸 대화가 없어요. 대화를 끝내면 여기에 모여요.</p>'}</div>`;
  },

  detail() {
    const h = ui.detail;
    if (!h) return VIEWS.history();
    return `
    <div class="topbar"><button class="iconbtn" data-act="tab" data-v="history" aria-label="지난 대화 목록">${ICON.back}</button>
      <div class="stack" style="gap:0"><span class="label">${shortDate(h.date)} ${h.time || ""} · ${h.level}</span><b>${esc(h.topic)}</b></div></div>
    <section class="chat">${h.turns.map((t, i) => turnView(t, `d${i}`, false)).join("")}</section>`;
  },

  notes() {
    const w = state.wrong.slice().reverse();
    return `
    <h1>오답노트</h1>
    ${w.length ? `<section class="card"><div class="list">${w.map((x, ri) => noteItem(x, state.wrong.length - 1 - ri)).join("")}</div></section>`
      : '<p class="muted">고친 문장이 없어요. 대화에서 고친 문장이 여기에 모여요.</p>'}`;
  },

  settings() {
    const k = state.settings;
    return `
    <h1>설정</h1>
    <section class="card">
      <h2>내 레벨</h2>
      <div class="row">${LV.map(l => `<button class="chip" data-act="setlevel" data-l="${l}" aria-pressed="${l === state.level}">${l} ${lvInfo(l).ko}</button>`).join("")}</div>
      <p class="small muted">${state.level}: ${lvInfo(state.level).can}. Claude가 이 레벨에 맞는 어휘와 길이로 질문해요. 다음 대화부터 적용돼요.</p>
    </section>
    <section class="card">
      <h2>Claude</h2>
      <p class="small">${hasKey() ? "연결됨. 지금 로그인한 Claude 계정으로 대화해요. 추가 요금은 없고 구독 사용량에 포함돼요." : "Claude에 로그인한 상태로 열어야 대화할 수 있어요."}</p>
      <p class="small muted">${profileRef ? "기록은 내 Claude 계정에 저장돼서 폰과 PC에서 같이 볼 수 있어요." : "로그인하지 않아 기록이 이 브라우저에만 남아요."}</p>
    </section>
    <section class="card">
      <h2>듣기</h2>
      <div class="row"><span class="small" style="width:56px">발음</span><button class="chip" data-act="accent" data-a="US" aria-pressed="${k.accent === "US"}">미국</button><button class="chip" data-act="accent" data-a="GB" aria-pressed="${k.accent === "GB"}">영국</button></div>
      <div class="row"><span class="small" style="width:56px">속도</span>${[[0.75, "느리게"], [1, "보통"]].map(([r, n]) => `<button class="chip" data-act="rate" data-r="${r}" aria-pressed="${k.rate === r}">${n}</button>`).join("")}</div>
      <button class="btn ghost" data-act="say" data-text="Hi! Tell me about your day.">${ICON.sound} 목소리 들어 보기</button>
      <p class="small muted">대답은 키보드를 English로 바꾸고 마이크 버튼(받아쓰기)을 누른 뒤 영어로 말해서 입력해요.</p>
    </section>
    <section class="card">
      <h2>기록</h2>
      ${ui.confirmReset ? `<div class="warn">대화 기록, 오답노트, 레벨이 모두 지워져요. 되돌릴 수 없어요.<div class="row" style="margin-top:8px"><button class="btn" style="background:var(--bad);color:#fff" data-act="reset-yes">모두 지우기</button><button class="btn ghost" data-act="reset-no">취소</button></div></div>`
        : '<button class="chip" data-act="reset" style="align-self:flex-start">처음부터 다시 시작</button>'}
    </section>`;
  },
};

// One exchange: Claude's reaction + question, then my answer and its correction
function turnView(t, key, live) {
  const open = ui.ko.has(key);
  const coach = `${t.reply ? `${hl(t.reply, t.words)} ` : ""}<b>${hl(t.q, t.words)}</b>`;
  return `
  <div class="bubble ai coach en">${coach}
    <div class="row" style="margin-top:6px;gap:6px">
      <button class="chip" data-act="say" data-text="${esc(`${t.reply || ""} ${t.q}`.trim())}">${ICON.sound} 듣기</button>
      ${t.ko ? `<button class="chip" data-act="ko" data-k="${key}" aria-pressed="${open}">뜻</button>` : ""}
    </div>
    ${open ? `<p class="small" style="font-family:var(--f-body);margin-top:6px">${esc(t.ko)}</p>` : ""}
    ${vocabView(t.words, `${key}w`)}
  </div>
  ${t.a != null ? `<div class="bubble me en">${hl(t.a || "(모르겠어요)", t.mywords)}</div>${t.verdict ? corrView(t) : ""}${t.mywords?.length ? `<div class="corr">${vocabView(t.mywords, `${key}m`)}</div>` : ""}` : ""}`;
}

// Underline the annotated idioms and words inside a sentence (longest first, case-insensitive)
function hl(text, words) {
  const list = (words || []).map(w => w.en).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return esc(text);
  const re = new RegExp(list.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  let out = "", at = 0;
  for (const m of String(text).matchAll(re)) { out += esc(text.slice(at, m.index)) + `<span class="term">${esc(m[0])}</span>`; at = m.index + m[0].length; }
  return out + esc(text.slice(at));
}
// Collapsed by default; ui.vopen remembers which ones are open across re-renders
function vocabView(words, key) {
  if (!words?.length) return "";
  return `<details class="vocab" data-k="${key}" ${ui.vopen.has(key) ? "open" : ""}><summary><span class="label">단어 · 숙어 ${words.length}개</span></summary>${words.map(w => `
    <div class="vrow"><button class="term" data-act="say" data-text="${esc(w.en)}">${esc(w.en)}</button>
      <span class="vko">${esc(w.ko)}${w.note ? `<span class="muted"> · ${esc(w.note)}</span>` : ""}</span></div>`).join("")}</details>`;
}
function corrView(t) {
  if (t.verdict === "ok") return `<p class="corr ok small">○ 자연스러워요</p>`;
  const icon = { minor: "△", wrong: "✕", skip: "?" }[t.verdict] || "△";
  return `<div class="corr fb"><span class="v ${t.verdict === "skip" ? "wait" : t.verdict}">${icon}</span><div class="stack" style="gap:4px">
    ${t.verdict === "skip" ? '<span class="label">이렇게 답할 수 있어요</span>' : ""}
    <p class="fix">${fmt(t.fix)}</p>
    ${t.tip ? `<p class="tip">${fmt(t.tip)}</p>` : ""}
    <div class="row"><button class="chip" data-act="say" data-text="${esc(plain(t.fix))}">${ICON.sound} 듣기</button></div>
  </div></div>`;
}

function noteItem(w, idx) {
  const it = w.item, open = ui.askOpen === idx, qa = w.qa || [];
  return `<div class="fb"><span class="v wrong">✕</span><div class="stack" style="gap:4px">
    <p class="small muted">${TYPE_NAME[it.t] || ""} · ${it.level} · ${esc(it.prompt)}</p>
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
        : '<p class="small muted">질문하려면 Claude에 로그인한 상태로 열어 주세요.</p>'}
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
    entry.a = await AI.askAbout({ prompt: w.item.prompt, mine: w.mine, fix: plain(w.fix), tip: w.tip }, w.qa);
    w.dirty = true;
  } catch (e) { w.qa.pop(); toast(e.message); }
  ui.askBusy = false; save(); render();
}

// ---------- events ----------
document.addEventListener("input", e => {
  if (e.target.id === "answer") { ui.draft = e.target.value; const w = $("#kowarn"); if (w) w.hidden = !HANGUL.test(ui.draft); }
});
document.addEventListener("toggle", e => {
  const d = e.target;
  if (d.classList?.contains("vocab")) d.open ? ui.vopen.add(d.dataset.k) : ui.vopen.delete(d.dataset.k);
}, true);
document.addEventListener("keydown", e => {
  if (e.target.id === "answer" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); SP.unlock(); sendAnswer(e.target.value); }
});
document.addEventListener("click", e => {
  SP.unlock();
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  switch (b.dataset.act) {
    case "tab": SP.stopSpeaking(); ui.view = b.dataset.v; ui.askOpen = null; ui.confirmReset = false; render(); scrollTo(0, 0); break;
    case "new": startChat(); break;
    case "resume": ui.view = "chat"; render(); break;
    case "send": { const t = ($("#answer")?.value ?? ui.draft).trim(); if (t) sendAnswer(t); else toast("대답을 입력해 주세요. 모르겠으면 '모르겠어요'를 눌러요."); break; }
    case "pass": sendAnswer(""); break;
    case "hint": ui.hint = !ui.hint; render(); break;
    case "end": endChat(); break;
    case "ko": { const k = b.dataset.k; ui.ko.has(k) ? ui.ko.delete(k) : ui.ko.add(k); const y = scrollY; render(); scrollTo(0, y); break; }
    case "say": say(b.dataset.text); break;
    case "detail": ui.detail = state.history.find(h => h.id === b.dataset.id); ui.ko = new Set(); ui.view = "detail"; render(); scrollTo(0, 0); break;
    case "ask": ui.askOpen = ui.askOpen === +b.dataset.i ? null : +b.dataset.i; render(); break;
    case "quick": ask(b.dataset.q); break;
    case "asksend": ask($("#askq")?.value); break;
    case "delwrong": state.wrong.splice(+b.dataset.i, 1); ui.askOpen = null; save(); render(); break;
    case "setlevel": state.level = b.dataset.l; state.levelNote = `${shortDate(day())} 직접 정한 레벨`; save(); render(); toast(`레벨을 ${state.level}(으)로 바꿨어요.`); break;
    case "accent": state.settings.accent = b.dataset.a; save(); render(); break;
    case "rate": state.settings.rate = +b.dataset.r; save(); render(); break;
    case "reset": ui.confirmReset = true; render(); break;
    case "reset-no": ui.confirmReset = false; render(); break;
    case "reset-yes": { state = fresh(); ui.confirmReset = false; save(); toast("처음부터 다시 시작해요."); ui.view = "home"; render(); break; }
  }
});

render();
connect();
