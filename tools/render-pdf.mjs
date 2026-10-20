// node tools/render-pdf.mjs in.html out.pdf   (needs playwright with a Chromium)
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(process.cwd() + '/');
const { chromium } = require('playwright');
const [inp, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const pg = await (await b.newContext({ colorScheme: 'light' })).newPage();
await pg.goto('file://' + path.resolve(inp));
await pg.waitForTimeout(800);
await pg.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close();
