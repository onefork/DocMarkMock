// ocrService.js — 模拟 OCR REST API
// recognize(file, onProgress) → Promise<{ markdown, text, pageCount, metadata }>

const SAMPLE_REPORT = `# 文档识别结果

## 一、业绩摘要

本季度公司整体营收同比增长 **18%**，核心业务线表现稳健。

| 指标 | 上季度 | 本季度 | 环比 |
| --- | --- | --- | --- |
| 营收 | 1.2 亿 | 1.42 亿 | +18% |
| 用户数 | 86 万 | 102 万 | +19% |

## 二、重点进展

1. 完成新一代识别引擎上线，准确率提升至 98.5%
2. 拓展了 3 个行业大客户
3. 移动端产品发布 v2.0
`;

const SAMPLE_MEETING = `# 会议纪要

- 时间：2025-06-25 14:00–16:00
- 地点：3 号会议室
- 主持：张明

## 议题

1. 产品路线图评审
2. 上线问题复盘

## 决议

- 启动「智能校对」功能开发
- 本周五前完成历史问题清零

## 待办

- [ ] 输出路线图终稿
- [ ] 排期开发任务
`;

const SAMPLE_INVOICE = `# 发票信息

- 发票代码：032001900111
- 发票号码：12345678
- 开票日期：2025-06-20

## 购方信息

名称：示例科技有限公司
税号：91110000XXXXXXXXXX

## 金额

- 价税合计：￥ 12,800.00
- 税率：13%
`;

const SAMPLE_GENERIC = `# 识别结果

这是一份由 DocMark OCR 引擎自动识别生成的文档。

## 主要内容

- 文档标题与章节结构已自动识别
- 表格、列表等元素已尽量还原
- 图片中的文字通过 OCR 技术提取

## 备注

如需修改，请在编辑器中调整 Markdown 源码。
`;

// 根据文件名/类型选取样例 markdown
function pickSample(file) {
  const name = (file && file.name ? file.name : '').toLowerCase();
  if (/报告|report|季度|quarter/.test(name)) return SAMPLE_REPORT;
  if (/会议|纪要|meeting|minutes/.test(name)) return SAMPLE_MEETING;
  if (/发票|invoice|receipt/.test(name)) return SAMPLE_INVOICE;
  // 按类型兜底
  const type = file && file.type ? file.type : '';
  if (type === 'excel') return SAMPLE_REPORT;
  if (type === 'image') return SAMPLE_INVOICE;
  return SAMPLE_GENERIC;
}

// 将 markdown 去除语法得到纯文本
function markdownToText(md) {
  if (!md) return '';
  return md
    // 移除标题井号
    .replace(/^#{1,6}\s*/gm, '')
    // 移除粗体/斜体标记
    .replace(/(\*{1,3}|_{1,3})(.+?)\1/g, '$2')
    // 移除行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 移除图片
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // 链接保留文本
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // 引用标记
    .replace(/^>\s?/gm, '')
    // 表格分隔行
    .replace(/^\|?[\s:-]+\|[\s:-|]+$/gm, '')
    // 表格单元格竖线
    .replace(/\|/g, ' ')
    // 任务列表标记
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '')
    // 列表标记
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // 水平线
    .replace(/^---+$/gm, '')
    // 多空行折叠
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function recognize(file, onProgress) {
  return new Promise((resolve) => {
    const total = 1500 + Math.random() * 1500; // 1500–3000ms
    const step = 100; // setInterval 间隔
    const inc = (step / total) * 100;
    let progress = 0;
    const markdown = pickSample(file);
    const pageCount = 1 + Math.floor(Math.random() * 5); // 1-5
    const confidence = +(0.92 + Math.random() * 0.07).toFixed(2); // 0.92-0.99

    const tick = () => {
      progress = Math.min(100, progress + inc * (0.8 + Math.random() * 0.6));
      if (typeof onProgress === 'function') {
        try { onProgress(Math.round(progress)); } catch (e) { /* noop */ }
      }
      if (progress >= 100) {
        clearInterval(timer);
        resolve({
          markdown,
          text: markdownToText(markdown),
          pageCount,
          metadata: {
            sourceName: (file && file.name) || 'unknown',
            recognizedAt: new Date().toISOString(),
            confidence,
          },
        });
      }
    };
    const timer = setInterval(tick, step);
  });
}
