# TASK BOARD — 任务看板

> 状态: ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ⛔ 阻塞 | ❌ 取消
>
> 负责人: **T2** = Frontend Agent（终端 2）| **T3** = API Agent（终端 3）

---

## Phase 1 — MVP 核心流

### 第一批任务（已交付）

| ID | 任务 | 状态 | 负责人 | 文件 | 审查结果 |
|----|------|------|--------|------|----------|
| T1 | Serverless API 代理 | ✅ | T3 | `api/match.js` | 通过（272行，安全边界完整） |
| T2 | 简历解析模块 | ✅ | T2 | `modules/parser.js` | 通过（T5b 已修复完毕） |
| T3 | 默认简历数据提取 | ✅ | T2 | `modules/data.js` | 通过（93行，结构完整） |
| T4 | AI 匹配前端模块 | ✅ | T3 | `modules/matcher.js` | 通过（188行，错误处理优秀） |

---

### 第二批任务（已交付）

| ID | 任务 | 状态 | 负责人 | 依赖 | 文件 | 审查结果 |
|----|------|------|--------|------|------|----------|
| T5 | 页面生成引擎 | ✅ | T2 | T4 | `modules/generator.js` | 通过→已微修复（移除 buildModalHTML 死代码，`\|\|`→`??`） |
| T5b | 修复 parser.js 3 个问题 | ✅ | T2 | — | `modules/parser.js` | 通过（中英混合名/死代码/rawText 截断） |
| T6 | 工具页主控逻辑 | ✅ | T2 | T2,T3,T4,T5 | `app.js` | 通过（304行，状态机+完整事件绑定） |
| T7 | 工具页 UI 结构 | ✅ | T2 | T6 | `index.html` | 通过（左右分栏，CDN 依赖正确） |
| T8 | 工具页样式 | ✅ | T2 | T7 | `style.css` | 通过（含 151 行冗余生成页 CSS，T14 清理） |

---

### T3 并行任务（第二批 — 已交付）

| ID | 任务 | 状态 | 负责人 | 文件 | 审查结果 |
|----|------|------|--------|------|----------|
| T9 | 部署配置 | ✅ | T3 | `vercel.json` | 通过→已修复（移除 no-op rewrite 规则） |
| T10 | API 本地测试脚本 | ✅ | T3 | `api/test.js` | 通过（6套件，mock/真实双模，零依赖框架） |
| T11 | 提供 mock 数据 | ✅ | T3 | `modules/mock-profile.json` | 通过（88分匹配，4模块，满足 T5 输入规范） |

---

### 第三批任务（Phase 1 收尾）← 当前批次

| ID | 任务 | 状态 | 负责人 | 依赖 | 预计 | 描述 |
|----|------|------|--------|------|------|------|
| **T12** | 端到端集成测试 | ✅ | T2 | T1-T11 | 1.5h | 12 项全部通过：代码路径验证 + API 测试 102/102 + mock-profile 7/7 + vercel.json 合法 |
| **T13** | 清理 script.js | ✅ | T2 | T12 确认 | 0.25h | 已删除 `script.js`（14,171 字节），grep 确认无 HTML/JS 引用 |
| **T14** | 清理 style.css 死 CSS | ✅ | T2 | T12 确认 | 0.25h | 删除 152 行生成页样式（hero/bento/modal/响应式），保留 fadeInUp 供工具页使用，398→251 行 |
| **T15** | 部署就绪检查 | ✅ | T3 | T9,T10 | 0.5h | 运行 `node api/test.js --mock` 确认全绿（102/102），vercel.json 语法验证通过，环境变量清单确认 |

#### T12 E2E 测试清单

```
✅ 1. 打开 index.html（本地静态服务器）→ HTTP 200
✅ 2. 点击「使用默认简历」→ 显示简历徽章（技能数·经历数）
✅ 3. 粘贴 JD 文本 → 点击「生成匹配页」
✅ 4. 匹配阶段状态流转：IDLE→READY→MATCHING→GENERATING→PREVIEW
✅ 5. iframe 预览生成的展示页（blob URL + sandbox iframe）
✅ 6. 点击 Bento Card → 弹窗打开 → ESC/点击关闭（内联 JS）
✅ 7. 匹配报告显示分数/亮点/建议/技能差距
✅ 8. 点击「下载 HTML」→ Blob 下载 → 文件名含简历姓名
✅ 9. 错误路径：无简历点生成 → 错误提示 → 8s 后自动恢复
✅ 10. 错误路径：无 JD 点生成 → 错误提示
✅ 11. Ctrl+Enter 快捷生成（ctrlKey/metaKey + Enter）
✅ 12. 上传 resume.pdf → parseResumeFile → 显示提取信息
```

