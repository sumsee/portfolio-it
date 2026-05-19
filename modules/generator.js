// 页面生成引擎 — GeneratedProfile → 自包含 HTML
// 复用现有 dark theme 样式，内联 CSS/JS，生成可直接保存的 HTML 文件

const CSS = `/* 全局重置 */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
    "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  background-color: #000000;
  color: #ffffff;
  line-height: 1.6;
  overflow-x: hidden;
}

/* 导航栏 */
.navbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  padding: 20px 40px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.nav-container {
  max-width: 1400px; margin: 0 auto;
  display: flex; justify-content: space-between; align-items: center;
}
.nav-logo { font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }

/* Hero */
.hero-section {
  min-height: 50vh; display: flex; align-items: center; justify-content: center;
  padding: 100px 20px 40px;
}
.hero-content { text-align: center; animation: fadeInUp 1s ease-out; }
.avatar-container { margin-bottom: 30px; }
.avatar {
  width: 150px; height: 150px; border-radius: 50%; object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.hero-name {
  font-size: 72px; font-weight: 700; letter-spacing: -2px; margin-bottom: 20px;
  background: linear-gradient(135deg, #ffffff 0%, #a5a5a5 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-tags {
  display: flex; gap: 15px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap;
}
.tag {
  padding: 10px 22px; border-radius: 20px; font-size: 15px; font-weight: 500;
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
}
.party-tag { background: rgba(255, 59, 48, 0.2); border: 1px solid rgba(255, 59, 48, 0.4); color: #ff3b30; }
.cert-tag  { background: rgba(10, 132, 255, 0.2); border: 1px solid rgba(10, 132, 255, 0.4); color: #0a84ff; }
.highlight-tag { background: rgba(48, 209, 88, 0.2); border: 1px solid rgba(48, 209, 88, 0.4); color: #30d158; }
.hero-subtitle { font-size: 24px; color: #86868b; font-weight: 400; letter-spacing: 0.5px; }

/* Bento Grid */
.bento-section { padding: 40px 40px 80px; }
.bento-grid {
  max-width: 1400px; margin: 0 auto;
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;
}
.bento-card {
  background: rgba(28, 28, 30, 0.8);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px;
  padding: 40px; cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative; overflow: hidden; min-height: 220px;
  display: flex; flex-direction: column; justify-content: space-between;
}
.bento-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 50%);
  opacity: 0; transition: opacity 0.4s ease;
}
.bento-card:hover {
  transform: translateY(-8px); background: rgba(44, 44, 46, 0.9);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}
.bento-card:hover::before { opacity: 1; }
.card-icon { font-size: 48px; margin-bottom: 20px; }
.card-title { font-size: 32px; font-weight: 700; margin-bottom: 12px; letter-spacing: -0.5px; }
.card-preview { font-size: 18px; color: #86868b; line-height: 1.5; }
.card-arrow { font-size: 32px; color: #0a84ff; font-weight: 300; transition: transform 0.3s ease; }
.bento-card:hover .card-arrow { transform: translateX(8px); }

/* Modal */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; visibility: hidden;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 40px;
}
.modal-overlay.active { opacity: 1; visibility: visible; }
.modal-container {
  background: rgba(28, 28, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 32px;
  max-width: 900px; width: 100%; max-height: 85vh; overflow-y: auto;
  position: relative;
  transform: scale(0.9) translateY(20px);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 50px 100px rgba(0, 0, 0, 0.8);
}
.modal-overlay.active .modal-container { transform: scale(1) translateY(0); }
.modal-close {
  position: absolute; top: 24px; right: 24px;
  width: 44px; height: 44px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.1); border: none;
  color: #fff; font-size: 28px; cursor: pointer;
  transition: all 0.3s ease;
  display: flex; align-items: center; justify-content: center; line-height: 1;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.2); transform: rotate(90deg); }
.modal-content { padding: 60px 50px 50px; }
.modal-header { margin-bottom: 40px; }
.modal-icon { font-size: 56px; margin-bottom: 20px; }
.modal-title { font-size: 48px; font-weight: 700; letter-spacing: -1px; margin-bottom: 10px; }
.modal-subtitle { font-size: 20px; color: #86868b; }
.modal-section { margin-bottom: 35px; }
.modal-section:last-child { margin-bottom: 0; }
.modal-section-title {
  font-size: 22px; font-weight: 600; color: #0a84ff; margin-bottom: 15px;
  display: flex; align-items: center; gap: 10px;
}
.modal-section-title::before {
  content: ''; width: 4px; height: 22px; background: #0a84ff; border-radius: 2px;
}
.modal-section-content { padding-left: 14px; }
.modal-list { list-style: none; }
.modal-list li {
  padding: 12px 0; font-size: 17px; color: #f5f5f7; line-height: 1.7;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.modal-list li:last-child { border-bottom: none; }
.modal-list li strong { color: #fff; font-weight: 600; }
.modal-list .highlight { color: #ffd60a; font-weight: 600; }
.modal-list .success { color: #30d158; }
.certificate-image {
  max-width: 100%; border-radius: 12px; margin-top: 15px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 992px) {
  .hero-name { font-size: 52px; }
  .bento-grid { grid-template-columns: 1fr; }
  .card-title { font-size: 28px; }
  .modal-content { padding: 50px 40px 40px; }
  .modal-title { font-size: 38px; }
}
@media (max-width: 576px) {
  .navbar { padding: 15px 20px; }
  .hero-name { font-size: 40px; }
  .hero-subtitle { font-size: 18px; }
  .bento-section { padding: 20px 20px 60px; }
  .bento-card { padding: 30px; min-height: 180px; }
  .card-title { font-size: 24px; }
  .modal-overlay { padding: 20px; }
  .modal-content { padding: 50px 25px 30px; }
  .modal-title { font-size: 32px; }
}`;

