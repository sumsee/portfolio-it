// 简历解析模块 — PDF/DOCX → 结构化 JSON
// 依赖: pdf.js (CDN), mammoth.js (CDN) — 由 index.html 引入

const SKILL_KEYWORDS = [
  'Python', 'Java', 'C语言', 'C\\+\\+', 'JavaScript', 'Go', 'Rust', 'PHP', 'Ruby',
  'Wireshark', 'BurpSuite', 'Nmap', 'Nessus', 'AWVS', 'Metasploit', 'Sqlmap',
  '防火墙', 'IDS', 'IPS', 'WAF', 'EDR', 'SIEM', '态势感知', '天眼', '天融信',
  '渗透测试', '漏洞扫描', '应急响应', '流量分析', '日志分析', '安全审计', '溯源',
  '等保', '等级保护', '风险评估', '安全基线', '合规',
  'Linux', 'Windows', 'Docker', 'Kubernetes', 'VMware',
  'TCP/IP', 'HTTP', 'HTTPS', 'DNS', 'VPN', 'SSL', 'TLS',
  'Office', '文档编写', '项目管理', '竞品分析',
  '逆向', '恶意代码', '病毒分析', '钓鱼', '木马',
  '网络安全', '信息安全', '网络空间安全', '数据安全', '密码学',
  'Process Monitor', '火绒剑', 'ACL', 'OWASP',
];

const CERT_KEYWORDS = [
  '软考', 'NISP', 'CISP', 'CISSP', 'CISA', 'CEH', 'OSCP',
  'CNVD', 'CNNVD', 'CVE',
  '教师资格证', 'CET-[46]', '英语[四六]级',
  '驾驶证', 'CCNA', 'CCNP', 'HCIA', 'HCIP', 'HCIE',
  '信息安全工程师', '网络工程师', '蓝桥杯', 'ACM',
];

/**
 * 解析简历文件，返回结构化 JSON
 * @param {File} file
 * @returns {Promise<{name: string, skills: string[], experience: Array, education: Array, certs: string[], rawText: string}>}
 */
export async function parseResumeFile(file) {
  const type = detectType(file);
  if (!type) throw new Error('不支持的文件格式，请上传 PDF 或 DOCX 文件');

  const text = type === 'pdf'
    ? await extractPdfText(file)
    : await extractDocxText(file);

  if (!text.trim()) throw new Error('未能从文件中提取到文本内容');

  return buildStructuredData(text);
}

function detectType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return null;
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => it.str).join(' ');
    parts.push(pageText);
  }
  return parts.join('\n').trim();
}

async function extractDocxText(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value.trim();
}

// ---- 结构化提取 ----

function buildStructuredData(rawText) {
  const clean = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return {
    name: extractName(clean),
    skills: extractSkills(clean),
    experience: extractExperience(clean),
    education: extractEducation(clean),
    certs: extractCerts(clean),
    rawText: clean.substring(0, 1500),
  };
}

function extractName(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    const s = line.replace(/[【】\[\]（）()\s简历个人]/g, '').trim();
    // 支持纯中文、中英混合、英文名（含空格/点/连字符）
    if (s.length >= 2 && s.length <= 30 && /^[一-鿿a-zA-Z.\-·\s]+$/.test(s)) {
      return s;
    }
  }
  return '';
}

function extractSkills(text) {
  const found = [];
  for (const kw of SKILL_KEYWORDS) {
    try {
      if (new RegExp(kw, 'i').test(text) && !found.includes(kw)) {
        found.push(kw);
      }
    } catch (_) { /* 跳过无效正则 */ }
  }
  return found;
}

function extractExperience(text) {
  const exp = [];
  const re = /(20\d{2}[.\-/年]\d{1,2})[\s~\-–至到]+(20\d{2}[.\-/年]\d{1,2}|至今|现在)/gi;
  for (const m of text.matchAll(re)) {
    const idx = m.index;
    const before = text.substring(Math.max(0, idx - 80), idx).trim();
    const after = text.substring(idx + m[0].length, Math.min(text.length, idx + m[0].length + 300)).trim();
    const roleMatch = before.match(/([一-鿿]{2,12}(?:工程师|分析师|专家|经理|专员|主管|负责人|实习生|岗))/);
    const orgMatch = before.match(/([一-鿿]{2,15}(?:公司|集团|银行|保险|联通|电信|移动|科技|网络|大学|学院|政府|局|所))/);
    exp.push({
      title: roleMatch ? roleMatch[1] : before.split(/[,，、\n]/).pop()?.trim() || '',
      organization: orgMatch ? orgMatch[1] : '',
      period: m[0],
      description: after.substring(0, 250).trim(),
    });
  }
  return exp;
}

function extractEducation(text) {
  const edu = [];
  const schoolRe = /([一-鿿]{2,12}(?:大学|学院|学校))/g;
  for (const m of text.matchAll(schoolRe)) {
    const ctx = text.substring(m.index, Math.min(text.length, m.index + 120));
    const majorMatch = ctx.match(/专业[：:]\s*([^\n,，]{2,20})/);
    const degreeMatch = ctx.match(/(本科|硕士|博士|大专|学士|研究生)/);
    const periodMatch = ctx.match(/(20\d{2}[.\-/年]?\d{0,2})[\s~\-–至到]+(20\d{2}[.\-/年]?\d{0,2}|至今)/);
    const gpaMatch = ctx.match(/GPA[：:＝=]*\s*([\d.]{3,4})/);
    edu.push({
      school: m[1],
      major: majorMatch ? majorMatch[1] : '',
      degree: degreeMatch ? degreeMatch[1] : '',
      period: periodMatch ? periodMatch[0] : '',
      gpa: gpaMatch ? gpaMatch[1] : '',
    });
  }
  return edu;
}

function extractCerts(text) {
  const found = [];
  for (const kw of CERT_KEYWORDS) {
    try {
      const re = new RegExp(`(${kw}[^\\n,，。.]{0,20})`, 'gi');
      for (const m of text.matchAll(re)) {
        const v = m[1].trim();
        if (!found.includes(v)) found.push(v);
      }
    } catch (_) { /* skip */ }
  }
  return found;
}
