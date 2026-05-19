# MODULE OWNERS — 模块归属与协作规则

> **核心原则**：一个文件同一时间只有一个 Agent 可以修改。跨文件改动按依赖顺序执行。

---

## 模块划分

### M1 — 工具页 UI 结构
| 属性 | 值 |
|------|-----|
| **文件** | `index.html`（重写） |
| **负责人** | **Frontend Agent（终端 2）** |
| **状态** | ⬜ 待开发（T7） |
| **修改范围** | HTML 骨架、表单控件（上传区/JD 输入区/按钮）、预览 iframe 容器、下载按钮 |

### M2 — 工具页样式
| 属性 | 值 |
|------|-----|
| **文件** | `style.css`（扩展） |
| **负责人** | **Frontend Agent（终端 2）** |
| **状态** | ⬜ 待开发（T8） |
| **修改范围** | 工具页表单/按钮/布局/loading/error 样式；**保留**现有 dark theme 样式 |

### M3 — 主控逻辑
| 属性 | 值 |
|------|-----|
| **文件** | `app.js`（新建） |
| **负责人** | **Frontend Agent（终端 2）** |
| **状态** | ⬜ 待开发（T6） |
| **接口规范** | 见 TASK_BOARD.md T6 定义 |

### M4 — 简历解析模块
| 属性 | 值 |
|------|-----|
| **文件** | `modules/parser.js` |
| **负责人** | **Frontend Agent（终端 2）** |
| **状态** | ✅ 已交付（需修复3个小问题 → T5b） |
| **实际实现** | pdf.js + mammoth.js 前端解析，正则提取结构化字段 |

### M5 — AI 匹配模块（前端调用侧）
| 属性 | 值 |
|------|-----|
| **文件** | `modules/matcher.js` |
| **负责人** | **API Agent（终端 3）** |
| **状态** | ✅ 已交付 |
| **实际实现** | MatchError 分层错误系统 + AbortController 超时 + 客户端轻量校验 |

### M6 — 页面生成引擎
| 属性 | 值 |
|------|-----|
| **文件** | `modules/generator.js`（新建） |
| **负责人** | **Frontend Agent（终端 2）** |
| **状态** | ⬜ 待开发（T5） |
| **接口规范** | 见 TASK_BOARD.md T5 定义 |

### M7 — 默认简历数据
| 属性 | 值 |
|------|-----|
| **文件** | `modules/data.js` |
| **负责人** | **Frontend Agent（终端 2）** |
| **状态** | ✅ 已交付 |
| **实际实现** | 93 行，从原始 script.js modalData 提取，含 name/skills/experience/education/certs/honors/summary |

### M8 — Serverless API 代理
| 属性 | 值 |
|------|-----|
| **文件** | `api/match.js` |
| **负责人** | **API Agent（终端 3）** |
| **状态** | ✅ 已交付 |
| **实际实现** | 272 行，Vercel/Netlify Function，完整输入校验 + JSON 解析 + 结构验证 |

### M9 — 静态资源
| 属性 | 值 |
|------|-----|
| **文件** | `assets/*` + `resume.pdf` |
| **负责人** | **共享**（只读引用，暂不修改） |

### M10 — 部署配置（新增）
| 属性 | 值 |
|------|-----|
| **文件** | `vercel.json` / `netlify.toml`（新建） |
| **负责人** | **API Agent（终端 3）** |
| **状态** | ⬜ 待开发（T9） |

### M11 — Mock 数据 + 测试（新增）
| 属性 | 值 |
|------|-----|
| **文件** | `modules/mock-profile.json` + `api/test.js`（新建） |
| **负责人** | **API Agent（终端 3）** |
| **状态** | ⬜ 待开发（T10, T11） |

---

## 文件冲突避免规则

```
1. 同一时间只有一个 Agent 修改一个文件
2. 新建文件前确认路径不在其他 Agent 的任务清单中
3. 跨模块联调顺序：M8(API) → M5(matcher) → M4(parser) → M7(data) → M6(generator) → M3(app.js) → M1(index.html) → M2(style.css)
4. Frontend Agent（T2）拥有 M1/M2/M3/M4/M6/M7 的写入权
5. API Agent（T3）拥有 M5/M8/M10/M11 的写入权
6. 任何 Agent 完成任务后在 TASK_BOARD.md 更新状态
7. 若需修改对方模块文件 → 先在 TASK_BOARD.md 添加任务并注明，由对方执行
```

---

## 实际贡献记录

| 日期 | Agent | 任务 | 文件 | 行数 |
|------|-------|------|------|------|
| 2026-05-20 | T3 | T1 | `api/match.js` | 272 |
| 2026-05-20 | T3 | T4 | `modules/matcher.js` | 188 |
| 2026-05-20 | T2 | T2 | `modules/parser.js` | 161 |
| 2026-05-20 | T2 | T3 | `modules/data.js` | 93 |

---

## 最后更新

2026-05-20 — Architect Agent 审查首批交付，新增 M10/M11，记录实际贡献
