// app.js — 简历智能分析主控逻辑
// 前端直接调用 DeepSeek API，无需后端

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = 'sk-88d41f720f3f45259766450b686fd7b0';

// ---- 简历分析 System Prompt ----
const MATCH_SYSTEM_PROMPT = `你是一位资深 HRBP + 招聘经理 + 简历优化专家。
对比候选人简历与目标岗位 JD，同时生成三个输出：
1. diagnosticReport：五维度诊断报告（100分制）
2. display：岗位定制个人展示页 JSON
3. optimizations：简历逐段修改建议

## 五维度评分（100分制）
1. JD匹配度（40分）：硬技能覆盖率15 + 软技能匹配10 + 行业经验10 + 关键词密度5
2. 量化成果（25分）：数据支撑15 + 成果导向10
3. 结构与逻辑（15分）：信息层级8 + STAR原则7
4. 语言专业度（10分）：动词强度5 + 简洁性5
5. ATS友好度（10分）：格式规范5 + 关键词布局5

## STAR 原则
每段经历按 S(情境)-T(任务)-A(行动)-R(成果) 重组
弱动词→强动词：负责→主导，做了→设计，尝试→引入

## 低分策略（overallScore<60时强制执行）
对每段经历分级：
- A级（强相关）：STAR完整重写至4-6要点，大量植入JD关键词，补充量化数据，experienceShowcase置顶
- B级（弱相关）：保留2-3要点，适当植入关键词，居中展示
- C级（不相关）：压缩至1-2行，删除无关细节，末尾展示

## 删除原则
删除：空洞自我评价、过时技术、无关经历、冗余描述

## 输出要求
只返回合法 JSON，不要任何其他文字。

## JSON Schema
{
  "diagnosticReport": {
    "overallScore": 68,
    "overallStar": "⭐⭐⭐",
    "dimensions": {
      "jdMatch": {"score": 25, "maxScore": 40, "label": "JD 匹配度", "status": "warning", "detail": "..."},
      "quantification": {"score": 12, "maxScore": 25, "label": "量化成果", "status": "warning", "detail": "..."},
      "structure": {"score": 11, "maxScore": 15, "label": "结构与逻辑", "status": "ok", "detail": "..."},
      "language": {"score": 6, "maxScore": 10, "label": "语言专业度", "status": "warning", "detail": "..."},
      "ats": {"score": 8, "maxScore": 10, "label": "ATS 友好度", "status": "ok", "detail": "..."}
    },
    "strengths": ["优势1", "优势2"],
    "criticalIssues": ["问题1", "问题2"],
    "optimizationPotential": "预计可提升至 XX 分"
  },
  "display": {
    "hero": {"title": "...", "positioning": "...", "tags": ["标签1","标签2","标签3","标签4","标签5"], "summary": "..."},
    "matchSummary": {"overallConclusion": "...", "strongestMatches": ["..."], "riskOrGaps": ["..."]},
    "abilityQualificationMatch": {"conclusion": "...", "evidence": [{"title":"...","optimizedDescription":"...","highlightedSkills":["..."],"matchedJDRequirements":["..."],"improvementSuggestions":["..."]}]},
    "visionPlanningMatch": {"conclusion": "...", "evidence": [...]},
    "statusFitMatch": {"conclusion": "...", "evidence": [...]},
    "qualityCharacterMatch": {"conclusion": "...", "evidence": [...]},
    "experienceShowcase": [{"name":"岗位名称 · 公司","fullVersion":"2~4条要点，每条以维度标签开头（加粗标签+STAR结构+强动词+量化+JD原词）","conciseVersion":"整合为2条，每条带小标题（用·连接两个维度关键词）","matchNote":"小字说明：为什么这样写+承接了JD哪些维度+关键词原样落地说明+量化数据为推测范围"}],
    "interviewHighlights": ["亮点1","亮点2","亮点3"],
    "missingInfoSuggestions": ["建议1","建议2"],
    "finalSelfIntroduction": "200-350字自我介绍",
    "pagePlan": {"originalWordCount":"...","optimizedWordCount":"...","onePageLimit":700,"currentFit":"fit","overflowAmount":"...","deletionTargets":["..."],"note":"..."}
  },
  "optimizations": [
    {"old_text": "简历原文逐字匹配", "new_text": "优化后文本", "comment": "修改说明", "modification_type": "关键词优化+量化成果", "length_ratio": 1.0}
  ]
}

## 关键要求
- diagnosticReport 五维度评分
- display 完整展示页
- optimizations 覆盖每个段落，至少8-15条
- old_text 必须与原文逐字精确匹配
- 全面重写不是表面润色

## experienceShowcase 经历重写规则（最高优先级）

对简历中每段经历，执行以下流程：

### 核心铁律
1. **岗位名锚定，原文不参照**：仅读取每段经历的「岗位名称」，完全不参照原有描述，内容根据 JD + 该岗位真实工作场景从零编写。
2. **JD驱动全维度覆盖**：把JD拆成能力维度清单，确保每个核心维度都有经历承接。匹配度最高的岗位承担最重内容。
3. **JD关键词原样保留**：JD写什么词，经历里就用什么词，禁止同义替换，确保ATS精准命中。
4. **量化成果**：每条尽量带数字（提升X%、节省X小时、服务X万用户、管理X人团队等），推测数据标注【推测范围】。

### 写作规范
- 每条要点内隐含STAR结构，突出"行动+成果"
- 强动词化：负责→主导，做了→设计，尝试→引入
- JD关键词原样嵌入，结合上下文自然表达，严禁堆砌

### 输出结构（每段经历严格按此）
- **name**：「岗位名称 · 公司」
- **fullVersion**：2~4条要点，每条以**加粗维度标签**开头（如「**配置管理和变更管理（A/R）**：主导设备的配置管理和变更管理...」），内嵌强动词、量化数据与JD原词
- **conciseVersion**：整合为2条，每条带小标题（用「·」连接两个维度，如「**网络规划与建设实施 · 配置变更管理**：...」），浓缩核心信息与关键数据
- **matchNote**：一条小字说明，点明为什么这样写、承接了JD哪些维度、JD关键词原样落地说明、量化数据为【推测范围】待核对`;