#### T13 清理确认

```
□ grep 确认 script.js 无任何 import/script 引用
□ 删除 script.js
```

#### T14 清理确认

```
□ 确认 generator.js 内联 CSS 包含 style.css L246-397 全部选择器
□ 删除 style.css 中「生成页样式」段（含 @media 响应式）
□ 工具页样式不受影响
```

#### T15 部署清单

```
✅ node api/test.js --mock → 所有 Suite 通过（102/102）
✅ vercel.json 为合法 JSON
⚠️ ANTHROPIC_API_KEY 本地未配置，vercel.json 通过 @anthropic-api-key 引用 Vercel secret（需在 Vercel Dashboard 配置）
✅ api/match.js 的 runtime 配置正确（nodejs20.x）
✅ CORS headers 覆盖 /api/* 路径（正则: /api/(.*)）
```

---

## 当前依赖关系图

```
✅ T1 ──→ ✅ T4 ──→ ✅ T5 ──→ ✅ T6 ──→ ✅ T7 ──→ ✅ T8
                    ↗          ↗
✅ T2 ────────────→          ↗
                    ↗        ↗
✅ T3 ────────────→          ↗

并行:
✅ T1 ──→ ✅ T9  ✅ T10  ✅ T11

收尾:
✅ T1-T11 ──→ ✅ T12 ──→ ✅ T13  ✅ T14
                  └───→ ✅ T15
```

---

## 文件状态总览

| 文件 | 状态 | 行数 | 说明 |
|------|------|------|------|
| `index.html` | ✅ | 103 | 工具页 UI，CDN 依赖 pdf.js + mammoth.js |
| `style.css` | ✅ | 251 | 工具页样式（生成页 CSS 已移至 generator.js，保留 fadeInUp） |
| `app.js` | ✅ | 304 | 主控逻辑，ESM 模块 |
| ~~`script.js`~~ | 🗑️ | — | 已删除（T13） |
| `modules/parser.js` | ✅ | 160 | PDF/DOCX 解析 |
| `modules/data.js` | ✅ | 93 | 默认简历数据 |
| `modules/matcher.js` | ✅ | 188 | AI 匹配前端 |
| `modules/generator.js` | ✅ | 386 | 页面生成引擎（已修复） |
| `modules/mock-profile.json` | ✅ | 123 | Mock 匹配结果 |
| `api/match.js` | ✅ | 272 | Serverless API 代理 |
| `api/test.js` | ✅ | 353 | 测试套件 |
| `vercel.json` | ✅ | 23 | 部署配置（已修复） |
| `assets/*` | ✅ | — | 静态资源（只读） |
| `resume.pdf` | ✅ | 394KB | 默认简历文件 |

---

## Phase 2 — 体验增强（T12 完成后启动）

| ID | 任务 | 优先级 | 预计 | 描述 |
|----|------|--------|------|------|
| P2.1 | 拖拽上传视觉反馈 | P1 | 0.5h | 拖入高亮 + 文件类型图标 + 文件大小校验 |
| P2.2 | Loading 骨架屏 | P1 | 0.5h | MATCHING/GENERATING 状态时显示 skeleton 动画 |
| P2.3 | 匹配度仪表盘 | P2 | 1h | SVG 圆环进度条 + 分段颜色 + 动画计数 |
| P2.4 | 生成历史（localStorage） | P2 | 1.5h | 保存最近 10 次生成，支持查看/重新下载/删除 |
| P2.5 | JD 智能抓取 | P3 | 2h | 粘贴 URL → 自动提取职位描述文本 |
| P2.6 | 移动端响应式完善 | P3 | 1h | 工具页移动端自适应 |

---

## 最后更新

2026-05-20 — T12-T15 全部完成。Phase 1 收尾：12 项 E2E 通过，script.js 删除，style.css 瘦身（398→251 行），部署就绪
