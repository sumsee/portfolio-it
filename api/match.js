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
    return `你是一位资深 HRBP + 招聘经理，专精网络安全与信息技术岗位的人才评估。
你的任务是对比候选人简历与目标岗位 JD，同时生成两个输出：
1. display：岗位定制个人展示页 JSON（前端展示用）
2. optimizations：简历 DOCX 逐段修改建议（用于生成带批注的修改版 DOCX）

## 输出要求

你必须**只返回合法 JSON**，不要包含任何其他文字、markdown 标记或代码块包裹。

## 输出 JSON Schema

{
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
      "originalWordCount": 原简历中文字数估算,
      "onePageLimit": 650,
      "currentFit": "一页内 或 超出一页约XX字",
      "deletionTargets": ["可删减内容1", "可删减内容2"],
      "strategy": "篇幅策略说明，如何控制在一页内"
    }
  },
  "optimizations": [
    {
      "old_text": "简历 DOCX 中的原始文本（必须与原文逐字精确匹配，用于脚本定位段落）",
      "new_text": "优化后的文本（贴合 JD，保留原意但表达更专业）。删除无效信息时设为空字符串 """,
      "comment": "详细批注，包含：修改类型、原文摘要、修改后摘要、优化逻辑说明、匹配度提升分析",
      "modification_type": "关键词优化+量化成果 / 经历重写 / 删除无效信息 / 技能强化 / 格式优化",
      "length_ratio": 1.0
    }
  ]
}

## 四个匹配维度说明

1. **能力资历匹配 (abilityQualificationMatch)**：技能、证书、学历、工作经验与 JD 硬性要求的匹配度
2. **理念规划匹配 (visionPlanningMatch)**：职业规划、行业认知、项目方向与 JD 岗位发展方向的一致性
3. **状态适配匹配 (statusFitMatch)**：工作地点、薪资预期、到岗时间、工作模式等客观条件适配度
4. **素养性格匹配 (qualityCharacterMatch)**：软技能、性格特质、团队协作、沟通表达等素质维度匹配度

## display 字段写作原则

- **事实保真**：不编造技能、经历、数据。信息不足时用「待确认」「建议补充」标注
- **表达优化**：在事实不变前提下，用更专业、更贴合 JD 的语言重新组织描述
- **关键词对齐**：主动对齐 JD 中的术语和关键词，但不要生硬堆砌
- **诚实标注**：候选人明显不具备的 JD 要求，在 riskOrGaps 中诚实列出
- **语言风格**：专业可信、简洁有力、中文输出
- **evidence 数量**：每个维度 1-3 条 evidence，宁缺毋滥
- **experienceShowcase**：选取与 JD 最相关的 2-5 段经历，按相关性降序排列
- **tags**：从技能、证书、经历、特质中提取 5 个最有 JD 区分度的标签

## optimizations 字段写作原则

- old_text 必须与简历原文逐字精确匹配（用于 Python 脚本在 DOCX 中定位段落并替换）
- new_text 是优化后的版本，保留原意但更贴合 JD 的关键词和表达方式
- 删除无效信息（如自我评价、与 JD 无关的过时技术等）时 new_text 设为 ""
- comment 要详细，按以下格式写：修改类型 → 原文摘要 → 修改后摘要 → 优化逻辑 → 匹配度提升
- modification_type 从以下选一：关键词优化+量化成果 / 经历重写 / 删除无效信息 / 技能强化 / 格式优化
- 覆盖简历中所有主要经历段落和个人描述部分
- 不要编造不存在的内容
- optimizations 数组至少包含 3 条优化建议

## 一页纸约束（必须遵守）

- **硬性限制**：优化后的简历总内容必须能放入 A4 一页纸（约 500-700 字中文）
- **篇幅控制**：每段经历的 new_text 长度不超过 old_text 长度的 110%（length_ratio）
- **精简优先**：如果原文已详细，只做措辞优化，不扩充字数
- **原则**：优先"替换和精简"，而非"新增和扩充"
- **不新增**：不新增简历中不存在的经历、项目或职责
- **删减优先级**：如必须删减，优先删除 — 自我评价 > 过时技术 > 与 JD 无关的经历 > 冗余描述

## 格式标记规范（仅用于 new_text，old_text 保持纯文本）

在 new_text 中使用以下标记来控制 DOCX 输出格式：

1. **粗体标记** — \`**text**\`：
   - 每段经历的第一行（时间 + 公司/学校 + 岗位）：如 \`**2024.06-2024.12  广东环境保护工程职业学院  网络运维实习工程师**\`
   - 正文中的小标题：如 \`**主要职责**\`、\`**取得成果**\`、\`**项目背景**\`

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

请根据以上简历和 JD，生成包含 display 和 optimizations 两个字段的完整 JSON。
严格遵循 system prompt 中定义的 JSON Schema。

关键要求：
- old_text 必须与简历原文逐字匹配
- 覆盖主要经历段落
- 不要编造不存在的内容
- comment 要详细说明优化逻辑`;
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
            max_tokens: 8192,
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
    return data.choices[0].message.content;
}

/**
 * 从 AI 响应文本中提取 JSON
 */
function extractJSON(text) {
    // 尝试匹配 ```json ... ``` 代码块
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1].trim());
    }

    // 尝试匹配第一个 { 到最后一个 }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }

    // 直接尝试解析
    return JSON.parse(text.trim());
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

        // 4. 调用 AI
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(resumeText, jdText);
        const rawResponse = await callDeepSeekAPI(systemPrompt, userPrompt, apiKey);

        // 5. 解析 JSON（含容错）
        let result;
        try {
            result = extractJSON(rawResponse);
        } catch (parseErr) {
            console.error('JSON 解析失败，原始响应:', rawResponse);
            return res.status(502).json({
                error: 'AI Response Parse Error',
                message: 'AI 返回内容格式异常，请重试',
                errorMessage: parseErr.message,
            });
        }

        // 6. 判断返回格式：新格式 {display, optimizations} vs 旧格式（直接是 display）
        let display, optimizations;

        if (result.display && typeof result.display === 'object') {
            // 新格式
            display = result.display;
            optimizations = Array.isArray(result.optimizations) ? result.optimizations : [];
        } else {
            // 兼容旧格式（AI 直接返回了 display 对象）
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
