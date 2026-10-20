// Listening (speech synthesis) and speaking (speech recognition) helpers.

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

export function speak(text, { accent = "US", rate = 1 } = {}) {
  return new Promise(resolve => {
    if (!synth) return resolve(false);
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(accent);
    if (v) u.voice = v;
    u.lang = v?.lang || (accent === "GB" ? "en-GB" : "en-US");
    u.rate = rate;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    synth.speak(u);
  });
}

export function stopSpeaking() { synth?.cancel(); }

// Some browsers load voices late
if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => {};

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export function canListen() { return !!Recognition; }

// Start listening; onUpdate gets the running transcript. Returns a stop() function.
// done({text, confidence}) fires once when recognition ends.
export function listen({ accent = "US", onUpdate, done }) {
  if (!Recognition) { done({ text: "", confidence: 0, error: "unsupported" }); return () => {}; }
  const rec = new Recognition();
  rec.lang = accent === "GB" ? "en-GB" : "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;
  let finalText = "", confSum = 0, confN = 0, finished = false, error = null;
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        finalText += (finalText ? " " : "") + r[0].transcript.trim();
        if (r[0].confidence > 0) { confSum += r[0].confidence; confN++; }
      } else interim += r[0].transcript;
    }
    onUpdate?.((finalText + " " + interim).trim());
  };
  rec.onerror = e => { error = e.error; };
  rec.onend = () => {
    if (finished) return;
    finished = true;
    done({ text: finalText.trim(), confidence: confN ? confSum / confN : 0, error });
  };
  try { rec.start(); } catch (e) { finished = true; done({ text: "", confidence: 0, error: "start_failed" }); }
  return () => { try { rec.stop(); } catch (e) {} };
}

// Word-level comparison for read-aloud: which target words were heard
const words = s => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
export function compareReading(target, heard) {
  const t = words(target), h = words(heard);
  // longest common subsequence keeps word order
  const dp = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--)
    for (let j = h.length - 1; j >= 0; j--)
      dp[i][j] = t[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Array(t.length).fill(false);
  for (let i = 0, j = 0; i < t.length && j < h.length;) {
    if (t[i] === h[j]) { hit[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const score = t.length ? Math.round(hit.filter(Boolean).length / t.length * 100) : 0;
  // map back onto the original tokens so punctuation and case stay readable
  let k = 0;
  const display = target.split(/\s+/).map(tok => {
    const n = words(tok).length, ok = hit.slice(k, k + n).every(Boolean);
    k += n;
    return { tok, ok };
  });
  return { score, display, missed: t.filter((w, i) => !hit[i]) };
}
