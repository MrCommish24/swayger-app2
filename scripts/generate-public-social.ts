/** Generate a brand graphic, not a product screenshot. No customer data. */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const font = (name: string) => `data:font/ttf;base64,${fs.readFileSync(path.resolve("assets/marketing", name)).toString("base64")}`;
    const mark = fs.readFileSync("assets/marketing/swayger-mark.svg", "utf8");
    await page.setContent(`<html><head><style>
      @font-face{font-family:Barlow;src:url('${font("barlow-800.ttf")}')}@font-face{font-family:DM;src:url('${font("dm-400.ttf")}')}
      *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#09090B;color:#FAFAFA;padding:60px 72px;font-family:DM,sans-serif;border-bottom:16px solid #4361EE}
      header{display:flex;align-items:center;gap:16px;font:800 36px Barlow,sans-serif;letter-spacing:2px}svg{width:46px;height:46px}h1{font:800 108px/.92 Barlow,sans-serif;text-transform:uppercase;max-width:900px;margin:46px 0 24px;letter-spacing:-2px}em{color:#4361EE;font-style:normal}p{font:26px DM,sans-serif;color:#A8A8B3;margin:0}footer{margin-top:36px;font:18px DM,sans-serif;color:#AEBBFF;letter-spacing:3px;text-transform:uppercase}
      </style></head><body><header>${mark} SWAYGER</header><h1>Make sports talk<br><em>competitive.</em></h1><p>Make your picks. Prove your takes. Keep the receipts.</p><footer>Game Day &nbsp; / &nbsp; Fantasy &nbsp; / &nbsp; 1v1</footer></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "assets/marketing/swayger-social.png" });
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
