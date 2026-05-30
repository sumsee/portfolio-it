"""
Vercel Python Serverless Function — 模板化简历生成（python-docx）
POST /api/generate-template-resume
Body: { "resumeText": "...", "result": {...} }
Response: { "docxBase64": "...", "message": "..." }
"""

import base64
import json
import os
import re
from io import BytesIO
from http.server import BaseHTTPRequestHandler

from docx import Document
from docx.shared import RGBColor


TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), '..', 'resume-template.docx')


def add_cors(handler):
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type')


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        add_cors(self)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        self.send_response(405)
        add_cors(self)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'message': 'Use POST'}).encode())

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b''
            data = json.loads(body)

            resume_text = data.get('resumeText', '')
            result = data.get('result', {})

            # 加载模板母版
            if not os.path.exists(TEMPLATE_PATH):
                self._json_error(500, f'模板文件不存在: {TEMPLATE_PATH}')
                return

            doc = Document(TEMPLATE_PATH)
            display = result.get('display', {})
            diagnostic = result.get('diagnosticReport', {})

            # 按 skill 规则填充
            fill_resume(doc, resume_text, display, diagnostic)

            # 保存
            output = BytesIO()
            doc.save(output)
            output.seek(0)
            out_b64 = base64.b64encode(output.read()).decode()

            self.send_response(200)
            add_cors(self)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'docxBase64': out_b64}).encode())

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._json_error(500, f'生成失败: {str(e)}')

    def _json_error(self, status_code, message):
        self.send_response(status_code)
        add_cors(self)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'message': message}).encode())


# ============================================================
#  按 skill 规则填充六大板块
# ============================================================

def fill_resume(doc, resume_text, display, diagnostic):
    ps = doc.paragraphs
    info = parse_resume(resume_text)
    experiences = display.get('experienceShowcase', [])

    # ---- P0: 姓名 ----
    if info.get('name') and len(ps) > 0:
        rt(ps[0], '姓名', info['name'])

    # ---- P1: 基本信息 ----
    if len(ps) > 1:
        rt(ps[1], 'xxxx', info.get('political', ''))
        rt(ps[1], 'xxxxx', info.get('phone', ''))
        rt(ps[1], 'xxxxxx', info.get('email', ''))

    # ---- P3: 教育信息 ----
    edu = info.get('edu', {})
    if len(ps) > 3:
        p = ps[3]
        rt(p, 'xxxxxxxxxxx大学', edu.get('school', ''))
        rt(p, 'xxxxxxxx专业', edu.get('major', ''))
        if edu.get('gpa'):
            rt_nth(p, 'xx', edu['gpa'], 4)
        if edu.get('rank'):
            rt_nth(p, 'xx', edu['rank'], 5)

    # ---- P4: 主修课程（按 JD 优化，允许 AI 推断补全） ----
    if len(ps) > 4:
        courses = edu.get('courses', '') or '待补充'
        rt(ps[4], 'xxxxxxxx', courses)

    # ---- P5: 荣誉奖项 ----
    if len(ps) > 5 and info.get('honors'):
        set_para(ps[5], f'荣誉奖项：{info["honors"]}')

    # ---- P7-P9: 实习经历（标题行原文，要点用优化版） ----
    intern = find_exp(experiences, ['实习', '工作'])
    if intern and len(ps) > 9:
        if intern.get('titleLine'):
            set_para(ps[7], intern['titleLine'])
        bullets = get_bullets(intern.get('fullVersion', ''))
        if len(bullets) > 0:
            fill_bullet(ps[8], bullets[0])
        if len(bullets) > 1:
            fill_bullet(ps[9], bullets[1])

    # ---- P11-P13: 项目经历 ----
    proj = find_exp(experiences, ['项目', '开发'])
    if proj and len(ps) > 13:
        if proj.get('titleLine'):
            set_para(ps[11], proj['titleLine'])
        bullets = get_bullets(proj.get('fullVersion', ''))
        if len(bullets) > 0:
            fill_bullet(ps[12], bullets[0])
        if len(bullets) > 1:
            fill_bullet(ps[13], bullets[1])

    # ---- P15-P16: 校园经历 ----
    campus = find_exp(experiences, ['校园', '社团', '组织', '学生'])
    if campus and len(ps) > 16:
        if campus.get('titleLine'):
            set_para(ps[15], campus['titleLine'])
        bullets = get_bullets(campus.get('fullVersion', ''))
        if len(bullets) > 0:
            fill_bullet(ps[16], bullets[0])

    # ---- P18-P22: 技能/优势 ----
    skills = info.get('skills', {})
    if len(ps) > 18 and skills.get('certs'):
        rt(ps[18], 'xxxxx', skills['certs'])
    if len(ps) > 19 and skills.get('comps'):
        rt(ps[19], 'xxxxx', skills['comps'])
    if len(ps) > 20:
        rt(ps[20], 'xxxxxx。', skills.get('tech', '') or '待补充')
    if len(ps) > 21:
        rt(ps[21], 'xxxxxx。', skills.get('self', '') or '待补充')
    if len(ps) > 22:
        hobbies = skills.get('hobbies', '') or '球类运动、写作'
        rt(ps[22], 'xxxxxx。', hobbies)

    # ---- 量化标红 ----
    red_quantification(doc)

    # ---- 末尾附加区 ----
    append_ai_section(doc, display, diagnostic)


