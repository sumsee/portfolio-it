// app.js — 工具主控逻辑
// 串联 上传→解析→匹配→渲染 完整流程
// 支持 PDF（客户端解析）+ DOCX（base64 直传 API）+ 下载修改版 DOCX

import { parseResumeFile } from './modules/parser.js';
import { defaultResumeData } from './modules/data.js';
import {
  MatchError,
  getErrorMessage,
} from './modules/matcher.js';

// ---- 应用级状态 ----

const AppState = {
  IDLE: 'idle',
  PARSING: 'parsing',
  READY: 'ready',
  MATCHING: 'matching',
  GENERATING: 'generating',
  PREVIEW: 'preview',
  ERROR: 'error',
};

let appState = AppState.IDLE;
let currentResumeData = null;
let currentFileName = '';
let currentProfile = null;

// DOCX 模式专用
let currentDocxBase64 = null;       // 用户上传的原始 DOCX base64
let currentOptimizations = [];      // AI 返回的优化建议
let currentApiDocxBase64 = null;    // API 返回的 docxBase64（与上传一致）
let isDocxMode = false;

// ---- DOM 引用 ----

const $ = (id) => document.getElementById(id);

function getElements() {
  return {
    fileInput: $('fileInput'),
    dropZone: $('dropZone'),
    useDefaultBtn: $('useDefaultBtn'),
    jdTextarea: $('jdTextarea'),
    generateBtn: $('generateBtn'),
    statusText: $('statusText'),
    errorContainer: $('errorContainer'),
    resumeBadge: $('resumeBadge'),
    resultPlaceholder: $('resultPlaceholder'),
    loadingSpinner: $('loadingSpinner'),
    resultContainer: $('resultContainer'),
    copyFullBtn: $('copyFullBtn'),
    downloadDocxBtn: $('downloadDocxBtn'),
  };
}

// ---- 状态 UI ----

const STATUS_LABEL = {
  [AppState.IDLE]: '等待操作',
  [AppState.PARSING]: '正在解析简历…',
  [AppState.READY]: '简历就绪，请填写 JD',
  [AppState.MATCHING]: '正在 AI 匹配分析…',
  [AppState.GENERATING]: '正在生成展示页…',
  [AppState.PREVIEW]: '预览就绪',
  [AppState.ERROR]: '出错了',
};

function setUIState(state) {
  appState = state;
  const els = getElements();
  if (els.statusText) {
    els.statusText.textContent = STATUS_LABEL[state] || state;
    els.statusText.className = `status-text status-${state}`;
  }
  if (els.generateBtn) {
    els.generateBtn.disabled = state === AppState.MATCHING
                            || state === AppState.GENERATING
                            || state === AppState.PARSING;
  }
}

function showError(err, context = '') {
  setUIState(AppState.ERROR);
  const els = getElements();
  const msg = err instanceof MatchError
    ? getErrorMessage(err)
    : (err.message || String(err));

  if (els.errorContainer) {
    els.errorContainer.innerHTML = `<div class="error-msg">
      <span class="error-icon">!</span>
      <span>${escapeHTML(context ? context + '：' + msg : msg)}</span>
      <button class="error-dismiss" onclick="this.parentElement.remove()">&times;</button>
    </div>`;
  }
  setTimeout(() => {
    if (appState === AppState.ERROR) {
      setUIState(currentResumeData ? AppState.READY : AppState.IDLE);
    }
  }, 8000);
}

function clearError() {
  const els = getElements();
  if (els.errorContainer) els.errorContainer.innerHTML = '';
}

// ---- Base64 编码工具 ----

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---- 简历加载 ----

async function loadResumeFromFile(file) {
  clearError();
  setUIState(AppState.PARSING);

  try {
    const data = await parseResumeFile(file);
    currentResumeData = data;
    currentFileName = file.name;
    showResumeBadge(file.name, data);

    // 检测文件类型：DOCX 需保存 base64 用于 API 直传
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.docx')) {
      const buffer = await file.arrayBuffer();
      currentDocxBase64 = arrayBufferToBase64(buffer);
      isDocxMode = true;
    } else {
      currentDocxBase64 = null;
      isDocxMode = false;
    }

    setUIState(AppState.READY);
  } catch (err) {
    showError(err, '简历解析失败');
  }
}

