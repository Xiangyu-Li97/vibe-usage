// Terminal output helpers: colors, status markers, OSC 8 clickable links.
// Falls back to plain text when NO_COLOR is set or stdout is not a TTY.

const NO_COLOR = !!process.env.NO_COLOR || !process.stdout.isTTY;

const CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function wrap(code, text) {
  if (NO_COLOR) return String(text);
  return `${code}${text}${CODES.reset}`;
}

export const bold = (t) => wrap(CODES.bold, t);
export const dim = (t) => wrap(CODES.dim, t);
export const red = (t) => wrap(CODES.red, t);
export const green = (t) => wrap(CODES.green, t);
export const yellow = (t) => wrap(CODES.yellow, t);
export const cyan = (t) => wrap(CODES.cyan, t);
export const gray = (t) => wrap(CODES.gray, t);

/** OSC 8 hyperlink — supported by modern terminals (iTerm2, Kitty, Warp, VSCode, macOS Terminal 14+). */
export function link(url, text = url) {
  if (NO_COLOR) return url === text ? url : `${text} (${url})`;
  return `\x1b]8;;${url}\x1b\\${CODES.cyan}${CODES.underline}${text}${CODES.reset}\x1b]8;;\x1b\\`;
}

export const success = (msg) => `${green('✓')} ${msg}`;
export const failure = (msg) => `${red('✗')} ${msg}`;
export const warn = (msg) => `${yellow('!')} ${msg}`;
export const arrow = (msg) => `${cyan('→')} ${msg}`;

export const divider = () => dim('─'.repeat(48));

/**
 * One dim advisory line pointing at the simpler way to do what the user just
 * did. Printed only when a human is watching: the Mac and Windows apps drive
 * `sync` through a pipe and read stdout as the result / error text, so an
 * extra line must never reach them. VIBE_USAGE_FORCE_HINTS=1 is for tests.
 */
export function hint(msg) {
  if (!process.stdout.isTTY && process.env.VIBE_USAGE_FORCE_HINTS !== '1') return;
  console.log(dim(`提示: ${msg}`));
}

/**
 * One redrawn status line for a phase that would otherwise leave the terminal
 * blank for minutes: the settings round-trip (a timing-out endpoint re-trying),
 * the local log scan, and a cold Codex index build. Without it the sync header
 * is the last thing on screen, and "still working" is indistinguishable from
 * "hung" — exactly how a slow first sync reads.
 *
 * TTY-only for the same reason as hint(): the Mac (`SyncEngine.swift`) and
 * Windows (`sync_engine.rs`) apps run `sync` through a pipe and treat stdout as
 * the result text, so a pipe must never receive these lines.
 * `VIBE_USAGE_FORCE_PROGRESS=1` forces them on for tests, and
 * `VIBE_USAGE_PROGRESS_INTERVAL_MS` overrides the redraw interval.
 *
 * `label` is a function so the caller owns the wording and its elapsed-time
 * text; it is re-read on every redraw. The interval is unref'ed so a phase that
 * never reaches `stop()` cannot hold the process open.
 */
export function liveStatus({ enabled = true, intervalMs } = {}) {
  const configuredInterval = Number(process.env.VIBE_USAGE_PROGRESS_INTERVAL_MS);
  const tickMs = intervalMs ?? (configuredInterval > 0 ? configuredInterval : 5000);
  const active = enabled
    && (!!process.stdout.isTTY || process.env.VIBE_USAGE_FORCE_PROGRESS === '1');
  let label = null;
  let timer = null;
  let startedAt = 0;

  function draw() {
    if (label === null) return;
    process.stdout.write(`\r${dim(`  ${label(Date.now() - startedAt)}`)}\x1b[K`);
  }

  return {
    /** Show the line, or retarget it to the next phase. */
    start(nextLabel) {
      if (!active) return;
      label = nextLabel;
      startedAt = Date.now();
      draw();
      if (timer === null) {
        timer = setInterval(draw, tickMs);
        unrefTimer(timer);
      }
    },
    /** Erase the line before regular output continues on it. */
    stop() {
      if (!active || label === null) return;
      clearInterval(timer);
      timer = null;
      label = null;
      process.stdout.write('\r\x1b[K');
    },
  };
}

/** Bun's timer objects and Node's both expose unref; tests run on either. */
function unrefTimer(timer) {
  if (typeof timer?.unref === 'function') timer.unref();
}

/** Print a blank line. */
export const nl = () => console.log();

const LOGO_LINES = [
  '██╗   ██╗██╗██████╗ ███████╗    ██╗   ██╗███████╗ █████╗  ██████╗ ███████╗',
  '██║   ██║██║██╔══██╗██╔════╝    ██║   ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝',
  '██║   ██║██║██████╔╝█████╗      ██║   ██║███████╗███████║██║  ███╗█████╗  ',
  '╚██╗ ██╔╝██║██╔══██╗██╔══╝      ██║   ██║╚════██║██╔══██║██║   ██║██╔══╝  ',
  ' ╚████╔╝ ██║██████╔╝███████╗    ╚██████╔╝███████║██║  ██║╚██████╔╝███████╗',
  '  ╚═══╝  ╚═╝╚═════╝ ╚══════╝     ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
];

/** Big ASCII logo — used once at the top of `init` / first-run. */
export function bigHeader() {
  const logo = NO_COLOR
    ? LOGO_LINES.join('\n')
    : LOGO_LINES.map(l => `${CODES.cyan}${l}${CODES.reset}`).join('\n');
  return `\n${logo}\n${dim('  Vibe Usage · by VibeCafé')}\n`;
}

/** Compact one-line header — used for `sync`, `daemon`, `reset`, `skill`. */
export function smallHeader() {
  return `${bold('Vibe Usage')} ${dim('· by VibeCafé')}`;
}
