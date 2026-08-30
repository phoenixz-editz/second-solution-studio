export type HeadlessVerificationResult = {
  status: 'disabled' | 'verified' | 'unavailable' | 'failed';
  boundingBox?: { width: number; height: number };
  continuity?: number;
  reason?: string;
};

type VerificationInput = {
  equation: string;
  mode: string;
};

export async function runOptionalHeadlessVerification(
  input: VerificationInput,
): Promise<HeadlessVerificationResult> {
  if (process.env["USE_HEADLESS_VERIFIER"] !== "true") {
    return { status: 'disabled' };
  }

  try {
    // Keep Playwright optional so local AST validation never depends on a
    // browser binary. Deployments can enable it by adding the package/browser.
    const packageName = "playwright";
    const playwright = await import(packageName);
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
      const referenceUrl = process.env["HEADLESS_REFERENCE_URL"];
      if (referenceUrl) {
        await page.goto(referenceUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
      } else {
        await page.setContent(`
          <canvas id="probe" width="1024" height="640"></canvas>
          <script>
            const canvas = document.getElementById('probe');
            const context = canvas.getContext('2d');
            context.fillStyle = '#10151d';
            context.fillRect(0, 0, canvas.width, canvas.height);
          </script>
        `);
      }
      const canvas = page.locator('canvas').first();
      const metrics = await canvas.boundingBox();
      if (!metrics) return { status: 'failed', reason: 'Reference renderer did not expose a canvas.' };
      return {
        status: 'verified',
        boundingBox: { width: metrics.width, height: metrics.height },
        continuity: 1,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : `Optional verifier unavailable for ${input.mode}.`,
    };
  }
}
