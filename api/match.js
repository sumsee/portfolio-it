/**
 * Serverless API 代理 — 简历-JD 匹配分析
 *
 * 部署到 Vercel Functions / Netlify Functions 时自动识别为 serverless endpoint。
 * 仅从环境变量 DEEPSEEK_API_KEY 读取 API Key，绝不硬编码或暴露给前端。
 *
 * POST /api/match
 * Body: { resumeData: object, jdText: string }
 * Response: GeneratedProfile JSON
 */

// DeepSeek API 端点 (OpenAI 兼容格式)
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

/**
 * 构建 system prompt — 定义 AI 角色和输出 schema
 */
function buildSystemPrompt() {
    return `你是一位资深 HR + 技术面试官，专精网络安全领域。你的任务是分析候选人简历与岗位 JD 的匹配度，并生成定制化的个人展示页内容。

## 输出要求

你必须**只返回合法 JSON**，不要包含任何其他文字、markdown 标记或代码块包裹。JSON 结构如下：

{
  "matchScore": number,        // 0-100 综合匹配度评分
  "summary": string,           // 1-2句话匹配总结（中文）
  "highlights": [
    {
      "skill": string,         // 匹配的技能/经验名称
      "relevance": "high" | "medium",
      "reason": string         // 为什么该技能与 JD 相关（简短）
    }
  ],
  "suggestions": string[],     // 3-5条简历改进建议（中文）
  "missingSkills": string[],   // JD 要求但候选人明显缺失的关键技能
  "tailoredContent": {
    "hero": {
      "name": string,          // 候选人姓名
      "tags": [                // 标签，根据 JD 精选最相关的
        { "text": string, "type": "cert" | "skill" | "highlight" }
      ],
      "subtitle": string       // 针对 JD 定制的1句话定位语
    },
    "sections": [              // 模块列表，按 JD 相关性排序
      {
        "id": string,          // "experience" | "skills" | "education" | "quality"
        "icon": string,        // 1个 emoji
        "title": string,       // 模块标题
        "subtitle": string,    // JD 定制副标题
        "priority": number,    // 排序权重，数字越小越靠前
        "items": [
          {
            "title": string,
            "content": string  // HTML 片段，使用现有 class：modal-list, highlight, success
          }
        ]
      }
    ]
  }
}

## 分析维度

1. **技能匹配**：逐条对比简历技能与 JD 要求，标注匹配程度
2. **经验相关度**：判断候选人项目/实习/工作经历是否契合 JD 场景
3. **缺失识别**：诚实列出 JD 中候选人明显不具备的关键要求
4. **内容定制**：重新组织简历内容，将与 JD 最相关的模块、经验、技能前置突出

## 定制原则

- hero.subtitle 必须融入 JD 中目标岗位的关键词
- hero.tags 选取与 JD 最匹配的3-5个标签
- sections 按与 JD 的相关性从高到低排列
- 每个 section 的 items 也应筛选/重排：与 JD 无关的内容可弱化或放后面
- content 中的 HTML 使用以下 class：
  - <ul class="modal-list"> 列表容器
  - <strong> 加粗关键词
  - <span class="highlight"> 高亮数字/亮点
  - <span class="success"> 成功/正面标记
- 所有文案使用中文`;
}

/**
 * 构建 user prompt — 传入简历数据和 JD
 */
function buildUserPrompt(resumeData, jdText) {
    return `## 候选人简历（结构化数据）

\`\`\`json
${JSON.stringify(resumeData, null, 2)}
\`\`\`

## 岗位 JD

${jdText}

请根据以上信息，输出匹配分析 JSON。`;
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
            max_tokens: 4096,
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
 * 兼容模型可能包裹 markdown 代码块的情况
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
 * 校验 GeneratedProfile 结构完整性
 */
function validateProfile(profile) {
    const errors = [];

    if (typeof profile.matchScore !== 'number' || profile.matchScore < 0 || profile.matchScore > 100) {
        errors.push('matchScore 必须是 0-100 的数字');
    }
    if (typeof profile.summary !== 'string' || !profile.summary.trim()) {
        errors.push('summary 不能为空');
    }
    if (!Array.isArray(profile.highlights)) {
        errors.push('highlights 必须是数组');
    }
    if (!Array.isArray(profile.suggestions)) {
        errors.push('suggestions 必须是数组');
    }
    if (!Array.isArray(profile.missingSkills)) {
        errors.push('missingSkills 必须是数组');
    }

    const tc = profile.tailoredContent;
    if (!tc || !tc.hero || typeof tc.hero.name !== 'string') {
        errors.push('tailoredContent.hero.name 必须是非空字符串');
    }
    if (!tc || !Array.isArray(tc.sections)) {
        errors.push('tailoredContent.sections 必须是数组');
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

    // 2. 输入验证
    const { resumeData, jdText } = req.body || {};

    if (!resumeData || typeof resumeData !== 'object' || Object.keys(resumeData).length === 0) {
        return res.status(400).json({
            error: 'Bad Request',
            message: '请提供非空的 resumeData（结构化简历数据）',
        });
    }

    if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
        return res.status(400).json({
            error: 'Bad Request',
            message: '请提供非空的 jdText（岗位描述文本）',
        });
    }

    // 3. 读取 API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error('DEEPSEEK_API_KEY 环境变量未设置');
        return res.status(500).json({
            error: 'Server Configuration Error',
            message: 'API Key 未配置，请联系管理员设置 DEEPSEEK_API_KEY 环境变量',
        });
    }

    // 4. 调用 DeepSeek API
    try {
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(resumeData, jdText.trim());
        const rawResponse = await callDeepSeekAPI(systemPrompt, userPrompt, apiKey);

        // 5. 解析 JSON
        let profile;
        try {
            profile = extractJSON(rawResponse);
        } catch (parseErr) {
            console.error('JSON 解析失败，原始响应:', rawResponse);
            return res.status(502).json({
                error: 'AI Response Parse Error',
                message: 'AI 返回内容格式异常，请重试',
            });
        }

        // 6. 校验结构
        const validationErrors = validateProfile(profile);
        if (validationErrors.length > 0) {
            console.error('结构校验失败:', validationErrors, '原始JSON:', JSON.stringify(profile));
            return res.status(502).json({
                error: 'AI Response Validation Error',
                message: 'AI 返回内容缺少必要字段，请重试',
                details: validationErrors,
            });
        }

        // 7. 返回匹配结果
        return res.status(200).json(profile);
    } catch (err) {
        console.error('DeepSeek API 调用失败:', err.message);

        // 区分认证错误
        if (err.message.includes('401') || err.message.includes('403')) {
            return res.status(500).json({
                error: 'Authentication Error',
                message: 'API Key 无效或已过期，请联系管理员更新',
            });
        }

        return res.status(502).json({
            error: 'AI Service Error',
            message: 'AI 服务暂时不可用，请稍后重试',
        });
    }
}