// ---- HR 打招呼 Prompt ----
const GREETING_PROMPT = `你是一个专业的求职顾问。根据以下规则生成 HR 打招呼话术。

【强制规则】
1. 身份：从简历判断是应届生、在职跳槽还是转行人员，全文统一。
2. 能力佐证：每条能力必须跟在学历/证书/实习/项目/成果后面。禁止无证据空话。
3. 语序：问候→自我介绍和求职意向→核心匹配优势→收尾邀约。亮点前置。
4. 篇幅：精简版2-3行，完整版4-5行。不超行数。
5. JD关键词：提取2-3个高频关键词自然嵌入。

【风格】
- 稳重正式：正式简洁，适用于国企、传统行业
- 干练简洁：务实直接，适用于互联网、技术岗
- 温和真诚：自然真诚，适用于文职、服务类

严格按 JSON 返回，不要其他内容：
{"short": "精简版", "full": "完整版", "jd_matched": "JD强匹配版"}`;

// ---- 状态 ----
let currentFile = null;
let currentDocxBase64 = null;
let currentResult = null;
let currentOptimizations = [];
let currentApiDocxBase64 = null;
let resumeText = '';
let templateBase64 = null;

// HR 打招呼状态
let greetingData = null;
let greetingTab = 'short';
let greetingStyle = '干练简洁';

// ---- 文本清理（防止 OCR/粘贴引入多余控制字符） ----
function cleanText(s) {
  if (!s) return '';
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')  // 控制字符 → 空格
    .replace(/\t/g, ' ')                                    // tab → 空格
    .replace(/\r\n/g, '\n')                                 // CRLF → LF
    .replace(/\n{3,}/g, '\n\n')                             // 连续3+换行 → 2个
    .replace(/ {2,}/g, ' ')                                 // 连续空格 → 1个
    .trim();
}

// ---- DeepSeek API 直接调用 ----

