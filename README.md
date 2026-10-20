# 영어 레벨업

혼자 쓰는 영어 말하기 연습 웹앱입니다. 휴대폰 홈 화면에 추가해서 앱처럼 씁니다.

- **오늘의 미션**: 쓰기(순간영작) 5문장, 듣고 말하기 5문장, 오답 복습 3문장
- **연습**: 순간영작, 따라 말하기(발음 인식), 듣고 대답하기
- **레벨 테스트**: 15문항(쓰기 5, 듣기 5, 말하기 5). 세 영역 모두 70점 이상이면 합격해서 레벨이 오릅니다. A1~C1 중 원하는 레벨을 언제든 볼 수 있습니다.
- **오답노트**: 틀린 문장 모음, 문장마다 Claude에게 질문하기
- **설정**: 레벨 직접 정하기, Claude API 키, 미국/영국 발음, 백업

문제는 CEFR 기준과 공인 말하기 시험(토익스피킹, OPIc, 캠브리지)의 문제 유형을 따랐습니다. 연습용 판정이며 공식 성적은 아닙니다.

## 데이터

학습 기록과 API 키는 휴대폰 브라우저에만 저장됩니다. 서버가 없고, 채점할 때만 Anthropic API로 직접 요청합니다.

## 파일

| 파일 | 내용 |
|---|---|
| `index.html`, `styles.css`, `app.js` | 화면과 동작 |
| `bank.js` | 레벨별 문제 은행 |
| `speech.js` | 영어 음성 재생과 음성 인식 |
| `ai.js` | Claude 채점, 문제 생성, 질문 답변 |
| `sw.js`, `manifest.webmanifest`, `icons/` | 홈 화면 설치와 오프라인 사용 |

빌드 과정이 없는 정적 파일이라 GitHub Pages에 그대로 올리면 됩니다.

## 아티팩트 버전 (API 키 없이 Claude 채점)

`artifact/english-levelup.html`은 Claude 아티팩트로 여는 버전입니다. 로그인한 Claude 계정으로 채점하므로 API 키와 추가 요금이 없고, 기록은 Claude 계정에 저장됩니다. Claude 앱이나 claude.ai 안에서만 동작하며, GitHub Pages에서 열면 Claude 채점 없이 동작합니다.

- 앱 버전과의 차이: 앱 안 마이크를 쓸 수 없어 말하기는 키보드 받아쓰기로 입력합니다.
- 다시 만들기: 저장소 루트에서 `python3 artifact/build.py . artifact artifact/english-levelup.html`
  (`bank.js`, `speech.js`는 앱과 같이 쓰고, `artifact/app.js`, `artifact/ai-sample.js`는 아티팩트용입니다.)
