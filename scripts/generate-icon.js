// Generate an SVG icon and convert to PNG via sharp (or save as SVG)
// Design: Anti-pattern symbol - broken infinity loop with warning indicator

const fs = require("fs");
const path = require("path");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="10%" stop-color="#2d1b4e"/>
      <stop offset="100%" stop-color="#1a0f30"/>
    </radialGradient>
    <linearGradient id="loop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff832b"/>
      <stop offset="100%" stop-color="#c62239"/>
    </linearGradient>
  </defs>
  <!-- Background circle -->
  <circle cx="32" cy="32" r="30" fill="url(#bg)"/>
  <!-- Outer ring -->
  <circle cx="32" cy="32" r="28" fill="none" stroke="#c62239" stroke-width="2" opacity="0.8"/>
  <!-- Anti-pattern infinity loop (broken) -->
  <path d="M 20 32 C 20 24, 30 24, 30 32 C 30 40, 20 40, 20 32" fill="none" stroke="url(#loop-grad)" stroke-width="3" stroke-linecap="round"/>
  <path d="M 34 32 C 34 24, 44 24, 44 32 C 44 40, 34 40, 34 32" fill="none" stroke="url(#loop-grad)" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 3"/>
  <!-- Break/warning X mark -->
  <line x1="27" y1="16" x2="37" y2="22" stroke="#c62239" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="37" y1="16" x2="27" y2="22" stroke="#c62239" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Arrow indicators (cycle direction) -->
  <polygon points="14,29 19,27 17,32" fill="#ff832b" opacity="0.8"/>
  <polygon points="50,35 45,37 47,32" fill="#ff832b" opacity="0.8"/>
  <!-- Warning dots -->
  <circle cx="32" cy="7" r="1.5" fill="#a56eff" opacity="0.6"/>
  <circle cx="52" cy="20" r="1.5" fill="#a56eff" opacity="0.6"/>
  <circle cx="56" cy="38" r="1.5" fill="#a56eff" opacity="0.6"/>
  <circle cx="48" cy="52" r="1.5" fill="#a56eff" opacity="0.6"/>
  <circle cx="16" cy="52" r="1.5" fill="#a56eff" opacity="0.6"/>
  <circle cx="8" cy="38" r="1.5" fill="#a56eff" opacity="0.6"/>
  <circle cx="12" cy="20" r="1.5" fill="#a56eff" opacity="0.6"/>
  <!-- N+1 text hint -->
  <text x="32" y="50" text-anchor="middle" font-size="7" font-weight="bold" fill="#ff832b" opacity="0.7" font-family="monospace">N+1</text>
</svg>`;

const outDir = path.join(__dirname, "..", "assets");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Save as SVG first
fs.writeFileSync(path.join(outDir, "icon.svg"), svg);
console.log("SVG icon saved: assets/icon.svg");

// Try to convert to PNG using sharp if available
try {
  const sharp = require("sharp");
  sharp(Buffer.from(svg))
    .resize(64, 64)
    .png()
    .toFile(path.join(outDir, "icon.png"))
    .then(() => console.log("PNG icon generated: assets/icon.png"))
    .catch(() => {
      console.log("sharp failed, using SVG as fallback");
      copyAsFallback();
    });
} catch {
  console.log("sharp not available, trying alternative...");
  copyAsFallback();
}

function copyAsFallback() {
  // Create a minimal 1x1 transparent PNG as placeholder, then we'll use the real one from user-journey
  // Actually just copy from user-journey-app and we'll replace later
  const srcIcon = path.join(__dirname, "..", "..", "user-journey-app", "assets", "icon.png");
  if (fs.existsSync(srcIcon)) {
    fs.copyFileSync(srcIcon, path.join(outDir, "icon.png"));
    console.log("Copied fallback icon from user-journey-app");
  } else {
    // Create minimal PNG placeholder (1x1 pixel)
    const minPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    fs.writeFileSync(path.join(outDir, "icon.png"), minPng);
    console.log("Created minimal placeholder PNG");
  }
}
