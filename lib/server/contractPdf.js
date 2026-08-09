import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { renderContractDocument } from "./contractDocument";
import { readAsDataUrl, saveBuffer } from "./blobStore";

const LOCAL_BROWSERS = [
  process.env.CHROME_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

async function browserExecutable() {
  const local = LOCAL_BROWSERS.find((candidate) => existsSync(candidate));
  return local || chromium.executablePath();
}

let bundledFontCss = "";
function withBundledKoreanFont(html) {
  if (!bundledFontCss) {
    const fontPath = path.join(
      process.cwd(),
      "node_modules",
      "pretendard",
      "dist",
      "web",
      "variable",
      "woff2",
      "PretendardVariable.woff2",
    );
    const data = readFileSync(fontPath).toString("base64");
    bundledFontCss = `<style>@font-face{font-family:'Pretendard Variable';font-style:normal;font-weight:45 920;font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2-variations')}</style>`;
  }
  const withoutRemoteFont = html.replace(/<link[^>]+cdn\.jsdelivr\.net[^>]+pretendard[^>]*>\s*/gi, "");
  return withoutRemoteFont.replace("</head>", `${bundledFontCss}</head>`);
}

/** Render the exact sealed HTML into a static A4 PDF on the server. */
export async function renderContractPdf(inst) {
  const signatureImageUrl = await readAsDataUrl(inst.signaturePath);
  const html = withBundledKoreanFont(await renderContractDocument(
    { ...inst, signatureImageUrl },
    { includeToolbar: false },
  ));

  const executablePath = await browserExecutable();
  const isLocalBrowser = LOCAL_BROWSERS.includes(executablePath);
  const serverlessArgs = isLocalBrowser
    ? []
    : await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" });
  const browser = await puppeteer.launch({
    executablePath,
    args: isLocalBrowser
      ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
      : serverlessArgs,
    headless: isLocalBrowser ? true : "shell",
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.emulateMediaType("print");
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      document.body.classList.remove("cloak");
    });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const pdf = Buffer.from(bytes);
    if (pdf.length < 100 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("계약서 PDF 생성 결과가 올바르지 않습니다.");
    }
    return pdf;
  } finally {
    await browser.close();
  }
}

/** Generate, hash and privately store the signed contract PDF. */
export async function createAndStoreContractPdf(inst) {
  const pdf = await renderContractPdf(inst);
  const documentSha256 = createHash("sha256").update(pdf).digest("hex");
  const documentPath = await saveBuffer(
    `contracts/${inst.contractId}/signed-contract.pdf`,
    pdf,
    "application/pdf",
  );
  return { documentPath, documentSha256, documentBytes: pdf.length };
}
