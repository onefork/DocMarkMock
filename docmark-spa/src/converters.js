// converters.js — 文档格式转换器
// 依赖全局：window.marked / window.jspdf / window.docx
// 命名导出：stripMarkdown, toMarkdown, toHTML, toText, toDOCX, toPDF,
//           toEPUB, toSearchablePDF, toClearScanPDF, convert, FORMATS

export const FORMATS = [
  { id: 'md', label: 'Markdown', ext: '.md', icon: 'file-code', mock: false },
  { id: 'html', label: 'HTML', ext: '.html', icon: 'file-code-2', mock: false },
  { id: 'txt', label: '纯文本', ext: '.txt', icon: 'file-type', mock: false },
  { id: 'docx', label: 'DOCX', ext: '.docx', icon: 'file-text', mock: false },
  { id: 'pdf', label: '普通 PDF', ext: '.pdf', icon: 'file', mock: false },
  { id: 'epub', label: '电子书', ext: '.epub', icon: 'book', mock: true },
  { id: 'searchable-pdf', label: '可搜索扫描 PDF', ext: '.pdf', icon: 'scan-line', mock: true },
  { id: 'clearscan', label: 'ClearScan PDF', ext: '.pdf', icon: 'image', mock: true },
];

// 去除 markdown 语法返回纯文本
// 去 #/*/>/`/|/- 列表前缀、表格分隔行、html 标签，保留文字与换行，trim 每行
export function stripMarkdown(md) {
  if (!md) return '';
  // 去 HTML 标签
  let text = md.replace(/<[^>]+>/g, '');
  return text
    .split('\n')
    .map((raw) => {
      let line = raw;
      // 表格分隔行（| --- | --- | : 形如 | --- | :---: | 等）
      if (/^\s*\|?[\s\-:|]+\|?\s*$/.test(line) && line.includes('-') && line.includes('|')) {
        return '';
      }
      // 去行首 # 井号（1~6 级）
      line = line.replace(/^\s{0,3}#{1,6}\s*/, '');
      // 去行首 > 引用
      line = line.replace(/^\s{0,3}>\s?/, '');
      // 去行首 - * + 无序列表
      line = line.replace(/^\s*[-*+]\s+/, '');
      // 去行首 数字. 有序列表
      line = line.replace(/^\s*\d+\.\s+/, '');
      // 去代码块围栏 ``` 与反引号
      line = line.replace(/^\s*```.*$/, '');
      line = line.replace(/`/g, '');
      // 去表格列分隔 | （首尾及中间）
      line = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').replace(/\s*\|\s*/g, '  ');
      // 去粗体 / 斜体标记 ** *** *
      line = line
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1');
      return line.trim();
    })
    .join('\n')
    .trim();
}

export function toMarkdown(md) {
  return {
    blob: new Blob([md || ''], { type: 'text/markdown;charset=utf-8' }),
    ext: 'md',
    mime: 'text/markdown',
    isMock: false,
  };
}

export function toHTML(md) {
  const body = window.marked.parse(md || '');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>导出文档</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, 'Noto Sans SC', sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
    color: #37352F;
    line-height: 1.6;
  }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #E9E9E7; padding: 8px 12px; text-align: left; }
  th { background: #F7F6F3; font-weight: 600; }
  code { background: #F1F1EF; padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
  pre { background: #F1F1EF; padding: 12px; border-radius: 8px; overflow: auto; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 3px solid #2383E2; margin: 0 0 12px 0; padding: 4px 16px; color: #787774; }
  img { max-width: 100%; }
  a { color: #2383E2; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  return {
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
    ext: 'html',
    mime: 'text/html',
    isMock: false,
  };
}

export function toText(md) {
  return {
    blob: new Blob([stripMarkdown(md)], { type: 'text/plain;charset=utf-8' }),
    ext: 'txt',
    mime: 'text/plain',
    isMock: false,
  };
}

export async function toDOCX(md) {
  const docx = window.docx;
  const lines = (md || '').split('\n');
  const children = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let para;
    if (line.startsWith('# ')) {
      para = new docx.Paragraph({
        heading: docx.HeadingLevel.HEADING_1,
        children: [new docx.TextRun(line.slice(2))],
      });
    } else if (line.startsWith('## ')) {
      para = new docx.Paragraph({
        heading: docx.HeadingLevel.HEADING_2,
        children: [new docx.TextRun(line.slice(3))],
      });
    } else if (line.startsWith('### ')) {
      para = new docx.Paragraph({
        heading: docx.HeadingLevel.HEADING_3,
        children: [new docx.TextRun(line.slice(4))],
      });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      para = new docx.Paragraph({
        bullet: { level: 0 },
        children: [new docx.TextRun(line.slice(2))],
      });
    } else if (line.startsWith('> ')) {
      para = new docx.Paragraph({
        children: [new docx.TextRun({ text: line.slice(2), italics: true })],
      });
    } else {
      para = new docx.Paragraph({ children: [new docx.TextRun(line)] });
    }
    children.push(para);
  }
  const doc = new docx.Document({ sections: [{ children }] });
  const blob = await docx.Packer.toBlob(doc);
  return {
    blob,
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    isMock: false,
  };
}

export function toPDF(md) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - 2 * margin;
  const lineHeight = 16;
  let y = margin;
  const text = stripMarkdown(md);
  const lines = text.split('\n');
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    for (const w of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += lineHeight;
    }
  }
  const blob = doc.output('blob');
  return { blob, ext: 'pdf', mime: 'application/pdf', isMock: false };
}

// mock：最小占位 EPUB（不构造真实 zip，仅包成 blob）
export function toEPUB(md) {
  const body = window.marked.parse(md || '');
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>导出文档</title></head>
<body>
${body}
</body>
</html>`;
  const blob = new Blob([content], { type: 'application/epub+zip' });
  return { blob, ext: 'epub', mime: 'application/epub+zip', isMock: true };
}

// mock：可搜索扫描 PDF
export function toSearchablePDF(md) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - 2 * margin;
  let y = margin;
  doc.setFontSize(14);
  doc.text('模拟可搜索扫描 PDF', margin, y);
  y += 24;
  doc.setFontSize(11);
  const text = stripMarkdown(md);
  const lines = text.split('\n');
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    for (const w of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += 14;
    }
  }
  const blob = doc.output('blob');
  return { blob, ext: 'pdf', mime: 'application/pdf', isMock: true };
}

// mock：ClearScan PDF
export function toClearScanPDF(md) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - 2 * margin;
  let y = margin;
  doc.setFontSize(14);
  doc.text('模拟 Editable Text & Image PDF (ClearScan)', margin, y);
  y += 24;
  doc.setFontSize(11);
  const text = stripMarkdown(md);
  const lines = text.split('\n');
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    for (const w of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += 14;
    }
  }
  const blob = doc.output('blob');
  return { blob, ext: 'pdf', mime: 'application/pdf', isMock: true };
}

export async function convert(format, md) {
  switch (format) {
    case 'md':
      return toMarkdown(md);
    case 'html':
      return toHTML(md);
    case 'txt':
      return toText(md);
    case 'docx':
      return await toDOCX(md);
    case 'pdf':
      return toPDF(md);
    case 'epub':
      return toEPUB(md);
    case 'searchable-pdf':
      return toSearchablePDF(md);
    case 'clearscan':
      return toClearScanPDF(md);
    default:
      return toMarkdown(md);
  }
}
