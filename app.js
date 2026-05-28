// app.js — 简历智能分析主控逻辑
// cs2analysis 风格 UI + 6 模块卡片布局 + HR 打招呼 + 四维弹窗

// ---- API 后端地址 ----
// GitHub Pages 前端 → Vercel 后端 API
const API_BASE = 'https://portfolio-j091xd1ol-barry-s-projects3.vercel.app';

// ---- 状态 ----
let currentFile = null;
let currentDocxBase64 = null;
let currentResult = null;
let currentOptimizations = [];
let currentApiDocxBase64 = null;
let resumeText = '';

// HR 打招呼状态
let greetingData = null;
let greetingTab = 'short';
let greetingStyle = '干练简洁';

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

  // 生成按钮
  const generateBtn = $('generateBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
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

// ---- JD 粘贴图片自动识别 ----

async function handleJdPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        const hint = $('jdPasteHint');
        if (hint) {
          hint.textContent = '正在识别截图文字...';
          hint.className = 'jd-paste-hint recognizing';
        }
        try {
          const result = await Tesseract.recognize(file, 'chi_sim+eng');
          const text = result.data.text?.trim();
          if (text) {
            const textarea = $('jdTextarea');
            if (textarea) {
              textarea.value = textarea.value.trim()
                ? textarea.value.trim() + '\n\n' + text
                : text;
            }
            if (hint) {
              hint.textContent = '识别完成';
              hint.className = 'jd-paste-hint done';
              setTimeout(() => { hint.textContent = ''; hint.className = 'jd-paste-hint'; }, 3000);
            }
          } else {
            if (hint) {
              hint.textContent = '未识别到文字，请重试';
              hint.className = 'jd-paste-hint';
            }
          }
        } catch (err) {
          console.error('OCR 失败:', err);
          if (hint) {
            hint.textContent = '识别失败，请手动输入';
            hint.className = 'jd-paste-hint';
          }
        }
      }
      break;
    }
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const res = await fetch(`${API_BASE}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        currentDocxBase64
          ? { docx: currentDocxBase64, jd: jdText }
          : { resumeText: resumeText, jd: jdText }
      ),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `请求失败 (${res.status})`);
    }

    currentResult = await res.json();
    currentOptimizations = currentResult.optimizations || [];
    currentApiDocxBase64 = currentResult.docxBase64 || null;

    renderAll(currentResult);

    $('loadingContainer').style.display = 'none';
    $('resultArea').style.display = '';

    // 显示下载按钮（有优化建议且是 DOCX 模式）
    const toolbar = $('resultToolbar');
    const dlBtn = $('downloadDocxBtn');
    if (toolbar && dlBtn && currentOptimizations.length > 0 && currentApiDocxBase64) {
      toolbar.style.display = '';
      dlBtn.style.display = '';
      dlBtn.addEventListener('click', handleDownloadDocx);
    }

    // 触发 stagger 动画
    document.querySelectorAll('.stagger-card').forEach((el, i) => {
      el.style.animationDelay = `${i * 0.1}s`;
    });
  } catch (err) {
    $('loadingContainer').style.display = 'none';
    $('uploadSection').style.display = '';
    showError(err.name === 'AbortError' ? '请求超时，请重试' : err.message);
  }
}

// ---- 下载优化简历 DOCX ----

async function handleDownloadDocx() {
  const btn = $('downloadDocxBtn');
  if (!btn) return;

  if (!currentApiDocxBase64) {
    showError('缺少 DOCX 数据，请重新上传并生成');
    return;
  }
  if (!currentOptimizations.length) {
    showError('没有可应用的优化建议');
    return;
  }

  // 从 JD 提取职位名
  const jdText = $('jdTextarea')?.value?.trim() || '';
  const jobTitle = extractJobTitle(jdText) || '优化简历';

  btn.disabled = true;
  btn.textContent = '正在生成 DOCX…';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const res = await fetch(`${API_BASE}/api/generate-docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docxBase64: currentApiDocxBase64,
        optimizations: currentOptimizations,
        jobTitle: jobTitle,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'DOCX 生成失败');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume_optimized_${sanitizeFileName(jobTitle)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.textContent = '已下载!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
      btn.textContent = '下载优化简历 (.docx)';
      btn.style.background = '';
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '下载优化简历 (.docx)';
    showError(err.name === 'AbortError' ? 'DOCX 生成超时，请重试' : err.message);
  }
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
    const skillsHTML = (exp.highlightedSkills || []).map((s) =>
      `<span class="keyword-tag">${escapeHTML(s)}</span>`
    ).join('');

    return `
      <div class="item-card info">
        <div class="item-card-title">${escapeHTML(exp.name || '')}</div>
        <p>${escapeHTML(exp.optimizedDescription || '')}</p>
        ${skillsHTML ? `<div style="margin-top:8px">${skillsHTML}</div>` : ''}
      </div>`;
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
    const res = await fetch(`${API_BASE}/api/generate-greeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: resumeText || '简历已上传', jd: jdText, style: greetingStyle }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '生成失败');
    }

    greetingData = await res.json();
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
