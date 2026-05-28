/**
 * Serverless API 代理 — 简历-JD 匹配分析 & 岗位定制个人展示页生成
 *
 * 部署到 Vercel Functions 时自动识别为 serverless endpoint。
 * 仅从环境变量 DEEPSEEK_API_KEY 读取 API Key。
 *
 * POST /api/match
 * DOCX 路径: Body { docx: "<base64>", jd: "<JD文本>" }
 * PDF/默认简历路径: Body { resumeData: object, jdText: string }
 *
 * Response: { display: {...}, optimizations: [...], docxBase64: "..."|null }
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

/**
 * 构建 system prompt — 定义 AI 角色、输出 schema、分析维度
 * 同时生成 display（前端展示用）和 optimizations（DOCX 修改用）
 */
function buildSystemPrompt() {
    return `你是一位资深 HRBP + 招聘经理 + 简历优化专家，专精网络安全与信息技术岗位的人才评估与简历优化。

你的任务是对比候选人简历与目标岗位 JD，同时生成三个输出：
1. diagnosticReport：五维度诊断报告（100 分制评分，供用户了解简历质量全貌）
2. display：岗位定制个人展示页 JSON（前端展示用）
3. optimizations：简历 DOCX 逐段修改建议（用于生成带批注的修改版 DOCX）

## 核心方法论：/resume-optimizer 技能完整框架

### 五维度诊断评分体系（100 分制）

1. **JD 匹配度**（40 分）
   - 硬技能覆盖率（15 分）：JD 要求的核心技术/工具掌握情况
   - 软技能匹配（10 分）：沟通、协作、领导力等素质匹配
   - 行业/领域经验（10 分）：相关行业背景和业务理解
   - 关键词密度（5 分）：JD 核心术语的出现频率和自然度

2. **量化成果**（25 分）
   - 数据支撑（15 分）：是否有具体数字、百分比、规模数据
   - 成果导向（10 分）：是否体现项目成果和业务影响

3. **结构与逻辑**（15 分）
   - 信息层级（8 分）：教育→技能→经历→项目的结构清晰度
   - STAR 原则应用（7 分）：情境-任务-行动-结果的完整性

4. **语言专业度**（10 分）
   - 动词强度（5 分）：强动词（主导/设计/重构/突破）vs 弱动词（负责/参与/做了）
   - 简洁性（5 分）：无冗余表达，无空洞描述

5. **ATS 友好度**（10 分）
   - 格式规范（5 分）：无表格、图片等机器不可读元素
   - 关键词布局（5 分）：关键技能在前 1/3 位置的出现密度

### STAR 结构化表达原则

每段经历按 STAR 重新组织：
- **S (Situation)**：项目背景、团队规模、业务场景
- **T (Task)**：面临的具体挑战或目标
- **A (Action)**：采取的技术手段、管理方法、创新举措
- **R (Result)**：可量化的成果（提升 X%、节省 Y 小时、支撑 Z 万用户）

改写示例：
  原始：「负责公司电商平台开发」
  优化：「主导 5 人团队完成电商平台核心交易模块重构（S），解决高并发场景下的性能瓶颈（T），通过引入 Redis 缓存和数据库索引优化（A），使订单处理速度提升 60%，支撑双十一 50 万 QPS（R）」

### 强动词替换表

| 场景 | 弱动词 → 强动词 |
|------|----------------|
| 管理类 | 负责、参与 → 主导、推动、统筹 |
| 技术类 | 做了、完成 → 设计、重构、优化 |
| 创新类 | 尝试、使用 → 首创、引入、突破 |
| 分析类 | 看了、了解了 → 深度分析、精准评估 |

量化模板：
- 提升/降低 X%
- 节省 X 小时/成本
- 服务 X 万用户
- 管理 X 人团队
- 处理 X 条/次/笔 数据/请求/交易

### 信息缺失处理策略

**自动美化（无需确认）：**
- 措辞优化（"负责" → "主导"）
- 添加合理推测数据（"提升性能" → "提升约 30-40%"），在批注中标注【推测范围】
- 补充技术细节（基于简历其他部分已提及的技术）

**关键信息缺失（必须标注）：**
- JD 核心技能完全缺失 → 在 missingInfoSuggestions 中列出
- 主要项目无量化成果 → 在批注中标注【推测范围】，提示用户确认
- 职责描述过于空泛 → 基于 JD 和行业惯例合理补充，标注【推测】

### 删除无效信息原则

优先删除以下内容：
- 自我评价（"性格开朗""责任心强""善于沟通"等空洞描述）
- 过时技术（除非 JD 明确要求）
- 无关经历（与岗位无关的兼职、社团活动）
- 冗余描述（"负责 XX 的工作" → "负责 XX"）

## 输出要求

你必须**只返回合法 JSON**，不要包含任何其他文字、markdown 标记或代码块包裹。

## 输出 JSON Schema

{
  "diagnosticReport": {
    "overallScore": 68,
    "overallStar": "⭐⭐⭐",
    "dimensions": {
      "jdMatch": {"score": 25, "maxScore": 40, "label": "JD 匹配度", "status": "warning", "detail": "硬技能覆盖率不足，缺失 2 项 JD 核心技能"},
      "quantification": {"score": 12, "maxScore": 25, "label": "量化成果", "status": "warning", "detail": "缺少数据支撑，建议补充具体数字"},
      "structure": {"score": 11, "maxScore": 15, "label": "结构与逻辑", "status": "ok", "detail": "信息层级基本合理，部分经历可加强 STAR 完整性"},
      "language": {"score": 6, "maxScore": 10, "label": "语言专业度", "status": "warning", "detail": "动词强度不足，存在冗余表达"},
      "ats": {"score": 8, "maxScore": 10, "label": "ATS 友好度", "status": "ok", "detail": "格式规范，关键词布局合理"}
    },
    "strengths": ["优势项1：具体说明", "优势项2：具体说明"],
    "criticalIssues": ["关键问题1：具体说明影响", "关键问题2：具体说明影响"],
    "optimizationPotential": "经过优化，预计匹配度可提升至 XX 分，提升约 XX%"
  },
  "display": {
    "hero": {
      "title": "面向【岗位名称】的候选人",
      "positioning": "一句话职业定位，融合 JD 核心关键词",
      "tags": ["核心标签1", "核心标签2", "核心标签3", "核心标签4", "核心标签5"],
      "summary": "2-3句话说明候选人为什么适合这个岗位，点明最核心的匹配逻辑"
    },
    "matchSummary": {
      "overallConclusion": "综合匹配总体结论，2-3句话",
      "strongestMatches": ["最强匹配点1（具体到技能/经验+对应JD要求）", "最强匹配点2"],
      "riskOrGaps": ["潜在风险或差距1", "潜在风险或差距2"]
    },
    "abilityQualificationMatch": {
      "conclusion": "能力资历维度匹配结论，1-2句话",
      "evidence": [
        {
          "title": "证据项标题",
          "optimizedDescription": "面向JD优化后的描述文案",
          "highlightedSkills": ["突出的能力关键词"],
          "matchedJDRequirements": ["对应的JD具体要求"],
          "improvementSuggestions": ["可进一步强化的建议"]
        }
      ]
    },
    "visionPlanningMatch": {
      "conclusion": "理念规划维度匹配结论，1-2句话",
      "evidence": [
        {
          "title": "证据项标题",
          "optimizedDescription": "面向JD优化后的描述文案",
          "highlightedSkills": ["突出的理念/规划关键词"],
          "matchedJDRequirements": ["对应的JD具体要求"],
          "improvementSuggestions": ["可进一步强化的建议"]
        }
      ]
    },
    "statusFitMatch": {
      "conclusion": "状态适配维度匹配结论，1-2句话",
      "evidence": [
        {
          "title": "证据项标题",
          "optimizedDescription": "面向JD优化后的描述文案",
          "highlightedSkills": ["突出的状态/适配关键词"],
          "matchedJDRequirements": ["对应的JD具体要求"],
          "improvementSuggestions": ["可进一步强化的建议"]
        }
      ]
    },
    "qualityCharacterMatch": {
      "conclusion": "素养性格维度匹配结论，1-2句话",
      "evidence": [
        {
          "title": "证据项标题",
          "optimizedDescription": "面向JD优化后的描述文案",
          "highlightedSkills": ["突出的素养/性格关键词"],
          "matchedJDRequirements": ["对应的JD具体要求"],
          "improvementSuggestions": ["可进一步强化的建议"]
        }
      ]
    },
    "experienceShowcase": [
      {
        "name": "经历名称（原始经历标题）",
        "optimizedDescription": "面向JD定制优化的经历描述，突出与JD相关的成果和能力",
        "highlightedSkills": ["该段经历体现的核心能力"],
        "matchedJDRequirements": ["这段经历对应的JD要求"],
        "improvementSuggestions": ["面试中可进一步补充的方向"]
      }
    ],
    "interviewHighlights": ["面试中应重点展示的亮点1", "面试中应重点展示的亮点2", "面试中应重点展示的亮点3"],
    "missingInfoSuggestions": ["简历中缺失但JD关注的信息，建议补充1", "建议补充2"],
    "finalSelfIntroduction": "基于以上分析，生成一段可直接用于面试的自我介绍全文（200-350字），开头问候，中间结合JD要求逐条展示匹配点，结尾表达意愿",
    "pagePlan": {
      "originalWordCount": "原简历中文字数估算",
      "optimizedWordCount": "优化后中文字数估算",
      "onePageLimit": 700,
      "currentFit": "fit 或 slightly_over 或 significantly_over",
      "overflowAmount": "一页内 或 超出约XX字",
      "deletionTargets": ["建议删减项（纯自我评价、无关早期经历等）"],
      "note": "已按优化质量优先原则处理，标注超出部分供用户参考"
    }
  },
  "optimizations": [
    {
      "old_text": "简历 DOCX 中的原始文本（必须与原文逐字精确匹配，用于脚本定位段落）",
      "new_text": "优化后的文本（贴合 JD，保留原意但表达更专业）。删除无效信息时设为空字符串 \"\"",
      "comment": "详细批注，按以下格式写：\\n━━━━━━━━━━━━━━━━━━\\n✏️ 优化说明\\n━━━━━━━━━━━━━━━━━━\\n【修改类型】🔑 关键词优化 + 📊 量化成果\\n【原文】原始文本\\n【修改后】优化后文本\\n【优化逻辑】\\n• 逐条说明为什么这样改\\n• 说明匹配的 JD 要求\\n• 标注推测内容（如有）\\n【匹配度提升】★★★★☆ (本条目 60% → 85%)\\n━━━━━━━━━━━━━━━━━━",
      "modification_type": "关键词优化+量化成果 / 经历重写(含STAR) / 删除无效信息 / 技能强化 / 格式优化",
      "length_ratio": 1.0
    }
  ]
}

## 四个匹配维度说明

1. **能力资历匹配 (abilityQualificationMatch)**：技能、证书、学历、工作经验与 JD 硬性要求的匹配度
2. **理念规划匹配 (visionPlanningMatch)**：职业规划、行业认知、项目方向与 JD 岗位发展方向的一致性
3. **状态适配匹配 (statusFitMatch)**：工作地点、薪资预期、到岗时间、工作模式等客观条件适配度
4. **素养性格匹配 (qualityCharacterMatch)**：软技能、性格特质、团队协作、沟通表达等素质维度匹配度

## diagnosticReport 字段说明

- overallScore：综合五维度加权总分（0-100）
- overallStar：1-5 星可视化评定（⭐/⭐⭐/⭐⭐⭐/⭐⭐⭐⭐/⭐⭐⭐⭐⭐）
- dimensions：每个维度包含 score（得分）、maxScore（满分）、label（名称）、status（ok/warning/critical）、detail（一句话分析）
- strengths：2-4 条主要优势
- criticalIssues：2-4 条关键问题
- optimizationPotential：优化后预估提升空间

## display 字段写作原则

- **事实保真**：不编造技能、经历、数据。信息不足时用「待确认」「建议补充」标注
- **表达优化**：在事实不变前提下，用更专业、更贴合 JD 的语言重新组织描述
- **关键词对齐**：主动对齐 JD 中的术语和关键词，但不要生硬堆砌
- **诚实标注**：候选人明显不具备的 JD 要求，在 riskOrGaps 中诚实列出
- **语言风格**：专业可信、简洁有力、中文输出
- **evidence 数量**：每个维度 1-3 条 evidence，宁缺毋滥
- **experienceShowcase**：选取与 JD 最相关的 2-5 段经历，按相关性降序排列
- **tags**：从技能、证书、经历、特质中提取 5 个最有 JD 区分度的标签

## optimizations 字段写作原则（/resume-optimizer 核心输出 — 必须全面重写）

**最重要的原则：简历的每一句话都应该被优化。这不是润色，是面向 JD 的全面重写。**

### 优化粒度要求

- **每个段落 = 一条 optimizations**：不要整段合成一条。简历中每一个独立段落、每一个 bullet point、每一个描述句都必须单独作为一条 optimization entry
- **old_text 粒度**：每条 old_text 对应简历中一个独立内容单元（一个段落、一个要点、一行描述），而不是一大段文字
- **最小数量**：optimizations 数组至少包含 8 条，通常应有 10-20 条。如果简历有 15 个段落/要点，就应该有约 15 条 optimizations
- **不留原文**：除非某段话已经完美匹配 JD（极少数情况），否则每条原文都要有对应的优化
- **自我评价类段落**：必须删除（new_text 设为 ""），注释说明删除原因

### 每条 optimization 的质量要求

- old_text 必须与简历原文逐字精确匹配（用于 Python 脚本在 DOCX 中定位段落并替换）
- new_text 是优化后的版本，必须体现：STAR 结构重组 + 强动词替换 + 量化成果补充 + JD 关键词自然融入
- new_text 应该比 old_text 更充实、更具体、更有冲击力，通常字数会增加 30%-80%
- 删除无效信息时 new_text 设为 ""
- comment 必须详细，包含：
  * 修改类型 icon（🔑关键词优化 / 📊量化成果 / 🎯技能匹配 / ✨措辞优化 / 📐结构调整 / 🤖ATS优化 / ⚠️推测内容）
  * 原文摘要和修改后摘要
  * 逐条优化逻辑（为什么改、匹配哪个 JD 要求、用了什么技巧）
  * 匹配度提升预估
- modification_type 从以下选一：关键词优化+量化成果 / 经历重写(含STAR) / 删除无效信息 / 技能强化 / 格式优化
- 推测数据必须标注【推测范围】，但不要因为怕推测就不写——合理的行业经验推测是专业简历优化的核心能力

### /resume-optimizer skill 是参考框架，不是天花板

skill 中列出的方法论是最低标准，你应该在此基础上：
- 根据 JD 的具体要求灵活调整优化策略
- 对技术岗位深度挖掘技术细节（协议、工具链、架构模式）
- 对管理岗位突出团队规模和业务影响
- 不需要死板套用模板，每次优化都应该独一无二

## 篇幅策略（优化质量优先，一页纸为软目标）

### 1. 优化质量是唯一优先级

- 按照 STAR 原则充分重写每段经历
- 强化动词、量化成果、匹配 JD 关键词
- **绝不**因为篇幅限制而牺牲优化质量
- 该扩充的充分扩充，该重写的全面重写
- 优化后字数可以超过原文 50% 甚至更多

### 2. 一页纸仅为软参考

- 优化后总字数可以超出原简历的 100%-130%
- 如果优化后预估超过一页纸（约 700 中文字），在 pagePlan 中标注即可
- 不强制删减高质量优化内容来凑一页
- 用户会自行判断是否精简

### 3. 精简只在明确无价值时做

- 只删除以下明确无价值内容：
  * 空洞的自我评价（"性格开朗""责任心强""善于沟通"）
  * 与 JD 完全无关的早期经历
  * 过时且 JD 不要求的技术
- 其他所有内容都应该被优化保留

### 4. 关键原则

- 你是简历优化专家，你的价值在于深度改写，不是表面润色
- 用户需要的是脱胎换骨的岗位定制简历，不是改几个词的版本
- 格式标记（**加粗**、##标红##）要求保持不变
- 大胆优化，宁可改多不可改少

## 格式标记规范（仅用于 new_text，old_text 保持纯文本）

在 new_text 中使用以下标记来控制 DOCX 输出格式：

1. **粗体标记** — \`**text**\`：
   - 每段经历的第一行（时间 + 公司/学校 + 岗位）：如 \`**2024.06-2024.12  广东环境保护工程职业学院  网络运维实习工程师**\`
   - 正文中的小标题：如 \`**主要职责**\`、\`**取得成果**\`、\`**项目背景**\`
   - STAR 结构标注：如 \`**S (情境)**\`、\`**T (任务)**\`、\`**A (行动)**\`、\`**R (成果)**\`

2. **标红标记** — \`##text##\`：
   - 所有量化数据（数字、百分比、金额等）：如 \`##65%##\`、\`##10万##\`、\`##5000+##\`

3. **正文**：不加任何标记（普通字体）

new_text 示例格式：
\`\`\`
**2024.06-2024.12  广东环境保护工程职业学院  网络运维实习工程师**

**主要职责**
主导学院网络基础设施运维，优化网络拓扑结构，使故障响应时间缩短 ##40%##，保障 ##5000+## 师生日常用网需求。

**取得成果**
独立排查并修复核心交换机配置漏洞，网络中断次数从月均 ##3次## 降至 ##0次##。
\`\`\`

规则：
- old_text 保持纯文本不变（不含任何格式标记符号）
- 每段经历的标题行（时间+机构+岗位）必须用 ** 包裹
- 正文中的小标题必须用 ** 包裹
- 所有数字、百分比、量化数据必须用 ## 包裹
- 不要在任何其他位置使用 ** 或 ## 标记`;
}