# ============================================================
#  工具函数
# ============================================================

def rt(paragraph, old, new):
    """替换段落中第一个包含 old 的 run 的文本"""
    for run in paragraph.runs:
        if old in run.text:
            run.text = run.text.replace(old, new)
            return True
    return False


def rt_nth(paragraph, old, new, n):
    """替换第 n 个匹配"""
    c = 0
    for run in paragraph.runs:
        if old in run.text:
            c += 1
            if c == n:
                run.text = run.text.replace(old, new, 1)
                return True
    return False


def set_para(paragraph, text):
    """清空段落所有 run，用第一个 run 写入新文本"""
    if not paragraph.runs:
        return
    paragraph.runs[0].text = text
    for r in paragraph.runs[1:]:
        r.text = ''


def fill_bullet(paragraph, text):
    """填充要点段落：小标题加粗 + 内容"""
    if '：' in text:
        parts = text.split('：', 1)
        label = parts[0].strip('*').strip()
        content = parts[1].strip()
        if paragraph.runs:
            paragraph.runs[0].text = label
            paragraph.runs[0].bold = True
            if len(paragraph.runs) > 1:
                paragraph.runs[1].text = '：'
                paragraph.runs[1].bold = True
            if len(paragraph.runs) > 2:
                paragraph.runs[2].text = content
                paragraph.runs[2].bold = False
    else:
        if paragraph.runs:
            paragraph.runs[0].text = text


def find_exp(experiences, keywords):
    """按关键词查找经历"""
    for exp in experiences:
        name = exp.get('name', '')
        for kw in keywords:
            if kw in name:
                return exp
    return experiences[0] if experiences else None


def get_bullets(full_version):
    """从 fullVersion 提取要点列表"""
    if not full_version:
        return []
    lines = [re.sub(r'^[\-•\d.\s]+', '', l).strip() for l in full_version.split('\n')]
    return [l for l in lines if len(l) > 5]


