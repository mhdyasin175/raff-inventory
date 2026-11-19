import { defineConfig, devices } from '@playwright/test';
import { CAMERA_VIDEO } from './e2e/support/camera';

/**
 * End-to-end tests run against the demo build (the whole app in the browser, no API needed),
 * so they are fast and deterministic. Set PW_CHROME_PATH to use an installed Chrome instead
 * of Playwright's bundled browser.
 */
export default defineConfig({
  testDir: './e2e',
  // Draws a barcode into a video file that Chrome plays as its camera (see e2e/barcode.spec.ts).
  globalSetup: './e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {}),
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${CAMERA_VIDEO}`,
      ],
    },
    permissions: ['camera'],
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build:demo && npx vite preview --mode demo --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