async function callDeepSeek(messages, maxTokens = 32768) {
  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`DeepSeek API 错误 (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回内容为空');
  return content;
}

function parseAIResponse(raw) {
  // 提取 JSON 块
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonStr = codeBlock ? codeBlock[1].trim() : null;
  if (!jsonStr) {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    jsonStr = (first !== -1 && last > first) ? raw.slice(first, last + 1) : raw;
  }

  // 第1次：直接解析
  try { return JSON.parse(jsonStr); } catch {}

  // 第2次：用正则匹配所有 JSON 字符串值，内部的控制字符全部转义
  try {
    const cleaned = jsonStr.replace(
      /"(?:[^"\\]|\\.)*"/g,
      (m) => m
        .replace(/[\x00-\x08]/g, ' ')
        .replace(/\x0B/g, ' ')
        .replace(/\x0C/g, ' ')
        .replace(/[\x0E-\x1F]/g, ' ')
        .replace(/\x7F/g, ' ')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
    );
    return JSON.parse(cleaned);
  } catch {}

  // 第3次：更激进——全部控制字符替换为空格
  try {
    return JSON.parse(jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' '));
  } catch {}

  // 第4次：修复截断 JSON
  try {
    let repaired = jsonStr
      .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
      .trimEnd();
    if (!repaired.endsWith('}') && !repaired.endsWith(']')) {
      let depth = 0, inS = false, esc = false;
      for (const ch of repaired) {
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inS) { esc = true; continue; }
        if (ch === '"') { inS = !inS; continue; }
        if (inS) continue;
        if (ch === '{' || ch === '[') depth++;
        if (ch === '}' || ch === ']') depth--;
      }
      if (depth > 0) {
        const tail = repaired.trimEnd();
        if (tail.endsWith(':') || tail.endsWith(',')) repaired += '""';
        for (let i = 0; i < depth; i++) repaired += '}';
      }
    }
    return JSON.parse(repaired);
  } catch {}

  console.error('JSON 解析失败，原始响应:', raw.slice(0, 500));
  throw new Error('AI 返回格式异常: ' + raw.slice(0, 150));
}

// ---- DOM ----
const $ = (id) => document.getElementById(id);

// ---- 初始化 ----
function init() {
  bindEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ---- 事件绑定 ----
function bindEvents() {
  // 文件上传
  const dropZone = $('dropZone');
  const fileInput = $('fileInput');

  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput?.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) handleFileSelect(file);
    });
  }

  // JD textarea 事件（粘贴图片 + Ctrl+Enter）
  const jdTextarea = $('jdTextarea');
  if (jdTextarea) {
    jdTextarea.addEventListener('paste', handleJdPaste);
    jdTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    });
  }

  // JD 图片文件上传
  const jdImageInput = $('jdImageInput');
  if (jdImageInput) {
    jdImageInput.addEventListener('change', () => {
      const file = jdImageInput.files[0];
      if (file) recognizeJdImage(file);
    });
  }

  // 生成按钮
  const generateBtn = $('generateBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
  }

  // 模板文件上传
  const templateInput = $('templateInput');
  const templateZone = $('templateZone');
  if (templateZone && templateInput) {
    templateZone.addEventListener('click', () => templateInput.click());
    templateInput.addEventListener('change', () => {
      const file = templateInput.files[0];
      if (file) {
        file.arrayBuffer().then((buf) => {
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          templateBase64 = btoa(binary);
          const hint = $('templateHint');
          if (hint) { hint.textContent = `已选择: ${file.name}`; hint.style.color = 'var(--success)'; }
        });
      }
    });
  }

  // 弹窗关闭
  const modalOverlay = $('modalOverlay');
  const modalClose = $('modalClose');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }
  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }
}

// ---- 文件处理 ----
function handleFileSelect(file) {
  currentFile = file;
  const hint = $('uploadHint');
  if (hint) {
    hint.textContent = file.name;
    hint.classList.add('has-file');
  }

  // DOCX 模式：保存 base64 / TXT 模式：读取文本
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    file.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      currentDocxBase64 = btoa(binary);
    });
  } else if (name.endsWith('.txt')) {
    currentDocxBase64 = null;
    file.text().then((text) => {
      resumeText = text;
    });
  } else {
    currentDocxBase64 = null;
  }

  // 提取文本用于 HR 模块
  extractResumeText(file);
}

async function extractResumeText(file) {
  try {
    const name = file.name.toLowerCase();
    if (typeof mammoth !== 'undefined' && name.endsWith('.docx')) {
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      resumeText = result.value;
    } else if (name.endsWith('.txt')) {
      resumeText = await file.text();
    }
  } catch (e) {
    console.warn('简历文本提取失败:', e);
  }
}

// ---- JD 图片识别（粘贴 + 上传共用） ----

function setHint(text, cls) {
  const hint = $('jdPasteHint');
  if (hint) {
    hint.textContent = text;
    hint.className = 'jd-paste-hint' + (cls ? ' ' + cls : '');
  }
}

function handleJdPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) recognizeJdImage(file);
      break;
    }
  }
}

async function recognizeJdImage(file) {
  if (typeof Tesseract === 'undefined') {
    setHint('OCR 库未加载，请刷新页面重试');
    return;
  }

  setHint('正在识别截图文字...', 'recognizing');

  try {
    const result = await Tesseract.recognize(file, 'chi_sim+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress != null) {
          setHint(`正在识别... ${Math.round(m.progress * 100)}%`, 'recognizing');
        }
      },
    });

    const text = (result.data.text || '').trim();
    if (text) {
      const textarea = $('jdTextarea');
      if (textarea) {
        textarea.value = textarea.value.trim()
          ? textarea.value.trim() + '\n\n' + text
          : text;
      }
      setHint('识别完成', 'done');
      setTimeout(() => setHint(''), 3000);
    } else {
      setHint('未识别到文字，请确认图片清晰');
    }
  } catch (err) {
    console.error('OCR 失败:', err);
    setHint('识别失败: ' + (err.message || '请手动输入'));
  }
}

// ---- API 调用 ----
async function handleGenerate() {
  const jdText = $('jdTextarea')?.value?.trim() || '';

  if (!currentDocxBase64 && !resumeText) {
    showError('请先上传 DOCX 或 TXT 简历文件');
    return;
  }
  if (!jdText) {
    showError('请填写岗位 JD 描述');
    return;
  }

  clearError();

  // 显示加载
  $('uploadSection').style.display = 'none';
  $('loadingContainer').style.display = '';
  $('resultArea').style.display = 'none';

  try {
    const raw = await callDeepSeek([
      { role: 'system', content: MATCH_SYSTEM_PROMPT },
      { role: 'user', content: `## 候选人简历（原始文本）\n\n${cleanText(resumeText)}\n\n## 目标岗位 JD\n\n${cleanText(jdText)}\n\n## 任务\n\n请根据以上简历和 JD，生成包含 diagnosticReport、display 和 optimizations 三个字段的完整 JSON。\n关键要求：optimizations 必须覆盖简历中每一个段落，至少 8-15 条；old_text 必须与原文逐字匹配。` },
    ]);

    currentResult = parseAIResponse(raw);
    currentOptimizations = currentResult.optimizations || [];
    currentApiDocxBase64 = currentResult.docxBase64 || null;

    renderAll(currentResult);

    $('loadingContainer').style.display = 'none';
    $('resultArea').style.display = '';

    // 显示模板简历按钮
    const toolbar = $('resultToolbar');
    const templateBtn = $('templateBtn');
    if (toolbar && templateBtn) {
      toolbar.style.display = '';
      templateBtn.style.display = '';
      templateBtn.onclick = handleGenerateTemplate;
    }

    // 触发 stagger 动画
    document.querySelectorAll('.stagger-card').forEach((el, i) => {
      el.style.animationDelay = `${i * 0.1}s`;
    });
  } catch (err) {
    console.error('分析失败:', err);
    $('loadingContainer').style.display = 'none';
    $('uploadSection').style.display = '';
    showError(err.message);
  }
}

