// A new Chromium tab may not yet have a capturable compositor surface after
// the preceding GPU fixture closes. Retry only that exact CDP transport error;
// never retry assertions, missing images, timeouts, crashes or closed targets.
export async function startupScreenshot(page, options, verifyPhase = async () => {}) {
 for (let attempt = 1; attempt <= 3; attempt++) {
  await page.bringToFront();
  await page.evaluate(async () => {
   await document.fonts.ready;
   const poster = document.querySelector('.scene-poster');
   if (poster) await poster.decode();
   await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await verifyPhase();
  try {
   const image = await page.screenshot(options);
   await verifyPhase();
   return image;
  } catch (error) {
   if (attempt === 3 || !/Protocol error \(Page\.captureScreenshot\): Unable to capture screenshot/.test(error.message)) throw error;
  }
 }
}