const TAG_CLASS = {
  cert: 'party-tag',
  skill: 'cert-tag',
  highlight: 'highlight-tag',
};

// ---- 导出函数 ----

/**
 * 生成完整展示页 HTML（自包含，可直接保存为 .html 文件）
 * @param {Object} profile — GeneratedProfile（来自 matcher.js）
 * @returns {string} 完整 HTML 文档
 */
export function generatePortfolioHTML(profile) {
  const { hero, sections } = profile.tailoredContent;

  // 按 priority 升序排列 sections
  const sorted = [...sections].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  const heroHTML = buildHeroHTML(hero);
  const bentoHTML = buildBentoHTML(sorted);
  const sectionsJSON = JSON.stringify(buildSectionsData(sorted));

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(hero.name)} - 个人展示</title>
<style>${CSS}</style>
</head>
<body>
<nav class="navbar">
  <div class="nav-container">
    <div class="nav-logo">${escapeHTML(hero.name)}</div>
  </div>
</nav>

<main class="main-content">
  ${heroHTML}
  <section class="bento-section">${bentoHTML}</section>
</main>

<div class="modal-overlay" id="modalOverlay">
  <div class="modal-container">
    <button class="modal-close" id="modalClose">&times;</button>
    <div class="modal-content" id="modalContent"></div>
  </div>
</div>

<script>
var _sections = ${sectionsJSON};

var modalOverlay = document.getElementById('modalOverlay');
var modalClose  = document.getElementById('modalClose');
var modalContent = document.getElementById('modalContent');
var bentoCards  = document.querySelectorAll('.bento-card');

