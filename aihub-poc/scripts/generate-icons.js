#!/usr/bin/env node
// Generate a 1024x1024 PNG icon for FCC AI Hub
// Uses Electron's built-in nativeImage to convert SVG to PNG

const fs = require('fs')
const path = require('path')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0052CC"/>
      <stop offset="1" stop-color="#2684FF"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="180" fill="url(#bg)"/>
  <text x="512" y="540" text-anchor="middle" dominant-baseline="middle" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-weight="700" font-size="420" fill="white">AI</text>
</svg>`

const outputDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outputDir, { recursive: true })

// Save SVG (electron-builder can use SVG on some platforms)
fs.writeFileSync(path.join(outputDir, 'icon.svg'), svg)
console.log('SVG icon saved to build/icon.svg')
console.log('Note: For production, use a design tool to export icon.png (1024x1024), icon.icns, and icon.ico')
console.log('electron-builder will auto-convert PNG to platform formats if icon.png is present')
