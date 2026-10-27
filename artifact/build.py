# Assembles the single-file artifact page from the app sources plus the artifact-only pieces.
import re, sys
repo, here, out = sys.argv[1], sys.argv[2], sys.argv[3]
speech = open(f"{repo}/speech.js").read().replace("export function", "function")
# the artifact frame refuses the microphone, so answers come from keyboard dictation
speech = speech.replace("export function canListen() { return !!Recognition; }", "")
speech = speech.replace("function canListen() { return !!Recognition; }", "function canListen() { return false; }")
speech = "const SP = (() => {\n" + speech + "\nreturn { canSpeak, speak, stopSpeaking, canListen, listen, compareReading };\n})();\n"
ai = open(f"{here}/ai-sample.js").read()
app = open(f"{here}/app.js").read()
css = open(f"{repo}/styles.css").read()
# theme: follow the viewer's explicit choice as well as the system setting
m = re.search(r"@media \(prefers-color-scheme: dark\)\{:root\{(.*?)\}\}", css, re.S)
dark = m.group(1)
css = css.replace(m.group(0), "@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){" + dark + "}}\n:root[data-theme=\"dark\"]{" + dark + "}")
# the artifact skeleton already pads the top safe area
css = css.replace("\n  padding-top:env(safe-area-inset-top,0px)}", "}")
html = f"""<title>영어 레벨업</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Do+Hyeon&family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
{css}
</style>
<main id="app" aria-live="polite"><p class="boot">불러오는 중…</p></main>
<nav id="tabs" class="tabs" aria-label="메뉴"></nav>
<div id="toast" class="toast" role="status" hidden></div>
<script type="module">
{speech}
{ai}
{app}
</script>
"""
open(out, "w").write(html)
print(len(html))
