// 로컬 HTML 파일을 데스크톱/모바일 × 라이트/다크로 스크린샷 찍는다.
// 사용법: node shot.js <html 파일> [출력 폴더]
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const target = process.argv[2];
if (!target || !fs.existsSync(target)) {
  console.error('사용법: node shot.js <html 파일> [출력 폴더]');
  process.exit(1);
}
const outDir = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
fs.mkdirSync(outDir, { recursive: true });

const url = 'file://' + path.resolve(target);
const name = path.basename(target, path.extname(target));
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

(async () => {
  const browser = await chromium.launch();
  for (const [label, viewport] of Object.entries(viewports)) {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      const file = path.join(outDir, `${name}-${label}-${colorScheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file + (overflow ? '  ⚠ 가로 스크롤 발생' : ''));
      errors.forEach((m) => console.log('  JS 오류: ' + m));
      await page.close();
    }
  }
  await browser.close();
})();
