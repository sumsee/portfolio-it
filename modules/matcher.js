/**
 * AI 匹配模块 — 前端调用侧
 *
 * 职责：
 *   1. 定义匹配分析 prompt 维度
 *   2. 调用 /api/match 代理接口
 *   3. 解析并校验响应
 *   4. 统一错误处理
 *
 * 用法：
 *   import { matchResumeToJD } from './modules/matcher.js';
 *   const result = await matchResumeToJD(resumeData, jdText);
 *
 * 输出 GeneratedProfile:
 *   { matchScore, summary, highlights, suggestions, missingSkills, tailoredContent }
 */

const API_ENDPOINT = '/api/match';

/**
 * 匹配状态枚举
 */
export const MatchStatus = {
    IDLE: 'idle',
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error',
};

/**
 * 匹配错误类型
 */
export class MatchError extends Error {
    constructor(type, message, details = null) {
        super(message);
        this.name = 'MatchError';
        this.type = type;       // 'network' | 'api' | 'parse' | 'timeout'
        this.details = details; // API 返回的额外信息
    }
}

/**
 * 核心匹配函数
 *
 * @param {Object} resumeData - parser.js 输出的结构化简历
 * @param {string} jdText      - 用户输入的岗位 JD 文本
 * @returns {Promise<Object>}  - GeneratedProfile 对象
 * @throws  {MatchError}        - 所有错误统一封装
 */
export async function matchResumeToJD(resumeData, jdText) {
    // 输入二次校验（parser 模块内部已校验，这里做防御性检查）
    if (!resumeData || typeof resumeData !== 'object') {
        throw new MatchError('api', '简历数据无效，请重新上传或使用默认简历');
    }
    if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
        throw new MatchError('api', '请填写岗位 JD 描述');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s 超时

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resumeData,
                jdText: jdText.trim(),
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // 处理非 2xx 响应
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { message: `服务器返回状态码 ${response.status}` };
            }

            throw new MatchError(
                'api',
                errorData.message || '匹配服务异常，请稍后重试',
                errorData
            );
        }

        // 解析 JSON
        let profile;
        try {
            profile = await response.json();
        } catch {
            throw new MatchError('parse', '匹配结果解析失败，请重试');
        }

        // 客户端侧轻量校验（API 端已做严格校验，这里做最后把关）
        validateClientProfile(profile);

        return profile;
    } catch (err) {
        clearTimeout(timeoutId);

        // 已经是 MatchError，直接抛出
        if (err instanceof MatchError) {
            throw err;
        }

        // AbortError → 超时
        if (err.name === 'AbortError') {
            throw new MatchError('timeout', '匹配请求超时，请检查网络后重试');
        }

        // 网络错误
        throw new MatchError('network', '网络连接失败，请检查网络后重试');
    }
}

/**
 * 客户端侧轻量校验
 * API 端已做完整校验，这里仅验证最基本的字段存在
 */
function validateClientProfile(profile) {
    const required = ['matchScore', 'summary', 'highlights', 'suggestions', 'missingSkills', 'tailoredContent'];

    const missing = required.filter(key => !(key in profile));
    if (missing.length > 0) {
        throw new MatchError(
            'parse',
            `匹配结果缺少必要字段: ${missing.join(', ')}，请重试`
        );
    }

    if (typeof profile.matchScore !== 'number') {
        throw new MatchError('parse', '匹配分数格式异常，请重试');
    }

    if (!profile.tailoredContent.hero || typeof profile.tailoredContent.hero.name !== 'string') {
        throw new MatchError('parse', '匹配结果缺少候选人信息，请重试');
    }

    if (!Array.isArray(profile.tailoredContent.sections)) {
        throw new MatchError('parse', '匹配结果缺少内容模块，请重试');
    }
}

/**
 * 获取匹配错误对应的用户友好文案
 *
 * @param {MatchError} error
 * @returns {string}
 */
export function getErrorMessage(error) {
    if (!(error instanceof MatchError)) {
        return '未知错误，请重试';
    }

    const messages = {
        network: '网络连接失败，请检查网络后重试',
        api: error.message,
        parse: 'AI 返回数据异常，请稍后重试',
        timeout: 'AI 分析超时，JD 内容可能过长，请精简后重试',
    };

    return messages[error.type] || error.message;
}

/**
 * 根据 matchScore 获取评级
 *
 * @param {number} score - matchScore (0-100)
 * @returns {{ level: string, label: string, color: string }}
 */
export function getMatchLevel(score) {
    if (score >= 85) {
        return { level: 'excellent', label: '高度匹配', color: '#30d158' };
    }
    if (score >= 70) {
        return { level: 'good', label: '较为匹配', color: '#0a84ff' };
    }
    if (score >= 50) {
        return { level: 'fair', label: '部分匹配', color: '#ffd60a' };
    }
    return { level: 'low', label: '匹配度较低', color: '#ff3b30' };
}
