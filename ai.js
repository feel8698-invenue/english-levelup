// Claude calls, made straight from the phone with the user's own API key.
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm";

const MODEL = "claude-opus-5-5";
const COACH = "당신은 한국인 영어 학습자를 가르치는 친절하고 정확한 영어 말하기 코치입니다. 설명은 한국어로, 초급자도 이해할 쉬운 말로 짧게 씁니다. 영어 표현을 고칠 때 바꾼 단어는 **굵게** 표시합니다.";

let client = null, clientKey = null;
function getClient(key) {
  if (!key) throw Object.assign(new Error("API 키가 없어요. 설정에서 넣어 주세요."), { code: "no_key" });
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
    clientKey = key;
  }
  return client;
}

function friendly(err) {
  if (err?.code === "no_key") return err;
  const s = err?.status;
  const msg = s === 401 ? "API 키가 맞지 않아요. 설정에서 다시 확인해 주세요."
    : s === 429 ? "요청이 많아요. 잠시 뒤에 다시 해 주세요."
    : s === 402 || s === 400 && /credit/i.test(err?.message || "") ? "API 크레딧이 부족해요. Anthropic 콘솔에서 충전해 주세요."
    : s >= 500 ? "Claude 서버가 잠시 불안정해요. 다시 시도해 주세요."
    : !navigator.onLine ? "인터넷 연결을 확인해 주세요."
    : "Claude 채점에 실패했어요.";
  return Object.assign(new Error(msg), { code: "api", status: s });
}