function loadDefaultResume() {
  clearError();
  currentResumeData = { ...defaultResumeData };
  currentFileName = '默认简历（吴友虎）';
  currentDocxBase64 = null;
  isDocxMode = false;
  showResumeBadge('默认简历', currentResumeData);
  setUIState(AppState.READY);
}

function showResumeBadge(label, data) {
  const els = getElements();
  if (!els.resumeBadge) return;
  const skillCount = data.skills ? data.skills.length : 0;
  const expCount = data.experience ? data.experience.length : 0;
  const modeLabel = isDocxMode ? ' [DOCX直传]' : '';
  els.resumeBadge.innerHTML = `<span class="badge-icon">&#10003;</span>
    <span class="badge-label">${escapeHTML(label)}${modeLabel}</span>
    <span class="badge-detail">${skillCount} 技能 · ${expCount} 段经历</span>`;
  els.resumeBadge.className = 'resume-badge badge-ready';
}

// ---- API 调用 ----

const API_MATCH = '/api/match';
const API_GENERATE_DOCX = '/api/generate-docx';

async function callMatchAPI(body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(API_MATCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData;
      try { errorData = await response.json(); } catch (_) { errorData = { message: `服务器返回状态码 ${response.status}` }; }
      throw new MatchError('api', errorData.message || '匹配服务异常，请稍后重试', errorData);
    }

    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new MatchError('parse', '匹配结果解析失败，请重试');
    }

    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof MatchError) throw err;
    if (err.name === 'AbortError') throw new MatchError('timeout', '匹配请求超时，请检查网络后重试');
    throw new MatchError('network', '网络连接失败，请检查网络后重试');
  }
}

// ---- 生成流程 ----

async function handleGenerate() {
  const els = getElements();
  const jdText = els.jdTextarea ? els.jdTextarea.value.trim() : '';

  if (!currentResumeData && !currentDocxBase64) {
    showError(new Error('请先上传简历或使用默认简历'));
    return;
  }
  if (!jdText) {
    showError(new Error('请填写岗位 JD 描述'));
    return;
  }

  clearError();

  // 隐藏占位，显示加载
  if (els.resultPlaceholder) els.resultPlaceholder.style.display = 'none';
  if (els.resultContainer) els.resultContainer.style.display = 'none';
  if (els.downloadDocxBtn) els.downloadDocxBtn.style.display = 'none';
  if (els.loadingSpinner) els.loadingSpinner.style.display = 'flex';

  // 构建 API 请求体
  let apiBody;
  if (isDocxMode && currentDocxBase64) {
    apiBody = { docx: currentDocxBase64, jd: jdText };
  } else {
    apiBody = { resumeData: currentResumeData, jdText: jdText };
  }

  // 匹配阶段
  setUIState(AppState.MATCHING);
  let result;
  try {
    result = await callMatchAPI(apiBody);
  } catch (err) {
    if (els.loadingSpinner) els.loadingSpinner.style.display = 'none';
    if (els.resultPlaceholder) els.resultPlaceholder.style.display = '';
    showError(err, 'AI 匹配失败');
    return;
  }

  // 生成阶段
  setUIState(AppState.GENERATING);
  try {
    // 提取 display 和 optimizations（兼容新旧格式）
    const display = result.display || result;
    const optimizations = result.optimizations || [];
    const docxBase64 = result.docxBase64 || null;

    currentOptimizations = optimizations;
    currentApiDocxBase64 = docxBase64;

    renderResult(display);
  } catch (err) {
    if (els.loadingSpinner) els.loadingSpinner.style.display = 'none';
    if (els.resultPlaceholder) els.resultPlaceholder.style.display = '';
    showError(err, '页面渲染失败');
    return;
  }

  // 展示结果
  if (els.loadingSpinner) els.loadingSpinner.style.display = 'none';
  if (els.resultContainer) els.resultContainer.style.display = '';

  // 如果有优化建议且是 DOCX 模式，显示下载按钮
  if (els.downloadDocxBtn && currentOptimizations.length > 0 && currentApiDocxBase64) {
    els.downloadDocxBtn.style.display = '';
  }

  setUIState(AppState.PREVIEW);
}

