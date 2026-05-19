/**
 * API 本地测试脚本
 *
 * 用法: node api/test.js
 *
 * 前置条件:
 *   1. 设置环境变量 DEEPSEEK_API_KEY（真实调用时需要）
 *   2. 或使用 --mock 模式跳过 API 调用（仅测试输入/输出结构）
 *
 *   node api/test.js --mock    → 仅测试数据结构完整性
 *   node api/test.js           → 真实调用 DeepSeek API
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ============================================================
// 测试数据
// ============================================================

/** 示例 JD — 网络安全运营工程师 */
const SAMPLE_JD = `岗位名称：网络安全运营工程师

岗位职责：
1. 负责公司安全监控平台的日常运营，对安全告警进行分析、研判和处置；
2. 使用SIEM、EDR、态势感知等安全工具，识别和响应网络攻击事件；
3. 对安全事件进行溯源分析，输出事件分析报告和整改建议；
4. 参与安全策略优化，对防火墙、WAF等安全设备的策略进行调优；
5. 配合完成等保测评、安全基线检查等合规工作；
6. 编写安全运营相关文档和流程规范。

任职要求：
1. 本科及以上学历，网络空间安全、信息安全、计算机等相关专业；
2. 熟悉常见网络攻击手法（OWASP TOP10）及防御方法；
3. 具备Wireshark等流量分析工具的使用经验；
4. 了解等级保护2.0标准体系和测评流程；
5. 有护网、重保等安全实战经验者优先；
6. 持有安全相关认证（CISP、NISP、软考等）者优先；
7. 具备良好的文档编写和沟通表达能力。`;

// ============================================================
// 测试框架（轻量，零依赖）
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function assertDeepEqual(a, b, label) {
  const eq = JSON.stringify(a) === JSON.stringify(b);
  if (eq) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
    console.error(`    期望: ${JSON.stringify(b)}`);
    console.error(`    实际: ${JSON.stringify(a)}`);
  }
}