// ---- 下载优化简历 DOCX（Word 原生批注） ----

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handleDownloadDocx() {
  const btn = $('downloadDocxBtn');
  if (!btn) return;

  if (!currentDocxBase64) { showError('缺少 DOCX 数据，请重新上传'); return; }
  if (!currentOptimizations.length) { showError('没有可应用的优化建议'); return; }
  if (typeof JSZip === 'undefined') { showError('JSZip 库未加载，请刷新页面重试'); return; }

  const jdText = $('jdTextarea')?.value?.trim() || '';
  const jobTitle = extractJobTitle(jdText) || '优化简历';

  btn.disabled = true;
  btn.textContent = '正在生成 DOCX…';

  try {
    const binaryStr = atob(currentDocxBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const zip = await JSZip.loadAsync(bytes.buffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('无法读取 DOCX 内容');
    let xml = await docFile.async('string');

    // ---- 1. 替换文本 + 插入批注标记 ----
    let commentId = 0;
    const comments = []; // {id, oldText, newText, comment}

    for (const opt of currentOptimizations) {
      const oldText = (opt.old_text || '').trim();
      const newText = (opt.new_text || '').trim();
      const comment = (opt.comment || '').trim();
      if (!oldText || oldText.length < 6 || !newText) continue;

      // 在 XML 中找原文所在的 <w:t> 标签
      const tTagRegex = new RegExp(
        '(<w:t[^>]*>)(' + oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(</w:t>)'
      );
      const tMatch = xml.match(tTagRegex);

      if (tMatch) {
        const id = commentId++;
        // 替换文本 + 包裹批注标记
        const replacement =
          `<w:commentRangeStart w:id="${id}"/>` +
          tMatch[1] + escapeXml(newText) + tMatch[3] +
          `<w:commentRangeEnd w:id="${id}"/>` +
          `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r>`;

        xml = xml.replace(tMatch[0], replacement);
        comments.push({ id, oldText, newText, comment });
      }
    }

    // ---- 2. 生成 comments.xml ----
    let commentsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    commentsXml += '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    for (const c of comments) {
      const body = [
        `【原文】${c.oldText}`,
        `【优化后】${c.newText}`,
        c.comment ? `【修改原因】${c.comment}` : ''
      ].filter(Boolean).join('\n');
      commentsXml += `<w:comment w:id="${c.id}" w:author="AI简历优化" w:date="${new Date().toISOString().slice(0,10)}">`;
      commentsXml += `<w:p><w:r><w:t>${escapeXml(body)}</w:t></w:r></w:p>`;
      commentsXml += '</w:comment>';
    }
    commentsXml += '</w:comments>';

    zip.file('word/comments.xml', commentsXml);

    // ---- 3. 注册 comments part ----
    // [Content_Types].xml 添加 Override
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      let ct = await ctFile.async('string');
      if (!ct.includes('comments.xml')) {
        ct = ct.replace('</Types>',
          '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' +
          '</Types>');
        zip.file('[Content_Types].xml', ct);
      }
    }

    // word/_rels/document.xml.rels 添加关系
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      let rels = await relsFile.async('string');
      if (!rels.includes('comments.xml')) {
        const nextId = 'rId' + (rels.match(/rId\d+/g)?.length + 1 || 100);
        rels = rels.replace('</Relationships>',
          `<Relationship Id="${nextId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>` +
          '</Relationships>');
        zip.file('word/_rels/document.xml.rels', rels);
      }
    }

    // 写回 document.xml
    zip.file('word/document.xml', xml);

    // ---- 4. 生成并下载 ----
    const newBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
    const blob = new Blob([newBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume_optimized_${sanitizeFileName(jobTitle)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.textContent = `已下载! (${comments.length} 条批注)`;
    btn.style.background = 'var(--success)';
    setTimeout(() => { btn.textContent = '下载优化简历 (.docx)'; btn.style.background = ''; btn.disabled = false; }, 3000);
  } catch (err) {
    console.error('DOCX 生成失败:', err);
    btn.disabled = false;
    btn.textContent = '下载优化简历 (.docx)';
    showError('DOCX 生成失败: ' + err.message);
  }
}

// ---- 生成模板简历（纯前端 JSZip） ----

async function handleGenerateTemplate() {
  const btn = $('templateBtn');
  if (!btn) { console.error('templateBtn not found'); return; }

  console.log('handleGenerateTemplate called', { hasTemplate: !!templateBase64, hasResult: !!currentResult, hasJSZip: typeof JSZip !== 'undefined' });

  if (!templateBase64) { showError('请先上传简历模板 .docx 文件'); return; }
  if (!currentResult) { showError('请先完成简历分析'); return; }
  if (typeof JSZip === 'undefined') { showError('JSZip 未加载，请刷新页面'); return; }

  btn.disabled = true;
  btn.textContent = '正在生成…';

  try {
    // 解码模板
    const bytes = Uint8Array.from(atob(templateBase64), c => c.charCodeAt(0));
    const zip = await JSZip.loadAsync(bytes.buffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('无法读取模板内容');
    let xml = await docFile.async('string');

    // 提取数据
    const info = parseResumeText(resumeText);
    const display = currentResult.display || currentResult;
    const diagnostic = currentResult.diagnosticReport || {};
    const experiences = display.experienceShowcase || [];

    // ---- P0: 姓名 ----
    if (info.name) {
      xml = xml.replace(/>姓名</, '>' + escXml(info.name) + '<');
    }

    // ---- P1: 基本信息 ----
    if (info.phone) xml = xml.replace(/>xxxxx</, '>' + escXml(info.phone) + '<');
    if (info.email) xml = xml.replace(/>xxxxxx</, '>' + escXml(info.email) + '<');

    // ---- P3: 教育信息 ----
    const edu = info.education || {};
    if (edu.school) xml = xml.replace(/>xxxxxxxxxxx大学</, '>' + escXml(edu.school) + '<');
    if (edu.major) xml = xml.replace(/>xxxxxxxx专业</, '>' + escXml(edu.major) + '<');

    // ---- P4: 主修课程 ----
    if (edu.courses) xml = xml.replace(/>xxxxxxxx</, '>' + escXml(edu.courses) + '<');

    // ---- 经历替换（实习/项目/校园） ----
    for (const exp of experiences) {
      const name = exp.name || '';
      const full = exp.fullVersion || '';
      if (!full) continue;

      // 查找模板中对应的占位段落并替换
      const bullets = full.split('\n').filter(l => l.trim().length > 5);
      for (const bullet of bullets) {
        const clean = bullet.replace(/^[\-•\d.\s]+/, '').trim();
        if (clean.length < 10) continue;
        // 在 XML 中找 "xxxx：" 格式的占位符替换
        const placeholderMatch = xml.match(/>xxxx[：:]([^<]*)</);
        if (placeholderMatch) {
          const oldFull = placeholderMatch[0];
          const newText = escXml(clean);
          xml = xml.replace(oldFull, '>' + newText + '<');
        }
      }
    }

    // ---- 技能板块 ----
    const skills = info.skills || {};
    if (skills.certificates) xml = xml.replace(/>xxxxx</, '>' + escXml(skills.certificates) + '<');
    if (skills.technical) xml = xml.replace(/>xxxxxx。/, '>' + escXml(skills.technical) + '。');
    if (skills.selfEval) xml = xml.replace(/>xxxxxx。/, '>' + escXml(skills.selfEval) + '。');
    // 兴趣爱好
    const hobbies = skills.hobbies || '球类运动、写作';
    xml = xml.replace(/>xxxxxx。/, '>' + escXml(hobbies) + '。');

    // ---- 量化标红：在 XML 中找含成果数字的 <w:t> 标签 ----
    xml = xml.replace(/<w:t[^>]*>([^<]*?)<\/w:t>/g, (match, text) => {
      if (/提升|降低|节省|缩短|优化|管理|服务|处理|交付/.test(text) && /\d+/.test(text)) {
        return match.replace(/<w:t[^>]*>/, '<w:t xml:space="preserve">').replace(
          /<w:rPr>/,
          '<w:rPr><w:color w:val="FF0000"/>'
        ).replace(
          /<\/w:t>/,
          '</w:t>'
        );
      }
      return match;
    });

    // ---- 末尾附加区 ----
    let appendix = '';
    appendix += '<w:p><w:r><w:rPr><w:color w:val="808080"/></w:rPr><w:t>【以下为 AI 推断补充，供参考，请自行核实后决定是否采用】</w:t></w:r></w:p>';
    const missing = display.missingInfoSuggestions || [];
    for (const item of missing) {
      appendix += `<w:p><w:r><w:rPr><w:color w:val="808080"/></w:rPr><w:t>• ${escXml(item)}</w:t></w:r></w:p>`;
    }
    appendix += '<w:p/>';
    appendix += '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>优化后简历打分 · 匹配度计算（100 分制）</w:t></w:r></w:p>';

    if (diagnostic.dimensions) {
      const dimMap = { jdMatch: 'JD 匹配度', quantification: '量化成果', structure: '结构与逻辑', language: '语言专业度', ats: 'ATS 友好度' };
      for (const [key, label] of Object.entries(dimMap)) {
        const d = diagnostic.dimensions[key] || {};
        appendix += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${label}：${d.score || 0}/${d.maxScore || 0}</w:t></w:r>`;
        if (d.detail) appendix += `<w:r><w:t>  ${escXml(d.detail)}</w:t></w:r>`;
        appendix += '</w:p>';
      }
      appendix += `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>综合得分：${diagnostic.overallScore || 0}/100</w:t></w:r></w:p>`;
    }

    appendix += '<w:p/>';
    appendix += '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>优化亮点：</w:t></w:r></w:p>';
    for (const h of ['🔑 关键词优化', '📊 量化成果', '🎯 技能匹配', '✨ 措辞优化', '📐 结构调整', '🤖 ATS 优化']) {
      appendix += `<w:p><w:r><w:t>  ${h}</w:t></w:r></w:p>`;
    }

    xml = xml.replace(/<\/w:body>/, appendix + '</w:body>');

    // 写回并下载
    zip.file('word/document.xml', xml);
    const newBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
    const blob = new Blob([newBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '简历_优化版.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.textContent = '已下载!';
    btn.style.background = 'var(--success)';
    setTimeout(() => { btn.textContent = '下载优化简历（模板）'; btn.style.background = ''; btn.disabled = false; }, 3000);
  } catch (err) {
    console.error('模板生成失败:', err);
    btn.disabled = false;
    btn.textContent = '下载优化简历（模板）';
    showError('生成失败: ' + err.message);
  }
}

function parseResumeText(text) {
  const info = {};
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return info;

  info.name = lines[0].replace(/^[姓\s名：:]+/, '').trim();

  const early = lines.slice(0, 10).join('\n');
  const phoneM = early.match(/1[3-9]\d{9}/);
  if (phoneM) info.phone = phoneM[0];
  const emailM = early.match(/[\w.\-]+@[\w.\-]+\.\w+/);
  if (emailM) info.email = emailM[0];

  const edu = {};
  for (const line of lines) {
    if (/大学|学院|学校|本科|硕士/.test(line)) {
      const years = line.match(/20\d{2}/g) || [];
      if (years.length >= 2) { edu.start_year = years[0]; edu.end_year = years[1]; }
      const schoolM = line.match(/([一-鿿]{2,15}(?:大学|学院|学校))/);
      if (schoolM) edu.school = schoolM[1];
      const majorM = line.match(/([一-鿿]{2,15})(?:专业|系)/);
      if (majorM) edu.major = majorM[1] + '专业';
      const gpaM = line.match(/GPA[：:]\s*(\d+\.?\d*)/i);
      if (gpaM) edu.gpa = gpaM[1];
      break;
    }
  }

  for (const line of lines) {
    if (/主修课程|核心课程/.test(line)) edu.courses = line.replace(/^.*?[：:]\s*/, '');
  }
  info.education = edu;

  const skills = {};
  for (const line of lines) {
    if (/证书|CET/.test(line)) skills.certificates = line.replace(/^.*?[：:]\s*/, '');
    if (/专业技能|技术栈/.test(line)) skills.technical = line.replace(/^.*?[：:]\s*/, '').replace(/。/g, '');
    if (/自我评价/.test(line)) skills.selfEval = line.replace(/^.*?[：:]\s*/, '').replace(/。/g, '');
    if (/爱好|兴趣/.test(line)) skills.hobbies = line.replace(/^.*?[：:]\s*/, '').replace(/。/g, '');
  }
  info.skills = skills;

  return info;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractJobTitle(jdText) {
  const patterns = [
    /(?:职位|岗位|招聘)[：:\s]*[【\[]?([^】\]\n，,]{2,20})[】\]]?/,
    /(?:诚聘|急招|招聘)[：:\s]*[【\[]?([^】\]\n，,]{2,20})[】\]]?/,
    /(?:安全|网络|运维|开发|测试|数据|前端|后端|全栈|架构|产品|项目经理)[^，,\n]{0,8}(?:工程师|分析师|专家|经理|专员|主管|负责人|实习生|岗)/,
    /([一-鿿]{2,15}(?:工程师|分析师|专家|经理|专员|主管|负责人|实习生|岗))/,
  ];
  for (const re of patterns) {
    const m = jdText.match(re);
    if (m) return m[1] || m[0];
  }
  return '';
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50).trim() || 'resume';
}

// ---- 错误处理 ----
function showError(msg) {
  const box = $('errorBox');
  if (box) {
    box.textContent = msg;
    box.style.display = '';
  }
}

function clearError() {
  const box = $('errorBox');
  if (box) box.style.display = 'none';
}

// ---- Toast ----
function showToast(msg) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = '';
  toast.classList.remove('leaving');
  void toast.offsetWidth;
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => { toast.style.display = 'none'; toast.classList.remove('leaving'); }, 300);
  }, 1200);
}

// ---- 渲染全部 ----
function renderAll(result) {
  const dr = result.diagnosticReport || null;
  const display = result.display || result;

  renderMatchTags(dr);
  renderDiagnostic(dr, display);
  renderMatchAnalysis(display);
  renderExperiences(display);
  renderInterview(display);
  renderSelfIntro(display);
  renderGreeting();
}

// ---- 四维匹配标签 ----
function renderMatchTags(dr) {
  const bar = $('matchTagsBar');
  if (!bar || !dr?.dimensions) { bar.innerHTML = ''; return; }

  const tabs = [
    { key: 'jdMatch', label: '技能匹配' },
    { key: 'quantification', label: '经验匹配' },
    { key: 'structure', label: '学历匹配' },
    { key: 'ats', label: '综合评分' },
  ];

  bar.innerHTML = tabs.map((tab) => {
    const dim = dr.dimensions[tab.key];
    if (!dim) return `<button class="tag-btn" data-tab="${tab.key}">${tab.label}</button>`;
    const cls = dim.status === 'ok' ? 'ok' : dim.status === 'warning' ? 'warning' : 'danger';
    return `<button class="tag-btn" data-tab="${tab.key}">
      ${tab.label}
      <span class="tag-score ${cls}">${dim.score}/${dim.maxScore}</span>
    </button>`;
  }).join('');

  bar.querySelectorAll('.tag-btn').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.tab));
  });
}

// ---- 模块 1: 诊断报告 ----
function renderDiagnostic(dr, display) {
  const body = $('diagnosticBody');
  if (!body) return;
  if (!dr) { body.innerHTML = '<p style="color:var(--text-muted)">无诊断数据</p>'; return; }

  const score = dr.overallScore || 0;
  const badge = getScoreBadge(score);
  const summary = display?.matchSummary?.overallConclusion || dr.optimizationPotential || '';

  let dimBars = '';
  if (dr.dimensions) {
    const order = ['jdMatch', 'quantification', 'structure', 'language', 'ats'];
    for (const key of order) {
      const d = dr.dimensions[key];
      if (!d) continue;
      const pct = Math.round((d.score / d.maxScore) * 100);
      const cls = d.status === 'ok' ? 'ok' : d.status === 'warning' ? 'warning' : 'danger';
      dimBars += `
        <div class="dim-bar-row">
          <div class="dim-bar-header">
            <span>${d.label}</span>
            <span>${d.score}/${d.maxScore}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
        </div>`;
    }
  }

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap">
      <span class="score-number">${score}</span>
      <div>
        <span class="score-badge ${badge.cls}">${badge.label}</span>
        <p class="score-summary">${escapeHTML(summary)}</p>
      </div>
    </div>
    <div class="dim-bars">${dimBars}</div>`;

  // countUp 动画
  animateCountUp(body.querySelector('.score-number'), score);
}

function animateCountUp(el, target) {
  if (!el) return;
  const duration = 1500;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(eased * target);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function getScoreBadge(score) {
  if (score >= 85) return { label: '优秀', cls: 'excellent' };
  if (score >= 70) return { label: '良好', cls: 'good' };
  if (score >= 50) return { label: '一般', cls: 'fair' };
  return { label: '需优化', cls: 'poor' };
}

// ---- 模块 2: 匹配点与风险 ----
function renderMatchAnalysis(display) {
  const grid = $('matchGrid');
  if (!grid) return;

  const ms = display?.matchSummary;
  if (!ms) { grid.innerHTML = '<p style="color:var(--text-muted)">无匹配数据</p>'; return; }

  const strongHTML = (ms.strongestMatches || []).map((s) =>
    `<div class="item-card success">${escapeHTML(s)}</div>`
  ).join('');

  const riskHTML = (ms.riskOrGaps || []).map((s) =>
    `<div class="item-card danger">${escapeHTML(s)}</div>`
  ).join('');

  grid.innerHTML = `
    <div>
      <h3 class="match-col-title green">匹配优势</h3>
      ${strongHTML || '<p style="color:var(--text-muted);font-size:13px">暂无</p>'}
    </div>
    <div>
      <h3 class="match-col-title red">风险与差距</h3>
      ${riskHTML || '<p style="color:var(--text-muted);font-size:13px">暂无</p>'}
    </div>`;
}

// ---- 模块 3: 经历展示 ----
function renderExperiences(display) {
  const list = $('experienceList');
  if (!list) return;

  const exps = display?.experienceShowcase;
  if (!exps?.length) { list.innerHTML = '<p style="color:var(--text-muted)">无经历数据</p>'; return; }

  list.innerHTML = exps.map((exp) => {
    // 新格式：fullVersion + conciseVersion + matchNote
    const full = exp.fullVersion || '';
    const concise = exp.conciseVersion || '';
    const note = exp.matchNote || '';

    // 兼容旧格式
    const desc = exp.optimizedDescription || '';
    const skillsHTML = (exp.highlightedSkills || []).map((s) =>
      `<span class="keyword-tag">${escapeHTML(s)}</span>`
    ).join('');

    if (full) {
      // 新格式渲染
      let html = `<div class="item-card info">`;
      html += `<div class="item-card-title">${escapeHTML(exp.name || '')}</div>`;

      // 完整版
      html += `<div class="exp-section"><span class="exp-section-label">完整版</span>`;
      html += `<div class="exp-full-text">${escapeHTML(full)}</div></div>`;

      // 精简版
      if (concise) {
        html += `<div class="exp-section"><span class="exp-section-label">精简版</span>`;
        html += `<div class="exp-concise-text">${escapeHTML(concise)}</div></div>`;
      }

      // 小字说明
      if (note) {
        html += `<div class="exp-match-note">${escapeHTML(note)}</div>`;
      }

      html += `</div>`;
      return html;
    } else {
      // 兼容旧格式
      return `
        <div class="item-card info">
          <div class="item-card-title">${escapeHTML(exp.name || '')}</div>
          <p>${escapeHTML(desc)}</p>
          ${skillsHTML ? `<div style="margin-top:8px">${skillsHTML}</div>` : ''}
        </div>`;
    }
  }).join('');
}

// ---- 模块 4: 面试亮点 ----
function renderInterview(display) {
  const body = $('interviewBody');
  if (!body) return;

  const highlights = display?.interviewHighlights || [];
  const missing = display?.missingInfoSuggestions || [];

  const hHTML = highlights.map((h) => `<div class="item-card info">${escapeHTML(h)}</div>`).join('');
  const mHTML = missing.map((m) => `<div class="item-card warning">${escapeHTML(m)}</div>`).join('');

  body.innerHTML = `
    ${highlights.length ? `<h3 style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:10px">面试可说的亮点</h3>${hHTML}` : ''}
    ${missing.length ? `<h3 style="font-size:13px;font-weight:700;color:var(--warning);margin-top:16px;margin-bottom:10px">建议补充信息</h3>${mHTML}` : ''}
    ${!highlights.length && !missing.length ? '<p style="color:var(--text-muted)">无面试建议</p>' : ''}`;
}

// ---- 模块 5: 自我介绍 ----
function renderSelfIntro(display) {
  const body = $('introBody');
  if (!body) return;

  const intro = display?.finalSelfIntroduction || '';
  if (!intro) { body.innerHTML = '<p style="color:var(--text-muted)">无自我介绍</p>'; return; }

  const short = intro.slice(0, 300);

  body.innerHTML = `
    <div class="intro-section">
      <div class="intro-header">
        <span class="intro-label">1 分钟版本</span>
        <button class="copy-btn" data-copy="${escapeAttr(short)}">复制</button>
      </div>
      <div class="greeting-box">${escapeHTML(short)}</div>
    </div>
    <div class="intro-section">
      <div class="intro-header">
        <span class="intro-label">3 分钟版本</span>
        <button class="copy-btn" data-copy="${escapeAttr(intro)}">复制</button>
      </div>
      <div class="greeting-box">${escapeHTML(intro)}</div>
    </div>`;

  body.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      copyText(btn.dataset.copy);
      btn.textContent = '已复制!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1500);
    });
  });
}

// ---- 模块 6: HR 打招呼 ----
function renderGreeting() {
  const body = $('greetingBody');
  if (!body) return;

  const styles = ['稳重正式', '干练简洁', '温和真诚'];
  const tabs = [
    { key: 'short', label: '精简版' },
    { key: 'full', label: '完整版' },
    { key: 'jd_matched', label: 'JD 强匹配版' },
  ];

  body.innerHTML = `
    <div class="style-bar">
      ${styles.map((s) => `<button class="style-btn ${s === greetingStyle ? 'active' : ''}" data-style="${s}">${s}</button>`).join('')}
    </div>
    <button class="primary-btn" id="greetingGenBtn">生成打招呼话术</button>
    <div id="greetingResult" style="display:none;margin-top:16px">
      <div class="tab-bar" id="greetingTabs">
        ${tabs.map((t) => `<button class="tab-btn ${t.key === greetingTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div class="greeting-box" id="greetingText"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <button class="copy-btn" id="greetingCopyBtn">复制</button>
      </div>
    </div>`;

  // 事件
  body.querySelectorAll('.style-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      greetingStyle = btn.dataset.style;
      body.querySelectorAll('.style-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const genBtn = body.querySelector('#greetingGenBtn');
  if (genBtn) {
    genBtn.addEventListener('click', handleGenerateGreeting);
  }

  body.querySelectorAll('#greetingTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      greetingTab = btn.dataset.tab;
      body.querySelectorAll('#greetingTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateGreetingText();
    });
  });

  const copyBtn = body.querySelector('#greetingCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = greetingData?.[greetingTab] || '';
      if (text) {
        copyText(text);
        copyBtn.textContent = '已复制!';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = '复制'; copyBtn.classList.remove('copied'); }, 1500);
      }
    });
  }
}

async function handleGenerateGreeting() {
  const jdText = $('jdTextarea')?.value?.trim() || '';
  if (!resumeText && !currentDocxBase64) {
    showToast('请先上传简历');
    return;
  }
  if (!jdText) {
    showToast('请填写 JD');
    return;
  }

  const btn = document.querySelector('#greetingGenBtn');
  if (btn) { btn.textContent = '生成中...'; btn.disabled = true; }

  try {
    const raw = await callDeepSeek([
      { role: 'system', content: GREETING_PROMPT },
      { role: 'user', content: `【简历内容】\n${cleanText(resumeText) || '简历已上传'}\n\n【JD 内容】\n${cleanText(jdText)}\n\n【指定风格】\n${greetingStyle}` },
    ], 4096);

    greetingData = parseAIResponse(raw);
    const resultDiv = document.querySelector('#greetingResult');
    if (resultDiv) resultDiv.style.display = '';
    updateGreetingText();
  } catch (err) {
    showToast(err.message);
  } finally {
    if (btn) { btn.textContent = '生成打招呼话术'; btn.disabled = false; }
  }
}

function updateGreetingText() {
  const el = document.querySelector('#greetingText');
  if (el && greetingData) {
    el.textContent = greetingData[greetingTab] || '';
  }
}

// ---- 弹窗 ----
function openModal(tabKey) {
  const overlay = $('modalOverlay');
  const content = $('modalContent');
  if (!overlay || !content || !currentResult?.diagnosticReport) return;

  const dr = currentResult.diagnosticReport;
  const dim = dr.dimensions?.[tabKey];
  const labels = {
    jdMatch: '技能匹配',
    quantification: '经验匹配',
    structure: '学历匹配',
    ats: '综合评分',
  };

  const statusMap = {
    ok: { label: '良好', cls: 'ok' },
    warning: { label: '待优化', cls: 'warning' },
    danger: { label: '需关注', cls: 'danger' },
  };

  if (dim) {
    const s = statusMap[dim.status] || statusMap.warning;
    const pct = Math.round((dim.score / dim.maxScore) * 100);
    content.innerHTML = `
      <p class="modal-kicker">Resume Analysis</p>
      <h2 class="modal-title">四维匹配分析</h2>
      <div class="modal-dim-detail">
        <div class="modal-dim-header">
          <span class="modal-dim-label">${dim.label}</span>
          <span class="status-tag ${s.cls}">${s.label}</span>
        </div>
        <div class="progress-bar" style="margin-bottom:14px">
          <div class="progress-fill ${s.cls}" style="width:${pct}%"></div>
        </div>
        <p>${escapeHTML(dim.detail || '')}</p>
      </div>`;
  } else {
    // 显示总览
    const ms = currentResult.display?.matchSummary;
    let html = `
      <p class="modal-kicker">Resume Analysis</p>
      <h2 class="modal-title">四维匹配分析</h2>
      <div class="tab-bar" style="margin-bottom:20px">`;
    for (const [key, label] of Object.entries(labels)) {
      const d = dr.dimensions?.[key];
      const cls2 = d ? (d.status === 'ok' ? 'ok' : d.status === 'warning' ? 'warning' : 'danger') : '';
      html += `<button class="tag-btn modal-tag" data-key="${key}" style="font-size:12px;padding:8px 14px">
        ${label}${d ? `<span class="tag-score ${cls2}">${d.score}/${d.maxScore}</span>` : ''}
      </button>`;
    }
    html += '</div>';

    if (ms) {
      if (ms.strongestMatches?.length) {
        html += '<h3 style="font-size:14px;font-weight:700;color:var(--success);margin-bottom:10px">匹配优势</h3>';
        html += ms.strongestMatches.map((s) => `<div class="item-card success" style="font-size:13px">${escapeHTML(s)}</div>`).join('');
      }
      if (ms.riskOrGaps?.length) {
        html += '<h3 style="font-size:14px;font-weight:700;color:var(--danger);margin:16px 0 10px">风险与差距</h3>';
        html += ms.riskOrGaps.map((s) => `<div class="item-card danger" style="font-size:13px">${escapeHTML(s)}</div>`).join('');
      }
    }

    if (!ms?.strongestMatches?.length && !ms?.riskOrGaps?.length) {
      html += '<p style="text-align:center;color:var(--text-muted);padding:24px">点击上方标签查看各维度详情</p>';
    }

    html += '</div>';
    content.innerHTML = html;

    // 绑定弹窗内标签点击
    setTimeout(() => {
      content.querySelectorAll('.modal-tag').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.key;
          const d2 = dr.dimensions?.[key];
          if (!d2) return;
          const s2 = statusMap[d2.status] || statusMap.warning;
          const pct2 = Math.round((d2.score / d2.maxScore) * 100);

          // 替换为维度详情
          const detailDiv = content.querySelector('.modal-dim-detail');
          if (detailDiv) detailDiv.remove();

          const tagBar = content.querySelector('.tab-bar');
          const newDetail = document.createElement('div');
          newDetail.className = 'modal-dim-detail';
          newDetail.innerHTML = `
            <div class="modal-dim-header">
              <span class="modal-dim-label">${d2.label}</span>
              <span class="status-tag ${s2.cls}">${s2.label}</span>
            </div>
            <div class="progress-bar" style="margin-bottom:14px">
              <div class="progress-fill ${s2.cls}" style="width:${pct2}%"></div>
            </div>
            <p>${escapeHTML(d2.detail || '')}</p>`;
          tagBar.after(newDetail);
        });
      });
    }, 0);
  }

  overlay.style.display = '';
  overlay.classList.remove('leaving');
  overlay.classList.add('entering');
  const card = overlay.querySelector('.modal-card');
  if (card) { card.classList.remove('leaving'); card.classList.add('entering'); }
}

function closeModal() {
  const overlay = $('modalOverlay');
  if (!overlay) return;
  overlay.classList.remove('entering');
  overlay.classList.add('leaving');
  const card = overlay.querySelector('.modal-card');
  if (card) { card.classList.remove('entering'); card.classList.add('leaving'); }
  setTimeout(() => { overlay.style.display = 'none'; overlay.classList.remove('leaving'); }, 220);
}

// ---- 工具函数 ----
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast('已复制');
}
