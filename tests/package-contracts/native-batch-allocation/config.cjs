module.exports = Object.freeze({
  timeout: 120000,
  actionTimeout: 20000,
  navigationTimeout: 45000,
  expectTimeout: 45000,
  retries: 0,
  repeatEach: 1,
  workers: 1,
  browsers: Object.freeze(['chromium', 'firefox', 'webkit']),
  controls: Object.freeze(['valid', 'missing-share', 'total-99', 'cancel']),
});