function summary() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败 (共 ${passed + failed})`);
  console.log(`${'='.repeat(50)}\n`);
  return failed === 0;
}

// ============================================================
// 测试套件
// ============================================================

// ---- Suite 1: 输入验证（不调用 API）----

async function testInputValidation() {
  console.log('\n📋 Suite 1: 输入验证');

  // 动态 import handler（ESM）
  const { default: handler } = await import('../api/match.js');

  // 辅助: 创建 mock req/res
  function mockReqRes(method, body) {
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return res; },
      json(data) { responseBody = data; statusCode = statusCode || 200; },
      getStatus() { return statusCode; },
      getBody() { return responseBody; },
    };
    return { req: { method, body }, res };
  }

  // Test 1: 非 POST 拒绝
  {
    const { req, res } = mockReqRes('GET', {});
    await handler(req, res);
    assert(res.getStatus() === 405, 'GET 请求返回 405');
    assert(res.getBody().error === 'Method Not Allowed', '错误类型为 Method Not Allowed');
  }

  // Test 2: 空 resumeData 拒绝
  {
    const { req, res } = mockReqRes('POST', { resumeData: {}, jdText: 'test' });
    await handler(req, res);
    assert(res.getStatus() === 400, '空 resumeData 返回 400');
  }

  // Test 3: 缺 jdText 拒绝
  {
    const { req, res } = mockReqRes('POST', { resumeData: { name: 'test' } });
    await handler(req, res);
    assert(res.getStatus() === 400, '缺 jdText 返回 400');
  }

  // Test 4: jdText 空字符串拒绝
  {
    const { req, res } = mockReqRes('POST', { resumeData: { name: 'test' }, jdText: '   ' });
    await handler(req, res);
    assert(res.getStatus() === 400, '空格 jdText 返回 400');
  }

  // Test 5: 有效输入通过验证（但无 API Key 会到下一个检查点）
  {
    // 临时屏蔽 API Key 以模拟未配置环境
    const savedKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    const { req, res } = mockReqRes('POST', {
      resumeData: { name: '张三', skills: ['Python'] },
      jdText: '招聘 Python 工程师',
    });
    await handler(req, res);

    // 恢复 API Key
    if (savedKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = savedKey;
    }

    // 无 API Key 应返回 500（Server Configuration Error）
    assert(res.getStatus() === 500, '有效输入但无 API Key → 500');
    const body = res.getBody();
    assert(body && typeof body.message === 'string' && body.message.includes('API Key'),
      '错误信息包含 API Key 提示');
  }
}

// ---- Suite 2: 结构化数据校验 ----

async function testResumeDataStructure() {
  console.log('\n📋 Suite 2: 默认简历数据结构');

  const { defaultResumeData: data } = await import('../modules/data.js');

  assert(typeof data.name === 'string' && data.name.length > 0, 'name 是非空字符串');
  assert(Array.isArray(data.skills) && data.skills.length > 0, 'skills 是非空数组');
  assert(Array.isArray(data.experience) && data.experience.length > 0, 'experience 是非空数组');
  assert(Array.isArray(data.education) && data.education.length > 0, 'education 是非空数组');
  assert(Array.isArray(data.certs) && data.certs.length > 0, 'certs 是非空数组');
  assert(Array.isArray(data.honors) && data.honors.length > 0, 'honors 是非空数组');
}

// ---- Suite 3: Mock Profile 校验 ----

function testMockProfile() {
  console.log('\n📋 Suite 3: Mock Profile 结构完整性');

  const profile = JSON.parse(
    readFileSync(resolve(PROJECT_ROOT, 'modules/mock-profile.json'), 'utf-8')
  );

  // 顶层字段
  assert(typeof profile.matchScore === 'number' && profile.matchScore >= 0 && profile.matchScore <= 100,
    'matchScore 是 0-100 的数字');
  assert(typeof profile.summary === 'string' && profile.summary.length > 0,
    'summary 是非空字符串');
  assert(Array.isArray(profile.highlights) && profile.highlights.length > 0,
    'highlights 是非空数组');
  assert(Array.isArray(profile.suggestions) && profile.suggestions.length > 0,
    'suggestions 是非空数组');
  assert(Array.isArray(profile.missingSkills),
    'missingSkills 是数组');

  // highlights 元素形式
  const h = profile.highlights[0];
  assert(typeof h.skill === 'string', 'highlight.skill 是字符串');
  assert(['high', 'medium'].includes(h.relevance), 'highlight.relevance 是 high 或 medium');
  assert(typeof h.reason === 'string', 'highlight.reason 是字符串');

  // tailoredContent
  const tc = profile.tailoredContent;
  assert(tc && typeof tc === 'object', 'tailoredContent 存在');

  // hero
  assert(typeof tc.hero.name === 'string' && tc.hero.name.length > 0,
    'tailoredContent.hero.name 是非空字符串');
  assert(Array.isArray(tc.hero.tags) && tc.hero.tags.length > 0,
    'tailoredContent.hero.tags 是非空数组');
  tc.hero.tags.forEach((tag, i) => {
    assert(typeof tag.text === 'string', `hero.tags[${i}].text 是字符串`);
    assert(['cert', 'skill', 'highlight'].includes(tag.type),
      `hero.tags[${i}].type 是合法值`);
  });
  assert(typeof tc.hero.subtitle === 'string' && tc.hero.subtitle.length > 0,
    'tailoredContent.hero.subtitle 是非空字符串');

  // sections
  assert(Array.isArray(tc.sections) && tc.sections.length > 0,
    'tailoredContent.sections 是非空数组');

  const validIds = ['experience', 'skills', 'education', 'quality'];
  tc.sections.forEach((section, i) => {
    assert(validIds.includes(section.id),
      `sections[${i}].id 是合法值 (${section.id})`);
    assert(typeof section.icon === 'string' && section.icon.length > 0,
      `sections[${i}].icon 是非空字符串`);
    assert(typeof section.title === 'string' && section.title.length > 0,
      `sections[${i}].title 是非空字符串`);
    assert(typeof section.subtitle === 'string',
      `sections[${i}].subtitle 是字符串`);
    assert(typeof section.priority === 'number',
      `sections[${i}].priority 是数字`);
    assert(Array.isArray(section.items) && section.items.length > 0,
      `sections[${i}].items 是非空数组`);

    section.items.forEach((item, j) => {
      assert(typeof item.title === 'string',
        `sections[${i}].items[${j}].title 是字符串`);
      assert(typeof item.content === 'string' && item.content.length > 0,
        `sections[${i}].items[${j}].content 是非空字符串`);
      // content 应该是 HTML
      assert(item.content.includes('<') && item.content.includes('>'),
        `sections[${i}].items[${j}].content 包含 HTML 标签`);
    });
  });

  // sections 是否按 priority 排序
  for (let i = 1; i < tc.sections.length; i++) {
    assert(tc.sections[i].priority >= tc.sections[i - 1].priority,
      `sections 按 priority 升序排列 (${tc.sections[i - 1].priority} → ${tc.sections[i].priority})`);
  }
}

// ---- Suite 4: matcher.js 模块导出 ----

async function testMatcherExports() {
  console.log('\n📋 Suite 4: matcher.js 模块导出');

  const matcher = await import('../modules/matcher.js');

  assert(typeof matcher.matchResumeToJD === 'function',
    '导出 matchResumeToJD 函数');
  assert(typeof matcher.MatchStatus === 'object',
    '导出 MatchStatus 枚举');
  assert(typeof matcher.MatchError === 'function',
    '导出 MatchError 类');
  assert(typeof matcher.getErrorMessage === 'function',
    '导出 getErrorMessage 函数');
  assert(typeof matcher.getMatchLevel === 'function',
    '导出 getMatchLevel 函数');
}

// ---- Suite 5: getMatchLevel 在 main() 中内联 ----


// ============================================================
// 运行全部测试
// ============================================================

async function main() {
  console.log('🧪 API Agent 测试套件\n');
  console.log(`项目根目录: ${PROJECT_ROOT}`);

  const useMock = process.argv.includes('--mock');

  if (useMock) {
    console.log('模式: --mock（跳过真实 API 调用）');
  } else {
    console.log('模式: 真实调用（需要 DEEPSEEK_API_KEY 环境变量）');
  }

  try {
    // Suite 1-4 始终运行
    await testInputValidation();
    await testResumeDataStructure();
    testMockProfile();
    await testMatcherExports();

    // Suite 5 需要在 Suite 4 后运行（动态 import 完成）
    // 这里重新 import 一次保证执行
    const { getMatchLevel } = await import('../modules/matcher.js');
    console.log('\n📋 Suite 5: getMatchLevel 边界值');
    assert(getMatchLevel(95).level === 'excellent', '95分 → excellent');
    assert(getMatchLevel(85).level === 'excellent', '85分 → excellent');
    assert(getMatchLevel(84).level === 'good', '84分 → good');
    assert(getMatchLevel(70).level === 'good', '70分 → good');
    assert(getMatchLevel(69).level === 'fair', '69分 → fair');
    assert(getMatchLevel(50).level === 'fair', '50分 → fair');
    assert(getMatchLevel(49).level === 'low', '49分 → low');
    assert(getMatchLevel(0).level === 'low', '0分 → low');
    assert(getMatchLevel(95).label === '高度匹配', '标签 → 高度匹配');
    assert(getMatchLevel(75).label === '较为匹配', '标签 → 较为匹配');
    assert(getMatchLevel(55).label === '部分匹配', '标签 → 部分匹配');
    assert(getMatchLevel(30).label === '匹配度较低', '标签 → 匹配度较低');

    // Suite 6: 真实 API 调用（仅在非 mock 模式）
    if (!useMock && process.env.DEEPSEEK_API_KEY) {
      console.log('\n📋 Suite 6: 真实 DeepSeek API 调用');
      const { default: handler } = await import('../api/match.js');
      const { defaultResumeData: resumeData } = await import('../modules/data.js');

      let statusCode = null;
      let responseBody = null;
      const req = {
        method: 'POST',
        body: { resumeData, jdText: SAMPLE_JD },
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { responseBody = data; statusCode = statusCode || 200; },
      };

      console.log('  正在调用 DeepSeek API（约15-30秒）...');
      await handler(req, res);

      assert(statusCode === 200, `API 返回 200 (实际: ${statusCode})`);
      if (statusCode === 200) {
        assert(typeof responseBody.matchScore === 'number', 'matchScore 是数字');
        assert(typeof responseBody.summary === 'string', 'summary 是字符串');
        assert(Array.isArray(responseBody.highlights), 'highlights 是数组');
        console.log(`  匹配分数: ${responseBody.matchScore}`);
        console.log(`  匹配总结: ${responseBody.summary}`);
        console.log(`  亮点数: ${responseBody.highlights.length}`);
      } else {
        console.error(`  API 错误: ${JSON.stringify(responseBody)}`);
      }
    } else if (!useMock) {
      console.log('\n📋 Suite 6: 跳过（未设置 DEEPSEEK_API_KEY）');
      console.log('  设置方法: set DEEPSEEK_API_KEY=your-key-here');
    }
  } catch (err) {
    console.error('\n💥 测试执行异常:', err.message);
    console.error(err.stack);
    failed++;
  }

  const ok = summary();
  process.exit(ok ? 0 : 1);
}

main();