// One request returning JSON that matches `schema`
async function askJSON(key, prompt, schema, { effort = "low", maxTokens = 4000 } = {}) {
  try {
    const res = await getClient(key).beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: COACH,
      output_config: { effort, format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") throw Object.assign(new Error("Claude가 이 요청에 답하지 않았어요."), { code: "refusal" });
    const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
    return JSON.parse(text);
  } catch (e) {
    if (e.code === "refusal") throw e;
    throw friendly(e);
  }
}

const obj = (props, req = Object.keys(props)) => ({ type: "object", properties: props, required: req, additionalProperties: false });
const str = { type: "string" };
const VERDICT = { type: "string", enum: ["ok", "minor", "wrong"] };

export async function checkKey(key) {
  await askJSON(key, "Reply with ok=true.", obj({ ok: { type: "boolean" } }), { maxTokens: 200 });
  return true;
}

// Writing: Korean prompt → learner's English
export async function gradeWriting(key, level, item, answer) {
  return askJSON(key,
`레벨 ${level} 학습자의 순간영작을 채점하세요.
[한국어] ${item.ko}
[모범답안] ${item.answers.join(" / ")}
[학습자] ${answer || "(빈칸)"}
기준: 뜻이 통하고 원어민이 실제로 쓰는 자연스러운 문장이면 ok (모범답안과 달라도, 대소문자·문장부호 누락·wanna 같은 구어체도 ok). 뜻은 통하지만 문법 실수가 있으면 minor. 뜻이 달라지거나 성립하지 않거나 빈칸이면 wrong.
fix: 학습자 문장을 최소로 고친 자연스러운 문장(ok면 다듬은 그대로). tip: 한국어 한두 문장.`,
    obj({ verdict: VERDICT, fix: str, tip: str }));
}

// Speaking answer to a question or opinion prompt, from speech recognition text
export async function gradeSpeaking(key, level, item, transcript, kind) {
  return askJSON(key,
`레벨 ${level} 학습자의 말하기 답변을 평가하세요. 답변은 음성 인식으로 받아 적은 글이라 문장부호와 대소문자, 사소한 인식 오류는 감점하지 마세요.
[과제 유형] ${kind === "O" ? "의견 말하기 (이유를 들어 3~5문장)" : "질문에 답하기 (1~3문장)"}
[질문] ${item.prompt}
[학습자 답변] ${transcript || "(무응답)"}
점수 기준(0~100): 과제 수행(질문에 맞게 답했나) 40, 문법 정확성 30, 어휘와 표현의 수준 20, 길이와 연결성 10. 레벨 ${level}에 기대되는 수준이면 70점 이상.
verdict: 75점 이상 ok, 50~74 minor, 50 미만 wrong.
fix: 학습자 답변을 같은 뜻으로 자연스럽게 고친 영어. better: 레벨 ${level}에 맞는 더 좋은 답변 예시(영어). tip: 한국어 한두 문장.`,
    obj({ score: { type: "integer" }, verdict: VERDICT, fix: str, better: str, tip: str }), { effort: "medium" });
}

export async function summarizeTest(key, level, sections, wrongs) {
  return askJSON(key,
`레벨 ${level} 승급 테스트 결과를 보고 학습자에게 짧은 피드백을 주세요.
영역 점수: 쓰기 ${sections.W}, 듣기 ${sections.L}, 말하기 ${sections.S} (합격선 70)
틀리거나 약했던 문항:
${wrongs.join("\n") || "(없음)"}
strength, weakness, next: 각각 한국어 한 문장. next는 다음 일주일 동안 할 구체적인 연습.`,
    obj({ strength: str, weakness: str, next: str }));
}

// Fresh test generated for variety; same shape as the bank
export async function generateTest(key, level, plan, avoid) {
  const item = (props) => ({ type: "array", items: obj(props) });
  const schema = obj({
    W: item({ ko: str, answers: { type: "array", items: str } }),
    L: item({ say: str, q: str, options: { type: "array", items: str }, answer: { type: "integer" } }),
    R: item({ text: str }),
    Q: item({ prompt: str, hint: str, sample: str }),
    O: item({ prompt: str, hint: str, sample: str }),
  });
  return askJSON(key,
`CEFR ${level} 수준의 영어 말하기 승급 테스트 문항을 새로 만드세요. 실제 공인 말하기 시험(토익스피킹, OPIc, 캠브리지)의 과제 유형과 CEFR ${level} 기술문(can-do)에 맞추고, 너무 쉽거나 어렵지 않게 그 레벨의 대표 문법과 어휘를 쓰세요. 주제는 일상, 일, 여행, 사회 등에서 고르게.
W ${plan.W}개: 한국어 문장(ko)과 자연스러운 영어 정답 1~3개(answers).
L ${plan.L}개: 원어민이 말할 영어 1~2문장(say), 내용 이해를 묻는 한국어 질문(q), 한국어 보기 3개(options), 정답 번호 0~2(answer). 정답 위치를 섞으세요.
R ${plan.R}개: 소리 내어 읽을 영어 문장(text).
Q ${plan.Q}개: 짧게 답할 영어 질문(prompt), 한국어 안내(hint), 레벨에 맞는 모범 답변(sample).
O ${plan.O}개: 이유를 들어 의견을 말할 영어 질문(prompt), 한국어 안내(hint), 모범 답변(sample).
최근에 나온 문장과 겹치지 않게: ${avoid.slice(0, 30).join(" | ")}`,
    schema, { effort: "medium", maxTokens: 8000 });
}

// Free-form follow-up question about one wrong answer
export async function askAbout(key, item, history) {
  const context = `학습자가 틀린 문장에 대해 질문합니다.
[문제] ${item.prompt}
[학습자 답] ${item.mine || "(빈칸)"}
[고친 문장] ${item.fix || ""}
[처음 설명] ${item.tip || ""}
3~6문장으로 답하세요. 예문은 영어 뒤에 괄호로 한국어 뜻을 붙이세요. 문제를 내 달라고 하면 한국어 문장만 내고 정답은 다음 답변에서 알려 주세요.`;
  const messages = [];
  history.forEach((m, i) => {
    messages.push({ role: "user", content: (i === 0 ? context + "\n\n질문: " : "") + m.q });
    if (m.a) messages.push({ role: "assistant", content: m.a });
  });
  try {
    const res = await getClient(key).beta.messages.create({
      model: MODEL, max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: COACH, output_config: { effort: "low" }, messages,
    });
    if (res.stop_reason === "refusal") throw Object.assign(new Error("Claude가 이 질문에 답하지 않았어요."), { code: "refusal" });
    return res.content.filter(b => b.type === "text").map(b => b.text).join("");
  } catch (e) {
    if (e.code === "refusal") throw e;
    throw friendly(e);
  }
}
