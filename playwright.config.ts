import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './tests',
  // Reporters: console list, JUnit XML, HTML, and JSON to a fixed path
  reporter: [
    ['list'],
    ['junit', { outputFile: 'artifacts/junit.xml' }],
    ['html', { outputFolder: 'artifacts/html' }],
    // ✅ Ensure a deterministic JSON report path for the updater script
    ['json', { outputFile: 'artifacts/report.json' }]
  ],
  use: {
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADLESS !== 'false',
    video: process.env.VIDEO === 'on' ? 'on' : 'off',
    trace: process.env.TRACE === 'on' ? 'on' : 'off',
    screenshot: 'only-on-failure' // Step 6.1
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Per-test artifacts (screenshots, traces, videos)
  outputDir: 'artifacts/test-output',
});