// ---- 下载修改版 DOCX ----

async function handleDownloadDocx() {
  const els = getElements();
  const btn = els.downloadDocxBtn;
  if (!btn) return;

  if (!currentApiDocxBase64) {
    showError(new Error('缺少原始 DOCX 数据，请重新上传并生成'));
    return;
  }
  if (!currentOptimizations || currentOptimizations.length === 0) {
    showError(new Error('没有可应用的优化建议'));
    return;
  }

  // 提取职位名称作为 jobTitle
  const jdText = els.jdTextarea ? els.jdTextarea.value.trim() : '';
  const jobTitle = extractJobTitle(jdText) || '优化简历';

  // 禁用按钮，显示加载状态
  btn.disabled = true;
  btn.textContent = '正在生成 DOCX…';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(API_GENERATE_DOCX, {
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

    if (!response.ok) {
      let errorData;
      try { errorData = await response.json(); } catch (_) { errorData = { message: `服务器返回状态码 ${response.status}` }; }
      throw new Error(errorData.message || 'DOCX 生成失败');
    }

    // 读取二进制响应并触发下载
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume_optimized_${sanitizeFileName(jobTitle)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.textContent = '已下载!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '下载修改后简历 (.docx)';
      btn.classList.remove('copied');
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '下载修改后简历 (.docx)';
    if (err.name === 'AbortError') {
      showError(new Error('DOCX 生成超时，请重试'));
    } else {
      showError(err, 'DOCX 生成失败');
    }
  }
}

function extractJobTitle(jdText) {
  // 尝试从 JD 中提取职位名称
  const patterns = [
    /(?:职位|岗位|招聘)[：:\s]*[【\[]?([^】\]\n，,]{2,20})[】\]]?/,
    /(?:诚聘|急招|招聘)[：:\s]*[【\[]?([^】\]\n，,]{2,20})[】\]]?/,
    /(?:安全|网络|运维|开发|测试|数据|前端|后端|全栈|架构|产品|项目经理)[^，,\n]{0,8}(?:工程师|分析师|专家|经理|专员|主管|负责人|实习生|岗)/,
    /([一-鿿]{2,15}(?:工程师|分析师|专家|经理|专员|主管|负责人|实习生|岗))/,
  ];
  for (const re of patterns) {
    const match = jdText.match(re);
    if (match) return match[1] || match[0];
  }
  return '';
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50).trim() || 'resume';
}

// ---- 结果渲染 ----

function renderResult(profile) {
  currentProfile = profile;
  renderHero(profile.hero);
  renderSummary(profile.matchSummary);
  renderDimensions(profile);
  renderExperiences(profile.experienceShowcase);
  renderFooter(profile);
  bindCopyButtons();
}

function renderHero(hero) {
  const el = $('profileHero');
  if (!el) return;
  const tagsHTML = (hero.tags || []).map(t =>
    `<span class="hero-tag">${escapeHTML(t)}</span>`
  ).join('');
  el.innerHTML = `
    <h1 class="hero-title">${escapeHTML(hero.title || '')}</h1>
    <p class="hero-positioning">${escapeHTML(hero.positioning || '')}</p>
    <div class="hero-tags">${tagsHTML}</div>
    <p class="hero-summary">${escapeHTML(hero.summary || '')}</p>`;
}