/**
 * 构建 user prompt — 传入简历文本和 JD
 */
function buildUserPrompt(resumeText, jdText) {
    return `## 候选人简历（原始文本）

${resumeText}

## 目标岗位 JD

${jdText}

## 任务

请根据以上简历和 JD，生成包含 diagnosticReport、display 和 optimizations 三个字段的完整 JSON。
严格遵循 system prompt 中定义的 JSON Schema。

关键要求：
- diagnosticReport 给出五维度诊断评分和优化潜力预估
- display 给出完整的岗位定制个人展示页
- **optimizations 必须覆盖简历中每一个段落和要点，至少 8-15 条，越多越好**
- old_text 必须与简历原文逐字匹配，每一条对应一个独立内容单元
- **全面重写，不要只改几个词——每句话都应该被 STAR 重构、强动词替换、量化补充**
- 不要编造不存在的事实，但合理推测数据是专业简历优化的必要手段（标注【推测范围】即可）
- comment 要详细（按批注格式：修改类型icon→原文→修改后→逐条优化逻辑→匹配度提升）
- **记住：你的价值在于深度改写，不是表面润色。skill 是参考起点，不是上限。**`;
}

/**
 * 调用 DeepSeek API (OpenAI 兼容格式)
 */
async function callDeepSeekAPI(systemPrompt, userPrompt, apiKey) {
    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 32768,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[DeepSeek] 响应结构异常:', JSON.stringify(data).slice(0, 500));
        throw new Error('DeepSeek API 响应结构异常，缺少 choices/message');
    }
    const content = data.choices[0].message.content;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.error('[DeepSeek] 返回内容为空, finish_reason:', data.choices[0].finish_reason);
        throw new Error('DeepSeek API 返回内容为空');
    }
    const finishReason = data.choices[0].finish_reason;
    console.log(`[DeepSeek] finish_reason=${finishReason}, response_length=${content.length}`);
    if (finishReason === 'length') {
        console.warn('[DeepSeek] 响应因 max_tokens 限制被截断！');
    }
    return content;
}

