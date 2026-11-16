export const browserSupport = {
  reviewedOn: '2026-11-16',
  reviewCadence: 'quarterly',
  nextReviewBy: '2027-02-16',
  qualification: 'pending-exact-browser-validation',
  electron: {
    version: '44.1.0',
    chromium: '152.0.7977.65',
    source: 'https://releases.electronjs.org/release/v44.1.0',
  },
  browsers: {
    chrome: {
      webCompilerFloor: 156,
      inventory: { stableMajors: [156, 157], candidateBuilds: ['156.0.8078.47', '157.0.8103.78'] },
      source: 'https://chromereleases.googleblog.com/',
    },
    edge: {
      webCompilerFloor: 156,
      inventory: { stableMajors: [156, 157], candidateBuilds: ['156.0.4314.42', '157.0.4341.60'] },
      source: 'https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-stable-channel',
    },
    firefox: {
      webCompilerFloor: 115,
      inventory: { stable: ['159.0.1', '160.0'], esr: '153.7.0', legacyOSesr: '115.45.0' },
      source: 'https://product-details.mozilla.org/1.0/firefox_versions.json',
    },
    safari: {
      webCompilerFloor: '26.6',
      inventory: { sonomaAndSequoia: '26.6.1', tahoe: '26.6.2', current: '27.2' },
      source: 'https://support.apple.com/en-us/100100',
    },
    ios: {
      // Keep the preceding WebKit compatibility bucket for the 26.7 OS line.
      webCompilerFloor: '26.6',
      inventory: { maintainedOS: '26.7.3', currentOS: '27.2.1' },
      source: 'https://support.apple.com/en-us/100100',
    },
  },
} as const;

const { chrome, edge, firefox, safari, ios } = browserSupport.browsers;
const electronChromiumMajor = Number(browserSupport.electron.chromium.split('.')[0]);

export const browserTargets = {
  // Electron loads the same built SPA as the web host.
  chrome: Math.min(chrome.webCompilerFloor, electronChromiumMajor),
  edge: edge.webCompilerFloor,
  firefox: firefox.webCompilerFloor,
  safari: safari.webCompilerFloor,
  ios: ios.webCompilerFloor,
};

export const esbuildTargets = [
  ...Object.entries(browserTargets).map(([browser, version]) => `${browser}${version}`),
  // Keep Umi's existing minifier baseline alongside the browser targets.
  'es2015',
];
