/** Builds a clean, print-ready A4 document and hands it to the browser's PDF printer. */
export interface PdfSection {
  heading?: string;
  html: string;
}

export function printReportPdf({
  title,
  subtitle,
  sections,
}: {
  title: string;
  subtitle: string;
  sections: PdfSection[];
}) {
  const body = sections
    .map(
      (s) =>
        `<section class="block">${s.heading ? `<h2>${s.heading}</h2>` : ""}${s.html}</section>`,
    )
    .join("");

  const doc = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Vazirmatn, system-ui, sans-serif;
    color: #16202e;
    margin: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #1d4ed8; }
  header p { margin: 0; font-size: 11px; color: #64748b; }
  h2 { font-size: 14px; margin: 0 0 8px; color: #0f172a; }
  .block { margin-bottom: 18px; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d8e0ea; padding: 6px 8px; text-align: right; }
  th { background: #eff4fb; font-weight: 600; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; }
  .stat {
    flex: 1 1 28%; border: 1px solid #d8e0ea; border-radius: 10px;
    padding: 8px 10px; background: #f8fafc;
  }
  .stat b { display: block; font-size: 17px; color: #1d4ed8; }
  .stat span { font-size: 10px; color: #64748b; }
  .charts { display: flex; flex-wrap: wrap; gap: 10px; }
  .chart { flex: 1 1 45%; border: 1px solid #d8e0ea; border-radius: 10px; padding: 8px; }
  .chart h3 { font-size: 11px; margin: 0 0 6px; color: #475569; }
  .chart img { width: 100%; height: auto; }
  .bar { height: 8px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: #2563eb; }
  ul { margin: 4px 0 0; padding-inline-start: 16px; font-size: 11px; }
  footer { margin-top: 10px; font-size: 9px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <header><h1>${title}</h1><p>${subtitle}</p></header>
  ${body}
  <footer>مدیریت وظایف — گزارش خودکار</footer>
</body>
</html>`;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.inset = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const cw = frame.contentDocument;
  if (!win || !cw) {
    frame.remove();
    throw new Error("print frame unavailable");
  }
  cw.open();
  cw.write(doc);
  cw.close();

  const run = () => {
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  // give fonts and chart images a moment to settle
  window.setTimeout(run, 700);
}
