// app.js — 工具主控逻辑
// 串联 上传→解析→匹配→生成→预览→下载 完整流程

import { parseResumeFile } from './modules/parser.js';
import { defaultResumeData } from './modules/data.js';
import {
  matchResumeToJD,
  MatchStatus,
  MatchError,
  getErrorMessage,
  getMatchLevel,
} from './modules/matcher.js';
import {
  generatePortfolioHTML,
  generateMatchReportHTML,
} from './modules/generator.js';

// ---- 应用级状态 ----

const AppState = {
  IDLE: 'idle',
  PARSING: 'parsing',
  READY: 'ready',         // 简历就绪，等待 JD
  MATCHING: 'matching',
  GENERATING: 'generating',
  PREVIEW: 'preview',
  ERROR: 'error',
};

let appState = AppState.IDLE;
let currentResumeData = null;   // 当前简历数据
let currentFileName = '';       // 用户上传的文件名
let generatedHTML = '';         // 最后一次生成的 HTML
let currentProfile = null;      // 最后一次匹配结果

// ---- DOM 引用（由 T7 index.html 提供）----

const $ = (id) => document.getElementById(id);

function getElements() {
  return {
    fileInput: $('fileInput'),
    dropZone: $('dropZone'),
    useDefaultBtn: $('useDefaultBtn'),
    jdTextarea: $('jdTextarea'),
    generateBtn: $('generateBtn'),
    previewFrame: $('previewFrame'),
    matchReport: $('matchReport'),
    downloadBtn: $('downloadBtn'),
    statusText: $('statusText'),
    errorContainer: $('errorContainer'),
    resumeBadge: $('resumeBadge'),
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
  if (els.downloadBtn) {
    els.downloadBtn.style.display = state === AppState.PREVIEW ? '' : 'none';
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
  // 3 秒后自动恢复
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

// ---- 简历加载 ----

async function loadResumeFromFile(file) {
  clearError();
  setUIState(AppState.PARSING);
  try {
    const data = await parseResumeFile(file);
    currentResumeData = data;
    currentFileName = file.name;
    showResumeBadge(file.name, data);
    setUIState(AppState.READY);
  } catch (err) {
    showError(err, '简历解析失败');
  }
}

function loadDefaultResume() {
  clearError();
  currentResumeData = { ...defaultResumeData };
  currentFileName = '默认简历（吴友虎）';
  showResumeBadge('默认简历', currentResumeData);
  setUIState(AppState.READY);
}

function showResumeBadge(label, data) {
  const els = getElements();
  if (!els.resumeBadge) return;
  const skillCount = data.skills ? data.skills.length : 0;
  const expCount = data.experience ? data.experience.length : 0;
  els.resumeBadge.innerHTML = `<span class="badge-icon">&#10003;</span>
    <span class="badge-label">${escapeHTML(label)}</span>
    <span class="badge-detail">${skillCount} 技能 · ${expCount} 段经历</span>`;
  els.resumeBadge.className = 'resume-badge badge-ready';
}

// ---- 生成流程 ----

async function handleGenerate() {
  const els = getElements();
  const jdText = els.jdTextarea ? els.jdTextarea.value.trim() : '';

  if (!currentResumeData) {
    showError(new Error('请先上传简历或使用默认简历'));
    return;
  }
  if (!jdText) {
    showError(new Error('请填写岗位 JD 描述'));
    return;
  }

  clearError();

  // 匹配阶段
  setUIState(AppState.MATCHING);
  let profile;
  try {
    profile = await matchResumeToJD(currentResumeData, jdText);
  } catch (err) {
    showError(err, 'AI 匹配失败');
    return;
  }

  // 生成阶段
  setUIState(AppState.GENERATING);
  try {
    generatedHTML = generatePortfolioHTML(profile);
  } catch (err) {
    showError(err, '页面生成失败');
    return;
  }

  currentProfile = profile;

  // 展示结果
  showPreview(generatedHTML);
  showMatchReport(profile);
  setUIState(AppState.PREVIEW);
}

// ---- 预览 & 下载 ----

function showPreview(html) {
  const els = getElements();
  if (!els.previewFrame) return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  els.previewFrame.src = URL.createObjectURL(blob);
}

function showMatchReport(profile) {
  const els = getElements();
  if (!els.matchReport) return;
  els.matchReport.innerHTML = generateMatchReportHTML(profile);
  els.matchReport.style.display = '';
}

function handleDownload() {
  if (!generatedHTML) return;
  const blob = new Blob([generatedHTML], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentResumeData?.name || 'portfolio') + '_展示页.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- 事件绑定 ----

function bindEvents() {
  const els = getElements();

  // 文件选择
  if (els.fileInput) {
    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files[0];
      if (file) loadResumeFromFile(file);
    });
  }

  // 拖拽上传
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
    // 点击触发文件选择
    els.dropZone.addEventListener('click', () => {
      if (els.fileInput) els.fileInput.click();
    });
  }

  // 默认简历
  if (els.useDefaultBtn) {
    els.useDefaultBtn.addEventListener('click', loadDefaultResume);
  }

  // 生成按钮
  if (els.generateBtn) {
    els.generateBtn.addEventListener('click', handleGenerate);
  }

  // 下载按钮
  if (els.downloadBtn) {
    els.downloadBtn.addEventListener('click', handleDownload);
  }

  // Ctrl+Enter 快捷生成
  if (els.jdTextarea) {
    els.jdTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    });
  }
}

// ---- 初始化 ----

function init() {
  bindEvents();
  setUIState(AppState.IDLE);
}

// 页面加载完成后自动初始化
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