def parse_resume(text):
    """从简历文本提取结构化信息"""
    info = {}
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    if not lines:
        return info

    info['name'] = re.sub(r'^[姓\s名：:]+', '', lines[0]).strip()

    early = '\n'.join(lines[:10])
    m = re.search(r'1[3-9]\d{9}', early)
    if m: info['phone'] = m.group()
    m = re.search(r'[\w.\-]+@[\w.\-]+\.\w+', early)
    if m: info['email'] = m.group()
    m = re.search(r'(党员|团员|群众)', early)
    if m: info['political'] = m.group()

    edu = {}
    for line in lines:
        if re.search(r'大学|学院|学校|本科|硕士', line):
            sm = re.search(r'([一-鿿]{2,20}(?:大学|学院|学校))', line)
            if sm: edu['school'] = sm.group(1)
            mm = re.search(r'([一-鿿]{2,15})专业', line)
            if mm: edu['major'] = mm.group(1) + '专业'
            gm = re.search(r'GPA[：:]\s*(\d+\.?\d*)', line, re.I)
            if gm: edu['gpa'] = gm.group(1)
            rm = re.search(r'(?:top|前)\s*(\d+)%', line, re.I)
            if rm: edu['rank'] = rm.group(1)
            break

    for line in lines:
        if '主修课程' in line or '核心课程' in line:
            edu['courses'] = re.sub(r'^.*?[：:]\s*', '', line)
    info['edu'] = edu

    for line in lines:
        if '荣誉' in line or '奖学金' in line or '奖项' in line:
            info['honors'] = re.sub(r'^.*?[：:]\s*', '', line)

    skills = {}
    for line in lines:
        if '证书' in line or 'CET' in line:
            skills['certs'] = re.sub(r'^.*?[：:]\s*', '', line)
        if '比赛' in line or '竞赛' in line:
            skills['comps'] = re.sub(r'^.*?[：:]\s*', '', line)
        if '专业技能' in line or '技术栈' in line:
            skills['tech'] = re.sub(r'^.*?[：:]\s*', '', line).rstrip('。.')
        if '自我评价' in line:
            skills['self'] = re.sub(r'^.*?[：:]\s*', '', line).rstrip('。.')
        if '爱好' in line or '兴趣' in line:
            skills['hobbies'] = re.sub(r'^.*?[：:]\s*', '', line).rstrip('。.')
    info['skills'] = skills

    return info


def red_quantification(doc):
    """成果型量化数据标红"""
    for para in doc.paragraphs:
        for run in para.runs:
            t = run.text or ''
            if not t:
                continue
            # 跳过大标题
            if run.bold and run.font.size and run.font.size > 140000:
                continue
            if re.search(r'(提升|降低|节省|缩短|优化|管理|服务|处理|交付|支撑|从.{1,6}至)\s*(?:约?\s*)?\d+', t):
                run.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)


def append_ai_section(doc, display, diagnostic):
    """末尾附加区：AI 推断参考 + 匹配度评分"""
    doc.add_paragraph('')

    # 灰色分隔
    p = doc.add_paragraph('')
    r = p.add_run('【以下为 AI 推断补充，供参考，请自行核实后决定是否采用】')
    r.font.color.rgb = RGBColor(0x80, 0x80, 0x80)

    for item in display.get('missingInfoSuggestions', []):
        p = doc.add_paragraph('')
        r = p.add_run(f'• {item}')
        r.font.color.rgb = RGBColor(0x80, 0x80, 0x80)

    doc.add_paragraph('')

    # 匹配度评分
    p = doc.add_paragraph('')
    r = p.add_run('优化后简历打分 · 匹配度计算（100 分制）')
    r.bold = True

    if diagnostic:
        dims = diagnostic.get('dimensions', {})
        for key, label in [('jdMatch', 'JD 匹配度'), ('quantification', '量化成果'),
                           ('structure', '结构与逻辑'), ('language', '语言专业度'), ('ats', 'ATS 友好度')]:
            d = dims.get(key, {})
            p = doc.add_paragraph('')
            r = p.add_run(f'{label}：{d.get("score", 0)}/{d.get("maxScore", 0)}')
            r.bold = True
            if d.get('detail'):
                p.add_run(f'  {d["detail"]}')

        p = doc.add_paragraph('')
        r = p.add_run(f'综合得分：{diagnostic.get("overallScore", 0)}/100')
        r.bold = True

    doc.add_paragraph('')
    p = doc.add_paragraph('')
    p.add_run('优化亮点：').bold = True
    for h in ['🔑 关键词优化', '📊 量化成果', '🎯 技能匹配', '✨ 措辞优化', '📐 结构调整', '🤖 ATS 优化']:
        doc.add_paragraph(f'  {h}')
