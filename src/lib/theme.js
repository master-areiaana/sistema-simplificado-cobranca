export const DARK = {
  p: "#E87722", bg: "#0f0f0f", surf: "#1a1a1a", surf2: "#222",
  bor: "#333", txt: "#f0f0f0", muted: "#888", head: "#111",
  inp: "#1a1a1a", th: "#141414", alt: "#161616", shad: "none",
  card: "#1a1a1a", drop: "#222"
};

export const LIGHT = {
  p: "#E87722", bg: "#f5f5f5", surf: "#fff", surf2: "#f8f8f8",
  bor: "#ddd", txt: "#1a1a1a", muted: "#777", head: "#fff",
  inp: "#fff", th: "#eeeeee", alt: "#f9f9f9",
  shad: "0 1px 4px rgba(0,0,0,.08)", card: "#fff", drop: "#fff"
};

export const loadL = (k, fb) => { try { return localStorage.getItem(k) || fb; } catch { return fb; } };
export const saveL = (k, v) => { try { localStorage.setItem(k, v); } catch {} };