// Claude calls through the artifact's sample capability (the viewer's own Claude account).
const AI = (() => {
  const COACH = "당신은 한국인 영어 학습자와 영어로 대화하며 가르치는 친절하고 정확한 영어 말하기 코치입니다. 설명은 한국어로, 초급자도 이해할 쉬운 말로 짧게 씁니다. 영어 표현을 고칠 때 바꾼 단어는 **굵게** 표시합니다.";

  function friendly(e) {
    const msg = e?.code === "rate_limited" ? "요청이 많아요. 잠시 뒤에 다시 해 주세요."
      : e?.code === "not_granted" ? "Claude 사용을 허락해야 대화할 수 있어요."
      : e?.code === "session_expired" ? "Claude 로그인이 끝났어요. 다시 로그인해 주세요."
      : e?.code === "refused" ? "Claude가 이 요청에 답하지 않았어요."
      : "Claude 답을 받지 못했어요. 다시 보내 주세요.";
    return Object.assign(new Error(msg), { code: e?.code || "api" });
  }
  async function askJSON(prompt, format, tier = "default") {
    if (!sampleCap) throw Object.assign(new Error("Claude에 로그인한 상태로 열어야 대화할 수 있어요."), { code: "no_key" });
    try {
      return await sampleCap.json(`${COACH}\n\n${prompt}\n\n다른 말 없이 JSON 하나만 출력하세요. 형식: ${format}`, { modelTier: tier });
    } catch (e) { throw friendly(e); }
  }
  const VERDICTS = ["ok", "minor", "wrong"];
  const str = v => typeof v === "string" ? v.trim() : "";
  const question = r => {
    const next = str(r?.next);
    if (!next) throw Object.assign(new Error("Claude가 다음 질문을 만들지 못했어요. 다시 보내 주세요."), { code: "bad_output" });
    return { next, ko: str(r?.ko), hint: str(r?.hint) };
  };

  return {
    async startChat(level, avoid) {
      const r = await askJSON(
`CEFR ${level} 학습자와 영어로 꼬리물기 대화를 시작합니다. 학습자의 일상, 경험, 일, 취미, 생각 가운데 하나를 골라 답하기 쉬운 열린 질문 하나로 시작하세요.
최근에 이야기한 주제는 피하세요: ${avoid.join(", ") || "(없음)"}
topic: 고른 주제를 한국어 2~5단어로. next: 첫 질문(영어, 레벨 ${level}에 맞는 어휘와 길이). ko: next의 한국어 뜻. hint: 레벨 ${level} 학습자가 할 만한 영어 답변 예시 1~2문장.`,
        `{"topic":"","next":"","ko":"","hint":""}`);
      return { topic: str(r?.topic) || "자유 대화", ...question(r) };
    },

    async chatTurn(level, topic, turns, answer) {
      const transcript = turns.slice(-10).map(t => `Coach: ${t.q}${t.a != null ? `\nLearner: ${t.a || "(모르겠다고 함)"}` : ""}`).join("\n");
      const r = await askJSON(
`CEFR ${level} 학습자와 '${topic}'에서 시작한 영어 꼬리물기 대화 중입니다. 지금까지 대화:
${transcript}
[학습자의 방금 답] ${answer || "(모르겠다고 함)"}

1) 방금 답을 채점하세요. 답은 음성 받아쓰기일 수 있으니 대소문자, 문장부호, 사소한 인식 오류는 무시합니다. 질문에 맞게 답했고 자연스러우면 ok, 뜻은 통하지만 문법이나 어휘 실수가 있으면 minor, 질문과 맞지 않거나 이해하기 어려우면 wrong, 답을 못 했으면 skip.
fix: 학습자 답을 같은 뜻으로 최소한만 고친 자연스러운 영어(ok면 그대로, skip이면 hint 같은 예시 답). tip: 무엇을 왜 고쳤는지 한국어 한 문장(ok면 빈 문자열).
2) reply: 답 내용에 대한 짧고 자연스러운 영어 반응 한 문장. 학습자가 답을 못 했으면 괜찮다고 짧게.
3) next: 학습자가 방금 말한 내용에서 꼬리를 물어 더 깊이 들어가는 영어 질문 하나(왜, 어떻게, 언제, 누구와, 그때 기분, 비교, 앞으로의 계획 등). 이미 물은 것은 다시 묻지 말고, 같은 방향으로 대여섯 번 이어졌으면 관련된 옆 이야기로 자연스럽게 넘어가세요. 학습자가 답을 못 했으면 더 쉬운 질문으로 바꾸세요. 레벨 ${level}에 맞는 어휘와 길이로.
ko: reply와 next의 한국어 뜻. hint: next에 대한 레벨 ${level} 영어 답변 예시 1~2문장.`,
        `{"verdict":"ok|minor|wrong|skip","fix":"","tip":"","reply":"","next":"","ko":"","hint":""}`);
      const verdict = !answer ? "skip" : VERDICTS.includes(r?.verdict) ? r.verdict : "minor";
      return { verdict, fix: str(r?.fix), tip: str(r?.tip), reply: str(r?.reply), ...question(r) };
    },

    async askAbout(item, history) {
      if (!sampleCap) throw new Error("Claude에 로그인한 상태로 열어 주세요.");
      const context = `${COACH}\n\n학습자가 틀린 문장에 대해 질문합니다.
[질문 또는 문제] ${item.prompt}
[학습자 답] ${item.mine || "(빈칸)"}
[고친 문장] ${item.fix || ""}
[처음 설명] ${item.tip || ""}
3~6문장으로 답하세요. 예문은 영어 뒤에 괄호로 한국어 뜻을 붙이세요. 문제를 내 달라고 하면 한국어 문장만 내고 정답은 다음 답변에서 알려 주세요.`;
      const messages = [];
      history.forEach((m, i) => {
        messages.push({ role: "user", content: (i === 0 ? context + "\n\n질문: " : "") + m.q });
        if (m.a) messages.push({ role: "assistant", content: m.a });
      });
      try { return (await sampleCap(messages, { cache: false })).text; }
      catch (e) { throw friendly(e); }
    },
  };
})();
