// English speech synthesis for listening.

const synth = window.speechSynthesis;

function pickVoice(accent) {
  const voices = synth ? synth.getVoices() : [];
  const lang = accent === "GB" ? "en-GB" : "en-US";
  const same = voices.filter(v => v.lang?.replace("_", "-").startsWith(lang));
  const preferred = ["Samantha", "Google US English", "Daniel", "Google UK English Female", "Karen", "Serena"];
  return same.find(v => preferred.some(p => v.name.includes(p))) || same[0]
    || voices.find(v => v.lang?.startsWith("en")) || null;
}

export function canSpeak() { return !!synth; }

// iOS only lets a page start speech from a tap. Speaking a silent utterance inside the first tap
// unlocks it, so questions that arrive later (after Claude answers) can be read aloud.
let unlocked = false;
export function unlock() {
  if (!synth || unlocked) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth.speak(u);
}

// Resolves "ended", "error" or "silent" (nothing started within a few seconds: speech is blocked here)
let current = null;
export function speak(text, { accent = "US", rate = 1 } = {}) {
  return new Promise(resolve => {
    if (!synth) return resolve("silent");
    const busy = synth.speaking || synth.pending;
    if (busy) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(accent);
    if (v) u.voice = v;
    u.lang = v?.lang || (accent === "GB" ? "en-GB" : "en-US");
    u.rate = rate;
    let started = false;
    const timer = setTimeout(() => { if (!started) resolve("silent"); }, 4000);
    u.onstart = () => { started = true; };
    u.onend = () => { clearTimeout(timer); resolve("ended"); };
    u.onerror = e => { clearTimeout(timer); resolve(e.error === "interrupted" || e.error === "canceled" ? "ended" : "error"); };
    current = u; // keep a reference so the utterance isn't collected before it ends
    // speaking right after cancel() is silently dropped by some engines
    const go = () => { synth.resume(); synth.speak(u); };
    busy ? setTimeout(go, 120) : go();
  });
}

export function stopSpeaking() { synth?.cancel(); }

// Some browsers load voices late
if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => {};
