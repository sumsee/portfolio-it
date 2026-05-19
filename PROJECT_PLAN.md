# PROJECT PLAN — 智能简历匹配展示页生成器

## 项目目标

将当前**静态个人展示页**升级为**自动化工具**：
> 用户上传简历（PDF/DOCX）+ 粘贴岗位 JD → AI 分析匹配度 → 自动生成高匹配度的个人展示网页（可下载 HTML）

---

## 现有资产盘点

| 文件 | 用途 | 升级后角色 |
|------|------|-----------|
| `index.html` | 个人展示页（单一 hardcode 内容） | **拆分为两部分**：① 生成工具 UI（新 homepage）② 输出模板（generator 使用） |
| `style.css` | Apple Keynote 深色风格（464行） | **复用**：作为生成页面的样式基底 + 工具 UI 新样式 |
| `script.js` | modalData 数据 + 弹窗交互（253行） | **拆分**：数据提取到 `data.js`，交互逻辑重写为 app.js |
| `assets/avatar.jpg` | 头像 | 保留，生成页引用 |
| `assets/certificate.jpg` | 证书 | 保留，生成页引用 |
| `assets/photo.png` | 照片 | 保留，生成页引用 |
| `resume.pdf` | 简历 PDF（394KB） | **核心输入源**：作为默认简历 + 解析目标 |

---

## MVP 范围

### 核心用户流程

```
[用户] → 上传简历 PDF/DOCX（或使用默认）
      → 粘贴岗位 JD 文本
      → 点击「生成匹配页」
      → [系统] 解析简历 → 调用 AI 匹配 → 生成定制化 HTML
      → [用户] 预览效果 → 下载 HTML 文件
```

### MVP 功能清单

| 编号 | 功能 | 描述 |
|------|------|------|
| F1 | 简历上传解析 | 支持 PDF/DOCX，前端提取纯文本 + 结构化（姓名/技能/经历/证书） |
| F2 | JD 输入 | 文本域粘贴岗位描述 |
| F3 | AI 匹配分析 | 将简历结构化数据 + JD 发往 Claude API，返回匹配分析 JSON |
| F4 | 页面自动生成 | 根据匹配结果，重用现有 dark theme 模板，生成定制化展示页 |
| F5 | 实时预览 | iframe 内预览生成的页面 |
| F6 | 下载 HTML | 一键下载自包含的 HTML 文件（内联 CSS/JS） |

### MVP 不做

- ❌ 用户注册/登录
- ❌ 历史记录/多版本管理
- ❌ 后端持久化存储
- ❌ 批量 JD 匹配
- ❌ 多套模板选择（先只用当前 dark theme）
- ❌ 移动端完整适配（工具页 desktop-first，生成页保持现有响应式）

---

## 架构设计

```
portfolio-it/
├── index.html                  # [新] 生成工具主页 UI
├── style.css                   # [改] 工具页样式 + 保留生成页样式
├── app.js                      # [新] 工具主控逻辑（上传/输入/生成/预览/下载）
├── modules/
│   ├── parser.js               # [新] PDF/DOCX 解析 → 结构化简历数据
│   ├── matcher.js              # [新] 调用 Claude API 进行简历-JD匹配
│   ├── generator.js            # [新] 匹配结果 → HTML 页面生成引擎
│   └── data.js                 # [新] 默认简历数据（从 script.js modalData 提取）
├── api/
│   └── match.js                # [新] Serverless API 代理（保护 API Key）
├── assets/                     # [保留] 头像/证书/照片
│   ├── avatar.jpg
│   ├── certificate.jpg
│   └── photo.png
├── resume.pdf                  # [保留] 默认简历
├── PROJECT_PLAN.md             # [本文档]
├── TASK_BOARD.md               # 任务看板
└── MODULE_OWNERS.md            # 模块归属
```

### 数据流

```
PDF/DOCX 文件
    │
    ▼
parser.js ─── { name, skills[], experience[], education[], certs[] }
    │
    ▼
matcher.js ─── JD 文本 + 简历 JSON → Claude API → 匹配分析 JSON
    │                                          │
    │                          { matchScore, highlights[], suggestions[],
    │                            tailoredContent: { sections } }
    ▼
generator.js ─── 模板 HTML + 匹配结果 → 完整 HTML 字符串
    │
    ▼
预览 iframe / 下载 HTML 文件
```

### 技术选型

| 关注点 | 方案 | 理由 |
|--------|------|------|
| PDF 解析 | pdf.js (CDN) | 前端解析，无需后端 |
| DOCX 解析 | mammoth.js (CDN) | 前端解析，轻量 |
| AI 匹配 | DeepSeek API (via serverless proxy) | 优秀的中文理解能力，OpenAI 兼容格式，国内直连低延迟 |
| API 代理 | Vercel Serverless / Netlify Functions | 保护 API Key，简单部署 |
| 模板引擎 | 纯 JS 字符串拼接 | 零依赖，可控性强 |
| 部署 | GitHub Pages + Vercel Functions | 免费，全球 CDN |

---

## 分阶段计划

### Phase 1 — MVP 核心流（当前阶段，预计 3-5天）

| 编号 | 任务 | 优先级 |
|------|------|--------|
| P1.1 | 简历解析模块（parser.js：PDF/DOCX→结构化JSON） | P0 |
| P1.2 | AI 匹配 API（api/match.js + matcher.js） | P0 |
| P1.3 | 页面生成引擎（generator.js：模板+数据→HTML） | P0 |
| P1.4 | 工具页 UI（index.html：上传/输入/预览/下载） | P0 |
| P1.5 | 默认简历数据提取（data.js：从 script.js 剥离） | P1 |
| P1.6 | 工具页样式（style.css：表单/按钮/布局） | P1 |
| P1.7 | 端到端集成测试 | P0 |

### Phase 2 — 体验增强（后续）

- 多套生成模板可选
- 拖拽上传 + 粘贴检测
- 生成历史列表（localStorage）
- 匹配度分数可视化仪表盘
- Loading 动画 / skeleton

### Phase 3 — 进阶（远期）

- 用户账号 + 云端存储
- 批量岗位匹配
- JD 自动抓取（URL 输入）
- 多语言简历支持
- 自定义模板编辑器

---

## 设计约束

- **零框架依赖**（P1.1 除外：pdf.js / mammoth.js 是功能性 CDN 依赖）
- **生成页自包含**：下载的 HTML 必须内联所有 CSS/JS，不依赖外部资源
- **API Key 安全**：DeepSeek API Key 仅存在于 serverless 端，前端不暴露
- **兼容性**：Chrome/Firefox/Safari/Edge 最近 2 个大版本
- **中文优先**：所有 AI prompt 和 UI 文案以中文为主

---

## 最后更新

2026-05-19 — Architect Agent 创建，基于静态站升级为 AI 生成器
2026-05-20 — 迁移 AI 后端：Claude API → DeepSeek API（OpenAI 兼容格式），端点 https://api.deepseek.com，模型 deepseek-chat，环境变量改为 DEEPSEEK_API_KEY。前端代码不受影响（API 契约不变）。