function openModal(id) {
  var sec = _sections[id];
  if (!sec) return;
  var itemsHTML = '';
  sec.items.forEach(function(item) {
    itemsHTML += '<div class="modal-section">'
      + '<h4 class="modal-section-title">' + item.title + '</h4>'
      + '<div class="modal-section-content">' + item.content + '</div>'
      + '</div>';
  });
  modalContent.innerHTML = '<div class="modal-header">'
    + '<div class="modal-icon">' + sec.icon + '</div>'
    + '<h2 class="modal-title">' + sec.title + '</h2>'
    + '<p class="modal-subtitle">' + sec.subtitle + '</p>'
    + '</div>' + itemsHTML;
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

bentoCards.forEach(function(card) {
  card.addEventListener('click', function() {
    openModal(card.dataset.modal);
  });
});
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', function(e) {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && modalOverlay.classList.contains('active')) closeModal();
});
</script>
</body>
</html>`;
}

/**
 * 生成匹配分析报告 HTML 片段（供预览面板使用）
 * @param {Object} profile — GeneratedProfile
 * @returns {string} HTML 片段
 */
export function generateMatchReportHTML(profile) {
  const level = getLevel(profile.matchScore);

  const highlightsHTML = profile.highlights.map(h => `
    <li class="report-highlight">
      <span class="hl-skill">${escapeHTML(h.skill)}</span>
      <span class="hl-reason">${escapeHTML(h.reason)}</span>
    </li>`).join('');

  const suggestionsHTML = profile.suggestions.map(s =>
    `<li class="report-suggestion">${escapeHTML(s)}</li>`
  ).join('');

  const missingHTML = (profile.missingSkills || []).map(s =>
    `<span class="missing-tag">${escapeHTML(s)}</span>`
  ).join('');

  return `<div class="match-report">
  <div class="report-header">
    <div class="score-ring" style="--score:${profile.matchScore}; border-color:${level.color}">
      <span class="score-num">${profile.matchScore}</span>
      <span class="score-label">分</span>
    </div>
    <div class="report-summary">
      <h3 class="report-level" style="color:${level.color}">${level.label}</h3>
      <p class="report-text">${escapeHTML(profile.summary)}</p>
    </div>
  </div>

  ${profile.highlights.length ? `
  <div class="report-block">
    <h4 class="report-block-title">匹配亮点</h4>
    <ul class="report-highlights">${highlightsHTML}</ul>
  </div>` : ''}

  ${profile.suggestions.length ? `
  <div class="report-block">
    <h4 class="report-block-title">优化建议</h4>
    <ul class="report-suggestions">${suggestionsHTML}</ul>
  </div>` : ''}

  ${profile.missingSkills && profile.missingSkills.length ? `
  <div class="report-block">
    <h4 class="report-block-title">技能差距</h4>
    <div class="missing-tags">${missingHTML}</div>
  </div>` : ''}
</div>`;
}

// ---- 内部构建函数 ----

function buildHeroHTML(hero) {
  const tagsHTML = (hero.tags || []).map(t =>
    `<span class="tag ${TAG_CLASS[t.type] || 'cert-tag'}">${escapeHTML(t.text)}</span>`
  ).join('\n');

  return `<section class="hero-section">
  <div class="hero-content">
    <div class="avatar-container">
      <img src="assets/avatar.jpg" alt="${escapeHTML(hero.name)}" class="avatar">
    </div>
    <h1 class="hero-name">${escapeHTML(hero.name)}</h1>
    <div class="hero-tags">${tagsHTML}</div>
    <p class="hero-subtitle">${escapeHTML(hero.subtitle || '')}</p>
  </div>
</section>`;
}

function buildBentoHTML(sections) {
  return `<div class="bento-grid">${sections.map(s => `
    <div class="bento-card" data-modal="${escapeHTML(s.id)}">
      <div class="card-icon">${escapeHTML(s.icon)}</div>
      <h3 class="card-title">${escapeHTML(s.title)}</h3>
      <p class="card-preview">${escapeHTML(s.subtitle)}</p>
      <div class="card-arrow">&rarr;</div>
    </div>`).join('')}
  </div>`;
}

function buildSectionsData(sections) {
  const map = {};
  sections.forEach(s => {
    map[s.id] = {
      icon: s.icon,
      title: s.title,
      subtitle: s.subtitle,
      items: s.items || [],
    };
  });
  return map;
}

function getLevel(score) {
  if (score >= 85) return { label: '高度匹配', color: '#30d158' };
  if (score >= 70) return { label: '较为匹配', color: '#0a84ff' };
  if (score >= 50) return { label: '部分匹配', color: '#ffd60a' };
  return { label: '匹配度较低', color: '#ff3b30' };
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