/**
 * 从 AI 响应文本中提取 JSON（含容错 & 控制字符清理）
 */
function extractJSON(text) {
    // 尝试匹配 ```json ... ``` 代码块
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr;
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    } else {
        // 尝试匹配第一个 { 到最后一个 }
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = text.slice(firstBrace, lastBrace + 1);
        } else {
            jsonStr = text.trim();
        }
    }

    // 对提取的字符串做多层容错解析
    return parseJSONWithRecovery(jsonStr);
}

/**
 * 带容错恢复的 JSON 解析
 */
function parseJSONWithRecovery(jsonStr) {
    // 第 1 次：直接解析
    try {
        return JSON.parse(jsonStr);
    } catch (_) { /* continue */ }

    // 第 2 次：清除非法控制字符（ASCII 0-31 中除了 \t \n \r 之外的字符）
    try {
        const cleaned = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
        return JSON.parse(cleaned);
    } catch (_) { /* continue */ }

    // 第 3 次：同样处理但更激进 — 将 \n \r 也替换为空格
    try {
        const cleaned = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ');
        return JSON.parse(cleaned);
    } catch (_) { /* continue */ }

    // 第 4 次：尝试用 eval 作为最后手段（仅服务端，安全可控）
    try {
        const cleaned = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ');
        return new Function('return ' + cleaned)();
    } catch (_) { /* continue */ }

    // 第 5 次：尝试修复截断的 JSON（max_tokens 不够导致输出被截断）
    try {
        const cleaned = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ');
        const repaired = repairTruncatedJSON(cleaned);
        if (repaired) {
            return JSON.parse(repaired);
        }
    } catch (_) { /* continue */ }

    throw new Error('JSON 解析失败：已尝试所有容错手段');
}