function renderSummary(summary) {
  const el = $('profileSummary');
  if (!el || !summary) return;
  const strongestHTML = (summary.strongestMatches || []).map(s =>
    `<li>${escapeHTML(s)}</li>`
  ).join('');
  const riskHTML = (summary.riskOrGaps || []).map(s =>
    `<li>${escapeHTML(s)}</li>`
  ).join('');
  el.innerHTML = `
    <p class="summary-conclusion">${escapeHTML(summary.overallConclusion || '')}</p>
    <div class="summary-grid">
      <div class="summary-col">
        <h4><span class="dot dot-green"></span>最强匹配</h4>
        <ul>${strongestHTML || '<li>暂无</li>'}</ul>
      </div>
      <div class="summary-col">
        <h4><span class="dot dot-red"></span>风险/差距</h4>
        <ul>${riskHTML || '<li>暂无</li>'}</ul>
      </div>
    </div>`;
}

function renderDimensions(profile) {
  const el = $('profileDimensions');
  if (!el) return;

  const dims = [
    { key: 'abilityQualificationMatch', icon: '📋', label: '能力资历匹配', cls: 'dim-icon-ability' },
    { key: 'visionPlanningMatch', icon: '🎯', label: '理念规划匹配', cls: 'dim-icon-vision' },
    { key: 'statusFitMatch', icon: '⚡', label: '状态适配匹配', cls: 'dim-icon-status' },
    { key: 'qualityCharacterMatch', icon: '🌟', label: '素养性格匹配', cls: 'dim-icon-quality' },
  ];

  const cardsHTML = dims.map(d => {
    const data = profile[d.key];
    if (!data) return '';
    const evidenceHTML = (data.evidence || []).map(ev => `
      <li class="dim-evidence-item">
        <div class="dim-evidence-title">${escapeHTML(ev.title || '')}</div>
        <div class="dim-evidence-desc">${escapeHTML(ev.optimizedDescription || '')}</div>
        ${(ev.highlightedSkills || []).length ? `<div class="dim-evidence-skills">${ev.highlightedSkills.map(s => `<span class="dim-skill-tag">${escapeHTML(s)}</span>`).join('')}</div>` : ''}
        ${(ev.matchedJDRequirements || []).length ? `<div class="dim-evidence-jd">对应JD：${ev.matchedJDRequirements.map(s => escapeHTML(s)).join('；')}</div>` : ''}
        ${(ev.improvementSuggestions || []).length ? `<div class="dim-evidence-suggestion">优化建议：${ev.improvementSuggestions.map(s => escapeHTML(s)).join('；')}</div>` : ''}
      </li>
    `).join('');

    return `
      <div class="dimension-card">
        <div class="dim-card-header">
          <div class="dim-card-icon ${d.cls}">${d.icon}</div>
          <h3 class="dim-card-title">${d.label}</h3>
        </div>
        <p class="dim-card-conclusion">${escapeHTML(data.conclusion || '')}</p>
        <ul class="dim-evidence-list">${evidenceHTML}</ul>
      </div>`;
  }).join('');

  el.innerHTML = `
    <h2 class="section-heading">四维匹配分析</h2>
    <div class="dimensions-grid">${cardsHTML}</div>`;
}

function renderExperiences(experiences) {
  const el = $('profileExperiences');
  if (!el || !experiences || !experiences.length) return;

  const cardsHTML = experiences.map((exp, i) => `
    <div class="exp-card">
      <div class="exp-card-header">
        <h3 class="exp-card-name">${escapeHTML(exp.name || '经历 ' + (i + 1))}</h3>
        <span class="exp-card-badge">经历 ${i + 1}</span>
      </div>
      <p class="exp-card-desc">${escapeHTML(exp.optimizedDescription || '')}</p>
      ${(exp.highlightedSkills || []).length ? `<div class="exp-card-skills">${exp.highlightedSkills.map(s => `<span class="dim-skill-tag">${escapeHTML(s)}</span>`).join('')}</div>` : ''}
      ${(exp.matchedJDRequirements || []).length ? `<div class="exp-card-jd">对应JD：${exp.matchedJDRequirements.map(s => escapeHTML(s)).join('；')}</div>` : ''}
      ${(exp.improvementSuggestions || []).length ? `<div class="exp-card-suggestion">优化建议：${exp.improvementSuggestions.map(s => escapeHTML(s)).join('；')}</div>` : ''}
    </div>
  `).join('');

  el.innerHTML = `
    <h2 class="section-heading">岗位定制版经历展示</h2>
    ${cardsHTML}`;
}

