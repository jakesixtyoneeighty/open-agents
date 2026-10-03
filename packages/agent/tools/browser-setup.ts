export const SETUP_TIMEOUT_MS = 5 * 60_000;
const BROWSER_DIR = "$HOME/.open-agents/browser";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
} as const;

// Chromium runtime libraries for dnf-based images (Amazon Linux). apt-based
// images use `playwright install-deps` instead.
const DNF_CHROMIUM_DEPS = [
  "nss",
  "nspr",
  "atk",
  "at-spi2-atk",
  "cups-libs",
  "libdrm",
  "libxkbcommon",
  "libXcomposite",
  "libXdamage",
  "libXfixes",
  "libXrandr",
  "libXext",
  "libX11",
  "libxcb",
  "mesa-libgbm",
  "pango",
  "cairo",
  "alsa-lib",
].join(" ");

/**
 * Idempotent setup: installs Playwright and a headless Chromium into a
 * directory outside the repo, so the project's dependencies are untouched.
 */
export const SETUP_SCRIPT = `set -e
DIR="${BROWSER_DIR}"
if [ -f "$DIR/.ready-1.62.1" ]; then exit 0; fi
mkdir -p "$DIR"
cd "$DIR"
[ -f package.json ] || npm init -y >/dev/null
npm install --no-audit --no-fund --loglevel=error playwright@1.62.1 >/dev/null
if command -v apt-get >/dev/null 2>&1; then
  sudo env "PATH=$PATH" npx playwright install-deps chromium >/dev/null 2>&1 || true
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ${DNF_CHROMIUM_DEPS} >/dev/null 2>&1 || true
fi
npx playwright install --only-shell chromium >/dev/null
touch "$DIR/.ready-1.62.1"`;
