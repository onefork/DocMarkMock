// store.js — 内存状态 + 订阅
// 导出：state, subscribe, setState, login, logout, addFile, removeFile,
//       updateFile, getFile, setCurrent, setCurrentMarkdown, getKPI, seedDemoData

let _idSeq = 0;
function genId() {
  _idSeq += 1;
  return 'file_' + Date.now().toString(36) + '_' + _idSeq;
}

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 字节数 → 人类可读文本
function formatSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// 通用中文 markdown 样例
const SAMPLE_MD_GENERIC = `# 文档概览

这是一份由 DocMark 自动识别生成的文档。系统已将原始文件中的文字内容提取并结构化为 Markdown 格式。

## 主要内容

- 文档标题与章节结构已自动识别
- 表格、列表等元素已尽量还原
- 图片中的文字通过 OCR 技术提取

## 备注

如需修改，请在编辑器中调整 Markdown 源码，然后导出为目标格式。
`;

const SAMPLE_MD_REPORT = `# Q3 季度报告

## 一、业绩摘要

本季度公司整体营收同比增长 **18%**，核心业务线表现稳健。

| 指标 | Q2 | Q3 | 环比 |
| --- | --- | --- | --- |
| 营收 | 1.2 亿 | 1.42 亿 | +18% |
| 用户数 | 86 万 | 102 万 | +19% |

## 二、重点进展

1. 完成新一代识别引擎上线，准确率提升至 98.5%
2. 拓展了 3 个行业大客户
3. 移动端产品发布 v2.0

## 三、下季度计划

- 推出多语言 OCR 支持
- 优化大文件处理性能
`;

const SAMPLE_MD_MEETING = `# 会议纪要 0625

- 时间：2025-06-25 14:00–16:00
- 地点：3 号会议室
- 主持：张明
- 参会：产品、研发、设计团队

## 议题

1. Q3 产品路线图评审
2. 上线问题复盘
3. 资源分配

## 决议

- 7 月初启动「智能校对」功能开发
- 本周五前完成历史问题清零
- 设计组新增 1 名实习生支援

## 待办

- [ ] 张明：输出路线图终稿
- [ ] 李华：排期开发任务
- [ ] 王芳：补充交互稿
`;

const SAMPLE_MD_INVOICE = `# 发票扫描件

## 发票信息

- 发票代码：032001900111
- 发票号码：12345678
- 开票日期：2025-06-20
- 校验码：1234567890123456

## 购方信息

名称：示例科技有限公司
税号：91110000XXXXXXXXXX

## 销方信息

名称：示例服务有限公司
税号：91310000XXXXXXXXXX

## 金额

- 价税合计：￥ 12,800.00
- 税率：13%
`;

const SAMPLE_MD_PRD = `# 产品需求文档

## 1. 背景

随着文档数字化需求增长，用户希望一键将扫描件转换为可编辑文本。

## 2. 目标

- 支持 PDF / 图片 / Word / Excel 多格式输入
- 识别准确率 ≥ 95%
- 单文件处理时长 < 5 秒

## 3. 功能模块

1. 文件上传与队列管理
2. OCR 识别引擎
3. 在线 Markdown 编辑器
4. 多格式导出（PDF / DOCX / MD）

## 4. 非功能需求

- 移动端适配
- 支持暗色模式（后续迭代）
`;

const SAMPLE_MD_CONTRACT = `# 合同签字页

## 合同要点

- 合同编号：HT-2025-0618
- 签订日期：2025-06-18
- 甲方：示例甲方公司
- 乙方：示例乙方公司

## 签字栏

甲方（盖章）：________________

乙方（盖章）：________________

> 注：本页为合同签字页扫描件，正文详见主合同。
`;

const SAMPLE_MD_SALES = `# 销售数据汇总

## 月度销售

| 月份 | 销售额 | 订单数 | 客单价 |
| --- | --- | --- | --- |
| 1 月 | 320 万 | 1280 | 2500 |
| 2 月 | 285 万 | 1140 | 2500 |
| 3 月 | 410 万 | 1640 | 2500 |

## 区域分布

- 华东：42%
- 华北：28%
- 华南：18%
- 其他：12%

## 结论

Q1 销售达成率 105%，华东区贡献最大。
`;