function renderFooter(profile) {
  const el = $('profileFooter');
  if (!el) return;

  const highlightsHTML = (profile.interviewHighlights || []).map(h =>
    `<li>${escapeHTML(h)}</li>`
  ).join('');

  const missingHTML = (profile.missingInfoSuggestions || []).map(m =>
    `<li>${escapeHTML(m)}</li>`
  ).join('');

  const introText = escapeHTML(profile.finalSelfIntroduction || '');

  el.innerHTML = `
    <div class="footer-section">
      <h4>💡 面试亮点</h4>
      <ul class="footer-highlights">${highlightsHTML || '<li>暂无</li>'}</ul>
    </div>
    <div class="footer-section">
      <h4>📝 建议补充信息</h4>
      <ul class="footer-missing">${missingHTML || '<li>暂无</li>'}</ul>
    </div>
    <div class="footer-section">
      <h4>📋 可复制个人介绍</h4>
      <div class="footer-intro-box">
        <button class="footer-intro-copy" data-copy-target="intro">复制</button>
        <p class="footer-intro-text" id="introText">${introText}</p>
      </div>
    </div>`;
}

// ---- 复制功能 ----

function bindCopyButtons() {
  // 复制完整内容
  const copyFullBtn = $('copyFullBtn');
  if (copyFullBtn) {
    copyFullBtn.onclick = () => {
      const container = $('resultContainer');
      if (!container) return;
      const text = extractText(container);
      copyToClipboard(text).then(() => {
        copyFullBtn.textContent = '已复制!';
        copyFullBtn.classList.add('copied');
        setTimeout(() => {
          copyFullBtn.textContent = '复制完整内容';
          copyFullBtn.classList.remove('copied');
        }, 2000);
      });
    };
  }

  // 复制自我介绍
  const introCopyBtn = document.querySelector('.footer-intro-copy');
  if (introCopyBtn) {
    introCopyBtn.onclick = () => {
      const introText = $('introText');
      const text = introText ? introText.textContent : '';
      copyToClipboard(text).then(() => {
        introCopyBtn.textContent = '已复制!';
        introCopyBtn.classList.add('copied');
        setTimeout(() => {
          introCopyBtn.textContent = '复制';
          introCopyBtn.classList.remove('copied');
        }, 2000);
      });
    };
  }
}

function extractText(container) {
  // 递归提取纯文本，保留合理换行
  const lines = [];
  function walk(node, depth) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) lines.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') { lines.push(''); return; }
    if (tag === 'li') { lines.push('• ' + (node.textContent || '').trim()); return; }
    if (tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'div') {
      for (const child of node.childNodes) walk(child, depth + 1);
      lines.push('');
      return;
    }
    for (const child of node.childNodes) walk(child, depth);
  }
  walk(container, 0);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ---- 事件绑定 ----

function bindEvents() {
  const els = getElements();

  if (els.fileInput) {
    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files[0];
      if (file) loadResumeFromFile(file);
    });
  }

  if (els.dropZone) {
    els.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.dropZone.classList.add('drag-over');
    });
    els.dropZone.addEventListener('dragleave', () => {
      els.dropZone.classList.remove('drag-over');
    });
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) loadResumeFromFile(file);
    });
    els.dropZone.addEventListener('click', () => {
      if (els.fileInput) els.fileInput.click();
    });
  }

  if (els.useDefaultBtn) {
    els.useDefaultBtn.addEventListener('click', loadDefaultResume);
  }

  if (els.generateBtn) {
    els.generateBtn.addEventListener('click', handleGenerate);
  }

  if (els.jdTextarea) {
    els.jdTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    });
  }

  if (els.downloadDocxBtn) {
    els.downloadDocxBtn.addEventListener('click', handleDownloadDocx);
  }
}

// ---- 初始化 ----

function init() {
  bindEvents();
  setUIState(AppState.IDLE);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
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