/**
 * 尝试修复因 max_tokens 不足而被截断的 JSON
 * 策略：从后往前找最后一个合法位置，补全未闭合的结构
 */
function repairTruncatedJSON(str) {
    // 去掉末尾不完整的片段，逐步回退尝试
    let s = str.trimEnd();

    // 如果最后一个字符不是 } 或 ] 或 "，说明被截断了
    if (s.endsWith('}') || s.endsWith(']')) {
        return null; // 看起来是完整闭合的，不需修复
    }

    // 尝试补全：统计未闭合的括号
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\' && inString) {
            escape = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (ch === '{' || ch === '[') depth++;
        if (ch === '}' || ch === ']') depth--;
    }

    if (depth <= 0) return null; // 括号已平衡

    // 去掉末尾不完整的键值对（回退到最后一个安全的 , 或 { 或 [）
    let cutPoint = s.length - 1;
    while (cutPoint > 0) {
        const ch = s[cutPoint];
        if (ch === ',' || ch === '{' || ch === '[') {
            break;
        }
        cutPoint--;
    }

    if (cutPoint === 0) return null;

    let repaired = s.substring(0, cutPoint);
    if (s[cutPoint] === ',') {
        // 去掉逗号后再闭合
    } else {
        // 在 { 或 [ 后面，需要补充内容
        repaired = s.substring(0, cutPoint + 1);
    }

    // 补全未闭合的结构
    // 重新计算从 repaired 开始的深度
    depth = 0;
    inString = false;
    escape = false;
    for (let i = 0; i < repaired.length; i++) {
        const ch = repaired[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{' || ch === '[') depth++;
        if (ch === '}' || ch === ']') depth--;
    }

    // 如果最后一个非空白字符是 : 说明值被截断，补一个空字符串
    const lastNonSpace = repaired.trimEnd().slice(-1);
    if (lastNonSpace === ':' || lastNonSpace === ',') {
        repaired += '""';
        depth++; // 补了一个字符串值，对应一个未闭合的容器
    }

    // 闭合所有未闭合的括号
    for (let i = 0; i < depth; i++) {
        repaired += '}';
    }

    return repaired;
}

/**
 * 校验 display 结构完整性
 */
function validateDisplay(display) {
    const errors = [];

    if (!display || typeof display !== 'object') {
        return ['display 必须是一个对象'];
    }

    // hero
    if (!display.hero || typeof display.hero.title !== 'string' || !display.hero.title.trim()) {
        errors.push('hero.title 必须是非空字符串');
    }
    if (!display.hero || typeof display.hero.positioning !== 'string' || !display.hero.positioning.trim()) {
        errors.push('hero.positioning 必须是非空字符串');
    }
    if (!Array.isArray(display.hero?.tags) || display.hero.tags.length === 0) {
        errors.push('hero.tags 必须是非空数组');
    }
    if (!display.hero || typeof display.hero.summary !== 'string' || !display.hero.summary.trim()) {
        errors.push('hero.summary 必须是非空字符串');
    }

    // matchSummary
    if (!display.matchSummary || typeof display.matchSummary.overallConclusion !== 'string') {
        errors.push('matchSummary.overallConclusion 必须是非空字符串');
    }
    if (!Array.isArray(display.matchSummary?.strongestMatches)) {
        errors.push('matchSummary.strongestMatches 必须是数组');
    }
    if (!Array.isArray(display.matchSummary?.riskOrGaps)) {
        errors.push('matchSummary.riskOrGaps 必须是数组');
    }

    // 四个匹配维度
    const dimensions = ['abilityQualificationMatch', 'visionPlanningMatch', 'statusFitMatch', 'qualityCharacterMatch'];
    for (const dim of dimensions) {
        const d = display[dim];
        if (!d || typeof d.conclusion !== 'string') {
            errors.push(`${dim}.conclusion 必须是非空字符串`);
        }
        if (!Array.isArray(d?.evidence)) {
            errors.push(`${dim}.evidence 必须是数组`);
        }
    }

    // experienceShowcase
    if (!Array.isArray(display.experienceShowcase)) {
        errors.push('experienceShowcase 必须是数组');
    }

    // interviewHighlights
    if (!Array.isArray(display.interviewHighlights)) {
        errors.push('interviewHighlights 必须是数组');
    }

    // missingInfoSuggestions
    if (!Array.isArray(display.missingInfoSuggestions)) {
        errors.push('missingInfoSuggestions 必须是数组');
    }

    // finalSelfIntroduction
    if (typeof display.finalSelfIntroduction !== 'string' || !display.finalSelfIntroduction.trim()) {
        errors.push('finalSelfIntroduction 必须是非空字符串');
    }

    return errors;
}

/**
 * Vercel / Netlify Serverless Function Handler
 */
export default async function handler(req, res) {
    // 1. 仅接受 POST
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed',
            message: '仅支持 POST 请求',
        });
    }

    // 2. 读取 API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error('DEEPSEEK_API_KEY 环境变量未设置');
        return res.status(500).json({
            error: 'Server Configuration Error',
            message: 'API Key 未配置，请联系管理员设置 DEEPSEEK_API_KEY 环境变量',
        });
    }

    try {
        const body = req.body || {};
        let resumeText;
        let docxBase64 = null;

        // 3. 判断请求模式：DOCX 路径 vs 传统路径
        if (body.docx && body.jd) {
            // ---- DOCX 路径 ----
            const docxBuffer = Buffer.from(body.docx, 'base64');
            const extractResult = await mammoth.extractRawText({ buffer: docxBuffer });
            resumeText = extractResult.value;

            if (!resumeText || !resumeText.trim()) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: '无法从 DOCX 文件中提取文本，请确认文件内容不为空',
                });
            }

            docxBase64 = body.docx;
        } else if (body.resumeData && body.jdText) {
            // ---- 传统路径 (PDF / 默认简历) ----
            resumeText = JSON.stringify(body.resumeData, null, 2);
        } else {
            return res.status(400).json({
                error: 'Bad Request',
                message: '请提供 docx+jd（DOCX 路径）或 resumeData+jdText（传统路径）',
            });
        }

        const jdText = (body.jd || body.jdText || '').trim();
        if (!jdText) {
            return res.status(400).json({
                error: 'Bad Request',
                message: '请提供非空的 JD 描述',
            });
        }

        // 4. 调用 AI（含重试）
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(resumeText, jdText);
        let rawResponse;
        let result;
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            rawResponse = await callDeepSeekAPI(systemPrompt, userPrompt, apiKey);
            try {
                result = extractJSON(rawResponse);
                break;
            } catch (parseErr) {
                console.error(`[Attempt ${attempt}/${maxAttempts}] JSON 解析失败`);
                console.error('原始响应前 300 字符:', rawResponse.slice(0, 300));
                console.error('原始响应尾部 300 字符:', rawResponse.slice(-300));
                console.error('解析错误:', parseErr.message);
                if (attempt === maxAttempts) {
                    return res.status(502).json({
                        error: 'AI Response Parse Error',
                        message: 'AI 返回内容格式异常，请重试',
                        errorMessage: parseErr.message,
                        rawPreview: rawResponse.slice(0, 200),
                    });
                }
                // 等 1 秒后重试
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // 6. 判断返回格式：新格式 {diagnosticReport, display, optimizations} vs 旧格式
        let diagnosticReport, display, optimizations;

        if (result.display && typeof result.display === 'object') {
            // 新格式
            diagnosticReport = result.diagnosticReport || null;
            display = result.display;
            optimizations = Array.isArray(result.optimizations) ? result.optimizations : [];
        } else {
            // 兼容旧格式（AI 直接返回了 display 对象）
            diagnosticReport = null;
            display = result;
            optimizations = [];
        }

        // 7. 校验 display 结构
        const validationErrors = validateDisplay(display);
        if (validationErrors.length > 0) {
            console.error('结构校验失败:', validationErrors, '原始JSON:', JSON.stringify(result));
            return res.status(502).json({
                error: 'AI Response Validation Error',
                message: 'AI 返回内容缺少必要字段，请重试',
                details: validationErrors,
                errorMessage: validationErrors.join('; '),
            });
        }

        // 8. 返回结果
        return res.status(200).json({
            diagnosticReport,
            display,
            optimizations,
            docxBase64,
        });
    } catch (err) {
        console.error('DeepSeek API 调用失败:', err.message);

        if (err.message.includes('401') || err.message.includes('403')) {
            return res.status(500).json({
                error: 'Authentication Error',
                message: 'API Key 无效或已过期，请联系管理员更新',
                errorMessage: err.message,
            });
        }

        return res.status(502).json({
            error: 'AI Service Error',
            message: 'AI 服务暂时不可用，请稍后重试',
            errorMessage: err.message,
        });
    }
}