// 演示文件配置：name / type / size(bytes) / status / sampleMd
const DEMO_FILES = [
  { name: 'Q3季度报告.pdf', type: 'pdf', size: 2.3 * 1024 * 1024, status: 'completed', md: SAMPLE_MD_REPORT, pageCount: 6 },
  { name: '会议纪要-0625.jpg', type: 'image', size: 1.1 * 1024 * 1024, status: 'completed', md: SAMPLE_MD_MEETING, pageCount: 1 },
  { name: '发票扫描件.pdf', type: 'pdf', size: 856 * 1024, status: 'processing', md: SAMPLE_MD_INVOICE, pageCount: 1 },
  { name: '产品需求文档.docx', type: 'docx', size: 3.8 * 1024 * 1024, status: 'completed', md: SAMPLE_MD_PRD, pageCount: 4 },
  { name: '合同签字页.png', type: 'image', size: 2.0 * 1024 * 1024, status: 'failed', md: SAMPLE_MD_CONTRACT, pageCount: 1 },
  { name: '销售数据汇总.xlsx', type: 'excel', size: 4.5 * 1024 * 1024, status: 'completed', md: SAMPLE_MD_SALES, pageCount: 3 },
];

export const state = {
  isLoggedIn: false,
  user: { name: '张明', avatar: '张' },
  files: [],
  currentFileId: null,
  currentMarkdown: '',
  uploadQueue: [],
  viewMode: 'table',
  searchQuery: '',
};

const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch (e) { console.error('[store] listener error', e); }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patch) {
  Object.assign(state, patch);
  notify();
}

export function login(user) {
  state.isLoggedIn = true;
  state.user = user && user.name ? { name: user.name, avatar: user.avatar || user.name.slice(0, 1) } : { name: '张明', avatar: '张' };
  notify();
}

export function logout() {
  state.isLoggedIn = false;
  state.currentFileId = null;
  state.currentMarkdown = '';
  notify();
}

export function addFile(file) {
  const f = {
    id: file.id || genId(),
    name: file.name || '未命名文件',
    type: file.type || 'pdf',
    size: file.size || 0,
    sizeText: file.sizeText || formatSize(file.size || 0),
    status: file.status || 'pending',
    modified: file.modified || today(),
    markdown: file.markdown || '',
    pageCount: file.pageCount || 0,
  };
  state.files.unshift(f);
  notify();
  return f;
}

export function removeFile(id) {
  state.files = state.files.filter((f) => f.id !== id);
  if (state.currentFileId === id) {
    state.currentFileId = null;
    state.currentMarkdown = '';
  }
  notify();
}

export function updateFile(id, patch) {
  const f = state.files.find((x) => x.id === id);
  if (f) {
    Object.assign(f, patch);
    notify();
  }
  return f;
}

export function getFile(id) {
  return state.files.find((f) => f.id === id) || null;
}

export function setCurrent(id) {
  state.currentFileId = id;
  const f = getFile(id);
  state.currentMarkdown = f ? f.markdown : '';
  notify();
}

export function setCurrentMarkdown(md) {
  state.currentMarkdown = md;
  if (state.currentFileId) {
    const f = getFile(state.currentFileId);
    if (f) f.markdown = md;
  }
  notify();
}

export function getKPI() {
  const total = state.files.length;
  const monthly = state.files.filter((f) => f.status === 'completed' || f.status === 'processing').length;
  const totalBytes = state.files.reduce((s, f) => s + (f.size || 0), 0);
  const storageText = formatSize(totalBytes);
  return { total, monthly, storageText };
}

export function seedDemoData() {
  if (state.files.length > 0) return;
  DEMO_FILES.forEach((d) => {
    state.files.push({
      id: genId(),
      name: d.name,
      type: d.type,
      size: d.size,
      sizeText: formatSize(d.size),
      status: d.status,
      modified: today(),
      markdown: d.status === 'completed' ? d.md : (d.status === 'processing' ? '' : d.md),
      pageCount: d.pageCount,
    });
  });
}

// 初始化时填充演示数据
seedDemoData();
