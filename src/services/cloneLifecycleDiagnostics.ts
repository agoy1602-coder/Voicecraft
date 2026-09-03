export type CloneLifecycleDiagnostic = { label: string; ms: number };

const KEY = 'voicecraft_clone_lifecycle_diagnostics';
const PANEL_ID = 'voicecraft-clone-lifecycle-diagnostic';
let liveStart: number | null = null;
let liveTimer: number | null = null;

function render(extra?: string) {
  if (typeof document === 'undefined' || !document.body) return;
  const entries = cloneLifecycleDiagnostics.read();
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:520px;margin:0 auto;padding:12px;border:1px solid rgba(245,158,11,.45);border-radius:12px;background:rgba(15,23,42,.97);color:#f8fafc;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 20px 50px rgba(0,0,0,.35);backdrop-filter:blur(8px)';
    document.body.appendChild(panel);
  }
  const rows = entries.slice(-12).map((e) => `<div style="display:flex;justify-content:space-between;gap:12px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.label}</span><b>${e.ms}ms</b></div>`).join('');
  const live = liveStart !== null ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #334155;color:#fbbf24;font-weight:700">LIVE CREATE CLONE: ${Math.round(performance.now() - liveStart)}ms</div>` : '';
  panel.innerHTML = `<div style="font-weight:700;color:#fbbf24;margin-bottom:7px">VoiceCraft Clone Lifecycle Diagnostic</div>${rows || '<div style="color:#94a3b8">Waiting for Create Clone...</div>'}${live}${extra ? `<div style="margin-top:6px;color:#f87171">${extra}</div>` : ''}<div style="margin-top:7px;color:#94a3b8;font-size:11px">Diagnostic only — clone behavior unchanged.</div>`;
}

function startLiveWatch() {
  if (liveStart !== null) return;
  liveStart = performance.now();
  cloneLifecycleDiagnostics.record('CREATE CLONE CLICK', 0);
  const watch = () => {
    const button = document.getElementById('create-clone-btn');
    if (!button || !document.body.contains(button)) {
      if (liveTimer !== null) window.clearInterval(liveTimer);
      liveTimer = null;
      if (liveStart !== null) cloneLifecycleDiagnostics.record('CREATE CLONE BUTTON REMOVED', performance.now() - liveStart);
      liveStart = null;
      return;
    }
    const text = (button.textContent || '').trim();
    if (!text.includes('Creating Clone')) {
      if (liveTimer !== null) window.clearInterval(liveTimer);
      liveTimer = null;
      if (liveStart !== null) cloneLifecycleDiagnostics.record('CREATE CLONE HANDLER RETURNED', performance.now() - liveStart);
      liveStart = null;
      render();
      return;
    }
    render();
  };
  liveTimer = window.setInterval(watch, 250);
  watch();
}

function installClickProbe() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target?.closest?.('#create-clone-btn')) startLiveWatch();
  }, true);
  render();
}

export const cloneLifecycleDiagnostics = {
  record(label: string, ms: number) {
    try {
      const current = JSON.parse(localStorage.getItem(KEY) || '[]') as CloneLifecycleDiagnostic[];
      current.push({ label, ms: Math.round(ms) });
      localStorage.setItem(KEY, JSON.stringify(current.slice(-30)));
    } catch {}
    render();
  },
  read(): CloneLifecycleDiagnostic[] {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]') as CloneLifecycleDiagnostic[]; } catch { return []; }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch {}
    if (liveTimer !== null && typeof window !== 'undefined') window.clearInterval(liveTimer);
    liveTimer = null; liveStart = null;
    if (typeof document !== 'undefined') document.getElementById(PANEL_ID)?.remove();
  },
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installClickProbe, { once: true });
  else installClickProbe();
}
