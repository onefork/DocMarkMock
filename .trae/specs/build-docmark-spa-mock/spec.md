# DocMark 文档转换 SPA Mock Spec

## Why

用户提供了 DocMark 的 PC 端与移动端设计稿（5 个页面：auth / dashboard / upload / editor / export），但目前只是彼此独立的静态 HTML，缺少 SPA 路由、真实交互与多端自适应。需要搭建一个纯前端 SPA mock，把照片、扫描图片、PDF 等转换为流式文档（Markdown / HTML / DOCX / 电子书 / 普通 PDF / 可搜索扫描 PDF / Editable Text & Image PDF 等），面向一般文员与管理人员，可一键预览体验完整业务流。

## What Changes

- 新建一个无构建步骤的纯前端 SPA（单个 `index.html` 入口 + ES 模块），保持设计稿 Notion 暖中性视觉风格（单品牌蓝 `#2383E2`、边框优先、Inter + Noto Sans SC、JetBrains Mono）。
- **BREAKING（相对设计稿）**：将设计稿中分散的 PC / Mobile 两套 HTML 合并为**单一响应式 SPA**，通过视口断点（≥1024px 走 PC 侧边栏布局，<1024px 走移动端底部 Tab 布局）切换外壳，页面组件按端适配。
- 基于 Hash 的客户端路由，串起 5 个视图：`#/auth` → `#/dashboard` → `#/upload` → `#/editor` → `#/export`，支持返回与登出。
- 补充**真实页面交互**：登录/注册 Tab、密码可见性与强度、文件拖放与选择队列、上传进度模拟、Markdown 实时预览编辑、字数统计、表格/卡片视图切换、搜索过滤、行内操作（编辑/下载/删除/重试）。
- **扩展导出格式**：在设计稿 4 种（Markdown / HTML / 纯文本 / PDF）基础上，新增 DOCX、电子书（EPUB）、普通 PDF、可搜索扫描 PDF、Editable Text & Image PDF（ClearScan）等完整格式选项。
- OCR 由**模拟的后端 REST API** 实现（`fetch` 一个本地 mock 端点，带延迟与轮询，返回结构化 markdown）；其余格式转换由**前端代码真实实现**或生成可下载产物：
  - Markdown / HTML / 纯文本：真实前端转换（marked 解析 + 字符串处理）。
  - DOCX：使用 `docx` 库在浏览器生成真实 `.docx`。
  - 普通 PDF：使用 `jspdf` 将渲染后的 HTML/文本导出为 `.pdf`。
  - EPUB / 可搜索扫描 PDF / ClearScan：受浏览器能力限制，生成带正确扩展名与基本结构的占位产物（mock），并在 UI 标注「模拟产物」。
- 引入内存 Mock 数据存储（文件列表、KPI、转换状态），登录态、文件队列、编辑内容在会话内持久。

## Impact

- Affected specs: 无既有 spec（新建）。
- Affected code: 全部为新增，位于 `/workspace/docmark-spa/`（`index.html` + `src/` 模块 + `assets/`）。设计稿位于 `/tmp/design_extract/docmark-pc|mobile/`，仅作视觉与交互参考，不直接复用其 HTML。
- 外部依赖（CDN）：Tailwind CSS v4 browser build、Lucide icons、marked、jspdf、docx；无 npm 构建链，浏览器直开可用。

## ADDED Requirements

### Requirement: 单入口响应式 SPA 外壳
系统 SHALL 提供单个 `index.html` 入口的纯前端 SPA，无构建步骤，浏览器直接打开即可运行。

#### Scenario: PC 端访问
- **WHEN** 视口宽度 ≥ 1024px 并访问任意已登录路由
- **THEN** 渲染 240px 左侧边栏（Logo + 导航 + 用户区）+ 右侧主内容区，与设计稿 PC 版一致

#### Scenario: 移动端访问
- **WHEN** 视口宽度 < 1024px 并访问任意已登录路由
- **THEN** 隐藏侧边栏，渲染底部 5 项 Tab 导航与全宽内容，触摸目标 ≥ 44px，含 safe-area padding

#### Scenario: 路由切换
- **WHEN** 用户点击导航或操作按钮
- **THEN** 通过 Hash 路由切换视图，不刷新页面，并滚动到顶部

### Requirement: 登录/注册视图
系统 SHALL 提供登录/注册视图，无应用外壳，居中卡片布局。

#### Scenario: Tab 切换与密码强度
- **WHEN** 用户在登录/注册间切换并输入注册密码
- **THEN** 实时显示 4 段密码强度条与文字标签，密码可切换可见性

