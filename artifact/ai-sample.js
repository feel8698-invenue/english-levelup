// Claude calls through the artifact's sample capability (the viewer's own Claude account).
const AI = (() => {
  const COACH = "당신은 한국인 영어 학습자를 가르치는 친절하고 정확한 영어 말하기 코치입니다. 설명은 한국어로, 초급자도 이해할 쉬운 말로 짧게 씁니다. 영어 표현을 고칠 때 바꾼 단어는 **굵게** 표시합니다.";

  function friendly(e) {
    const msg = e?.code === "rate_limited" ? "요청이 많아요. 잠시 뒤에 다시 해 주세요."
      : e?.code === "not_granted" ? "Claude 사용을 허락해야 채점할 수 있어요."
      : e?.code === "session_expired" ? "Claude 로그인이 끝났어요. 다시 로그인해 주세요."
      : e?.code === "refused" ? "Claude가 이 요청에 답하지 않았어요."
      : "Claude 채점에 실패했어요.";
    return Object.assign(new Error(msg), { code: e?.code || "api" });
  }
  async function askJSON(prompt, format, tier = "default") {
    if (!sampleCap) throw Object.assign(new Error("Claude에 로그인한 상태로 열어야 채점할 수 있어요."), { code: "no_key" });
    try {
      return await sampleCap.json(`${COACH}\n\n${prompt}\n\n다른 말 없이 JSON 하나만 출력하세요. 형식: ${format}`, { modelTier: tier });
    } catch (e) { throw friendly(e); }
  }
  const VERDICTS = ["ok", "minor", "wrong"];
  const str = v => typeof v === "string" ? v : "";
  const verdict = v => VERDICTS.includes(v) ? v : "wrong";

  return {
    async gradeWriting(_, level, item, answer) {
      const r = await askJSON(
`레벨 ${level} 학습자의 순간영작을 채점하세요.
[한국어] ${item.ko}
[모범답안] ${item.answers.join(" / ")}
[학습자] ${answer || "(빈칸)"}
기준: 뜻이 통하고 원어민이 실제로 쓰는 자연스러운 문장이면 ok (모범답안과 달라도, 대소문자·문장부호 누락·wanna 같은 구어체도 ok). 뜻은 통하지만 문법 실수가 있으면 minor. 뜻이 달라지거나 성립하지 않거나 빈칸이면 wrong.
fix: 학습자 문장을 최소로 고친 자연스러운 문장(ok면 다듬은 그대로). tip: 한국어 한두 문장.`,
        `{"verdict":"ok|minor|wrong","fix":"...","tip":"..."}`);
      return { verdict: verdict(r?.verdict), fix: str(r?.fix) || item.answers[0], tip: str(r?.tip) };
    },

    async gradeSpeaking(_, level, item, transcript, kind) {
      const r = await askJSON(
`레벨 ${level} 학습자의 말하기 답변을 평가하세요. 답변은 음성 받아쓰기로 입력한 글이라 문장부호와 대소문자, 사소한 인식 오류는 감점하지 마세요.
[과제 유형] ${kind === "O" ? "의견 말하기 (이유를 들어 3~5문장)" : "질문에 답하기 (1~3문장)"}
[질문] ${item.prompt}
[학습자 답변] ${transcript || "(무응답)"}
점수 기준(0~100): 과제 수행(질문에 맞게 답했나) 40, 문법 정확성 30, 어휘와 표현의 수준 20, 길이와 연결성 10. 레벨 ${level}에 기대되는 수준이면 70점 이상.
verdict: 75점 이상 ok, 50~74 minor, 50 미만 wrong.
fix: 학습자 답변을 같은 뜻으로 자연스럽게 고친 영어. better: 레벨 ${level}에 맞는 더 좋은 답변 예시(영어). tip: 한국어 한두 문장.`,
        `{"score":0,"verdict":"ok|minor|wrong","fix":"...","better":"...","tip":"..."}`);
      const score = Math.max(0, Math.min(100, Math.round(Number(r?.score) || 0)));
      return { score, verdict: verdict(r?.verdict), fix: str(r?.fix), better: str(r?.better) || item.sample, tip: str(r?.tip) };
    },

    async summarizeTest(_, level, sections, wrongs) {
      const r = await askJSON(
`레벨 ${level} 승급 테스트 결과를 보고 학습자에게 짧은 피드백을 주세요.
영역 점수: 쓰기 ${sections.W}, 듣기 ${sections.L}, 말하기 ${sections.S} (합격선 70)
틀리거나 약했던 문항:
${wrongs.join("\n") || "(없음)"}
strength, weakness, next: 각각 한국어 한 문장. next는 다음 일주일 동안 할 구체적인 연습.`,
        `{"strength":"...","weakness":"...","next":"..."}`, "quick");
      return { strength: str(r?.strength), weakness: str(r?.weakness), next: str(r?.next) };
    },

    async generateTest(_, level, plan, avoid) {
      const g = await askJSON(
`CEFR ${level} 수준의 영어 말하기 승급 테스트 문항을 새로 만드세요. 실제 공인 말하기 시험(토익스피킹, OPIc, 캠브리지)의 과제 유형과 CEFR ${level} 기술문(can-do)에 맞추고, 그 레벨의 대표 문법과 어휘를 쓰세요. 주제는 일상, 일, 여행, 사회 등에서 고르게.
W ${plan.W}개: 한국어 문장(ko)과 자연스러운 영어 정답 1~3개(answers).
L ${plan.L}개: 원어민이 말할 영어 1~2문장(say), 내용 이해를 묻는 한국어 질문(q), 한국어 보기 3개(options), 정답 번호 0~2(answer). 정답 위치를 섞으세요.
R ${plan.R}개: 소리 내어 읽을 영어 문장(text).
Q ${plan.Q}개: 짧게 답할 영어 질문(prompt), 한국어 안내(hint), 레벨에 맞는 모범 답변(sample).
O ${plan.O}개: 이유를 들어 의견을 말할 영어 질문(prompt), 한국어 안내(hint), 모범 답변(sample).
최근에 나온 문장과 겹치지 않게: ${avoid.slice(0, 30).join(" | ")}`,
        `{"W":[{"ko":"","answers":[""]}],"L":[{"say":"","q":"","options":["","",""],"answer":0}],"R":[{"text":""}],"Q":[{"prompt":"","hint":"","sample":""}],"O":[{"prompt":"","hint":"","sample":""}]}`);
      const ok = g && ["W", "L", "R", "Q", "O"].every(k => Array.isArray(g[k]) && g[k].length >= plan[k])
        && g.L.every(x => Array.isArray(x.options) && x.options.length >= 3)
        && g.W.every(x => Array.isArray(x.answers) && x.answers.length);
      if (!ok) throw Object.assign(new Error("새 문제를 만들지 못했어요."), { code: "bad_output" });
      for (const k of Object.keys(plan)) g[k] = g[k].slice(0, plan[k]);
      return g;
    },

    async askAbout(_, item, history) {
      if (!sampleCap) throw new Error("Claude에 로그인한 상태로 열어 주세요.");
      const context = `${COACH}\n\n학습자가 틀린 문장에 대해 질문합니다.
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
      try { return (await sampleCap(messages, { cache: false })).text; }
      catch (e) { throw friendly(e); }
    },
  };
})();
