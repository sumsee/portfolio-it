// api/generate-greeting.js — HR 打招呼话术生成
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { resume, jd, style } = req.body || {};

    if (!resume?.trim() || !jd?.trim()) {
      return res.status(400).json({ message: '请提供简历和 JD 内容' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: '服务端未配置 DEEPSEEK_API_KEY' });
    }

    const systemPrompt = `你是一个专业的求职顾问。根据以下规则生成 HR 打招呼话术。

【强制规则】
1. 身份：从简历内容判断求职者是应届生、在职跳槽还是转行人员，全文统一身份用词，不混用。
2. 能力佐证：每条能力描述必须跟在学历、专业证书、实习经历、工作项目或具体成果后面作为证据。严禁出现"熟练掌握""擅长""能力强"等无证据的空话。
3. 语序逻辑：问候 → 自我介绍和求职意向 → 核心匹配优势 → 收尾邀约。亮点前置。
4. 篇幅控制：精简版严格控制在 2-3 行，完整版严格控制在 4-5 行。不要超出行数。
5. JD 关键词植入：从 JD 中提取 2 到 3 个高频关键词（如岗位技能、工具名称、业务领域），自然嵌入话术。

【风格要求】
- 稳重正式：用词正式简洁，不用口语词。适用于国企、传统行业、体制相关岗位。
- 干练简洁：务实直接，突出实战能力和项目成果。适用于互联网、技术岗、创新型企业。
- 温和真诚：语气真诚自然，侧重沟通与执行力。适用于文职、服务类岗位。

请严格按照 JSON 格式返回三个版本，不要输出任何其他内容：
{"short": "精简版话术", "full": "完整版话术", "jd_matched": "JD强匹配版话术"}`;

    const userPrompt = `【简历内容】\n${resume}\n\n【JD 内容】\n${jd}\n\n【指定风格】\n${style || '干练简洁'}`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[generate-greeting] API error:', response.status, errText);
      return res.status(502).json({ message: `AI 服务异常 (${response.status})` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[generate-greeting] 空响应:', JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ message: 'AI 返回内容为空，请重试' });
    }

    // 解析 JSON
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error('[generate-greeting] JSON 解析失败:', content.slice(0, 300));
        return res.status(502).json({ message: 'AI 返回格式异常，请重试' });
      }
    }

    return res.status(200).json({
      short: parsed.short || '',
      full: parsed.full || '',
      jd_matched: parsed.jd_matched || '',
    });
  } catch (err) {
    console.error('[generate-greeting] 服务器错误:', err);
    return res.status(500).json({ message: '服务器内部错误' });
  }
}