#### Scenario: 登录进入
- **WHEN** 用户提交登录表单（任意非空邮箱+密码）
- **THEN** 进入 `#/dashboard`，会话标记为已登录

### Requirement: 文件管理仪表盘视图
系统 SHALL 提供仪表盘视图，展示 KPI 指标条与文件列表，支持搜索、视图切换与行内操作。

#### Scenario: KPI 与列表
- **WHEN** 进入仪表盘
- **THEN** 展示总文件数 / 本月转换 / 存储用量三项 KPI（来自内存 Mock 数据），并展示文件表格（PC）或堆叠卡片（移动端）

#### Scenario: 视图切换与搜索
- **WHEN** 用户切换表格/卡片视图或在搜索框输入
- **THEN** 列表按关键词过滤文件名并切换展示形态

#### Scenario: 行内操作
- **WHEN** 用户点击「编辑」/「下载」/「删除」/「重试」
- **THEN** 分别跳转编辑器 / 触发下载 / 从内存移除并刷新 / 重置为待处理并模拟转换

### Requirement: 上传与转换视图
系统 SHALL 提供上传视图，支持拖放与选择，文件队列带进度，调用模拟 OCR REST API 完成转换。

#### Scenario: 添加与移除文件
- **WHEN** 用户拖放或选择文件，或点击文件卡片删除按钮
- **THEN** 队列实时增减，显示文件类型图标、名称、大小、状态

#### Scenario: 开始转换（模拟 OCR）
- **WHEN** 用户点击「开始转换」
- **THEN** 调用模拟 OCR 端点（含延迟与进度条），完成后将结果写入内存并跳转 `#/editor`

### Requirement: 编辑器视图
系统 SHALL 提供编辑器视图，Markdown 源码可编辑并实时预览。

#### Scenario: 实时预览
- **WHEN** 用户在编辑区修改 Markdown
- **THEN** 右侧预览区（PC）或预览 Tab（移动端）即时重新渲染，底部状态栏显示字数与保存状态

#### Scenario: 编辑/预览/对照模式
- **WHEN** 用户切换「对照 / 预览」或移动端「编辑/预览」Tab
- **THEN** 切换面板布局，移动端浮动工具栏插入 Markdown 语法

### Requirement: 导出视图（扩展格式）
系统 SHALL 提供导出视图，支持 Markdown / HTML / 纯文本 / DOCX / 电子书(EPUB) / 普通 PDF / 可搜索扫描 PDF / Editable Text & Image PDF(ClearScan) 八种格式选择。

#### Scenario: 选择格式与方式
- **WHEN** 用户选择格式卡片与导出方式（直接下载 / 复制到剪贴板）并填写文件名
- **THEN** 选中态视觉与设计稿一致，确认按钮启用

#### Scenario: 确认导出
- **WHEN** 用户点击「确认导出」
- **THEN** 前端执行对应转换并触发下载（或复制到剪贴板），浏览器能力受限的格式生成占位产物并提示「模拟产物」

### Requirement: 模拟 OCR REST API
系统 SHALL 提供一个模拟的后端 OCR 接口封装，屏蔽真实网络依赖。

#### Scenario: 提交 OCR 任务
- **WHEN** 前端调用 `ocrService.recognize(file)`
- **THEN** 返回 Promise，模拟网络延迟（1.5–3s）后 resolve 结构化结果 `{ markdown, text, pageCount, metadata }`，结果依据文件名/类型从内置样例库选取

### Requirement: 视觉一致性
系统 SHALL 在色彩、圆角、字体、间距、阴影策略上与设计稿 `colors_and_type.css` 完全一致。

#### Scenario: 静态与浮层阴影
- **WHEN** 渲染卡片/表格/面板等静态表面
- **THEN** 仅使用边框，不使用阴影；弹窗/抽屉/Toast 浮层使用 alpha ≤ 0.08 阴影

## MODIFIED Requirements

### Requirement: 多端适配（相对设计稿两套项目）
设计稿以 PC / Mobile 两个独立 `.design` 项目实现响应式；本 SPA 修改为**单一响应式代码库**，通过 CSS 媒体查询与 JS 视口检测在运行时切换布局外壳与组件变体，保证两端的视觉与交互与设计稿各自一致。

## REMOVED Requirements

### Requirement: 设计稿两套独立项目
**Reason**: 改为单一响应式 SPA，避免重复维护两套页面。
**Migration**: 设计稿 HTML 仅作视觉/交互参考，不直接使用；所有布局在 SPA 内按断点重建。
