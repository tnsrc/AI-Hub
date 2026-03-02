// after-pack.js — no-op for unsigned builds
// When code signing is configured, add ad-hoc signing here
exports.default = async function (context) {
  // Skip signing for now (identity: null in electron-builder.yml)
  console.log(`[after-pack] Platform: ${context.electronPlatformName}, arch: ${context.arch}`)
}
