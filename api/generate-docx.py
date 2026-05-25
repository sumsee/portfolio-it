"""
Vercel Python Serverless Function — 生成修改版 DOCX

POST /api/generate-docx
Body: { "docxBase64": "...", "optimizations": [...], "jobTitle": "..." }
Response: DOCX 二进制流
"""

import base64
import io
import json
import re
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn


# ── CORS ──────────────────────────────────────────────────────────────────

def add_cors(handler):
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type')


# ── 核心逻辑 ──────────────────────────────────────────────────────────────

def find_and_replace_in_paragraph(para, old_text, new_text):
    """在段落中查找并替换文本，应用格式标记。返回 True 如果找到并替换。"""
    full = para.text
    if old_text not in full:
        # 去空格模糊匹配
        normalized_old = ''.join(old_text.split())
        normalized_full = ''.join(full.split())
        if normalized_old not in normalized_full:
            return False

    # 计算替换后的完整段落文本（old_text → new_text，保留段落中前后文）
    if old_text in full:
        new_full = full.replace(old_text, new_text, 1)
    else:
        new_full = new_text.join(full.split(old_text, 1)) if old_text in full else full

    # 清空所有现有 runs
    for run in para.runs:
        run.text = ''

    if not new_full or not new_full.strip():
        return True

    # 解析并应用格式标记（**bold**, ##red##）到完整段落文本
    if '**' in new_full or '##' in new_full:
        apply_formatted_text(para, new_full)
    else:
        if para.runs:
            para.runs[0].text = new_full
        else:
            para.add_run(new_full)

    return True


def _replace_in_runs(para, old, new):
    """在段落 runs 中执行文本替换。"""
    # 简单策略：清空所有 runs，将第一个 run 设为替换后全文
    full_text = para.text
    if old in full_text:
        new_full = full_text.replace(old, new, 1)
    else:
        # 模糊匹配
        new_full = new.join(full_text.split(old, 1)) if old in full_text else full_text

    # 清空所有 runs
    for run in para.runs:
        run.text = ''

    # 写入新文本到第一个 run
    if para.runs:
        para.runs[0].text = new_full
    else:
        para.add_run(new_full)


def apply_formatted_text(paragraph, formatted_text):
    """解析 formatted_text 中的 **bold** 和 ##red## 格式标记，创建对应 runs。

    标记规则：
    - **text** → bold=True
    - ##text## → font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
    - 无标记文本 → 保持原格式
    """
    if not formatted_text or not formatted_text.strip():
        return paragraph

    # 没有格式标记 → 快速路径
    if '**' not in formatted_text and '##' not in formatted_text:
        if paragraph.runs:
            paragraph.runs[0].text = formatted_text
        else:
            paragraph.add_run(formatted_text)
        return paragraph

    # 清空所有现有 runs
    for run in paragraph.runs:
        run.text = ''

    # 解析为格式片段
    segments = _parse_format_segments(formatted_text)
    if not segments:
        return paragraph

    # 为每个片段创建 run
    for i, (text, is_bold, is_red) in enumerate(segments):
        if i == 0 and paragraph.runs:
            run = paragraph.runs[0]
        else:
            run = paragraph.add_run('')

        run.text = text
        if is_bold:
            run.bold = True
        if is_red:
            run.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)

    return paragraph


def _parse_format_segments(text):
    """将带格式标记的文本解析为 (text, is_bold, is_red) 片段列表。"""
    segments = []
    pos = 0

    # 匹配 **bold** 或 ##red##（非贪婪）
    pattern = re.compile(r'\*\*(.+?)\*\*|##(.+?)##')

    for match in pattern.finditer(text):
        start = match.start()
        # 匹配前的普通文本
        if start > pos:
            normal = text[pos:start]
            if normal:
                segments.append((normal, False, False))

        if match.group(1) is not None:
            # **bold** — group(1) 是加粗内容
            if match.group(1):
                segments.append((match.group(1), True, False))
        elif match.group(2) is not None:
            # ##red## — group(2) 是标红内容
            if match.group(2):
                segments.append((match.group(2), False, True))

        pos = match.end()

    # 末尾剩余普通文本
    if pos < len(text):
        remaining = text[pos:]
        if remaining:
            segments.append((remaining, False, False))

    return segments


def apply_optimizations(doc, optimizations):
    """在文档中应用优化建议。

    Returns:
        list: 成功应用的优化记录列表，每条含 old_text, new_text, comment, modification_type
    """
    applied = []

    for opt in optimizations:
        old_text = (opt.get('old_text') or '').strip()
        new_text = opt.get('new_text', '')
        if not old_text:
            continue

        matched = False

        # 搜索段落
        for para in doc.paragraphs:
            if find_and_replace_in_paragraph(para, old_text, new_text):
                matched = True
                break

        # 搜索表格
        if not matched:
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        for para in cell.paragraphs:
                            if find_and_replace_in_paragraph(para, old_text, new_text):
                                matched = True
                                break
                        if matched:
                            break
                    if matched:
                        break
                if matched:
                    break

        if matched:
            applied.append({
                'old_text': old_text[:120],
                'new_text': new_text[:120] if new_text else '(已删除)',
                'comment': opt.get('comment', ''),
                'modification_type': opt.get('modification_type', '未分类'),
            })

    return applied


def add_summary_section(doc, applied_records, job_title):
    """在文档末尾添加「简历优化说明」section。"""
    # 确保至少有一个 section
    if not doc.sections:
        return

    section = doc.sections[-1]

    # 添加分页
    doc.add_paragraph('\n')

    # 标题
    heading = doc.add_paragraph()
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = heading.add_run(f'简历优化说明 — {job_title}')
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x0a, 0x84, 0xff)

    # 生成时间
    time_para = doc.add_paragraph()
    time_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    time_run = time_para.add_run(f'生成时间：{datetime.now().strftime("%Y-%m-%d %H:%M")}')
    time_run.font.size = Pt(10)
    time_run.font.color.rgb = RGBColor(0x86, 0x86, 0x8b)

    doc.add_paragraph('')  # 空行

    # 统计
    summary = doc.add_paragraph()
    summary_run = summary.add_run(f'共应用 {len(applied_records)} 处修改：')
    summary_run.bold = True
    summary_run.font.size = Pt(12)

    for i, rec in enumerate(applied_records, 1):
        # 修改条目
        doc.add_paragraph('')

        # 编号 + 类型
        title = doc.add_paragraph()
        title_run = title.add_run(f'{i}. 【{rec["modification_type"]}】')
        title_run.bold = True
        title_run.font.size = Pt(11)
        title_run.font.color.rgb = RGBColor(0x30, 0xd1, 0x58)

        # 原文
        orig = doc.add_paragraph()
        orig_label = orig.add_run('原文：')
        orig_label.bold = True
        orig_label.font.size = Pt(10)
        orig_text = orig.add_run(rec['old_text'])
        orig_text.font.size = Pt(10)
        orig_text.font.color.rgb = RGBColor(0xff, 0x3b, 0x30)

        # 修改后
        mod = doc.add_paragraph()
        mod_label = mod.add_run('修改后：')
        mod_label.bold = True
        mod_label.font.size = Pt(10)
        mod_text = mod.add_run(rec['new_text'])
        mod_text.font.size = Pt(10)
        mod_text.font.color.rgb = RGBColor(0x30, 0xd1, 0x58)

        # 详细说明
        if rec['comment']:
            detail = doc.add_paragraph()
            detail_label = detail.add_run('优化说明：')
            detail_label.bold = True
            detail_label.font.size = Pt(10)
            detail_text = detail.add_run(rec['comment'])
            detail_text.font.size = Pt(10)

    # 页脚提示
    doc.add_paragraph('')
    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer_run = footer.add_run('— 由简历优化助手自动生成 —')
    footer_run.font.size = Pt(9)
    footer_run.font.color.rgb = RGBColor(0x86, 0x86, 0x8b)
    footer_run.italic = True


# ── Handler ────────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        add_cors(self)
        self.end_headers()

    def do_POST(self):
        try:
            # 读取请求 body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b''

            if not body:
                self._json_error(400, '请求 body 为空')
                return

            try:
                data = json.loads(body)
            except json.JSONDecodeError as e:
                self._json_error(400, f'JSON 解析失败: {str(e)}')
                return

            # 校验必填字段
            docx_base64 = data.get('docxBase64', '')
            optimizations = data.get('optimizations', [])
            job_title = data.get('jobTitle', '未指定职位')

            if not docx_base64:
                self._json_error(400, '缺少 docxBase64 字段')
                return
            if not isinstance(optimizations, list) or len(optimizations) == 0:
                self._json_error(400, 'optimizations 必须是非空数组')
                return

            # 解码 base64
            try:
                docx_bytes = base64.b64decode(docx_base64)
            except Exception as e:
                self._json_error(400, f'base64 解码失败: {str(e)}')
                return

            # 打开 DOCX
            try:
                doc = Document(io.BytesIO(docx_bytes))
            except Exception as e:
                self._json_error(400, f'无法打开 DOCX 文件: {str(e)}')
                return

            # 应用优化
            applied_records = apply_optimizations(doc, optimizations)

            # 添加修改说明 section
            if applied_records:
                add_summary_section(doc, applied_records, job_title)

            # 保存到内存
            output_buffer = io.BytesIO()
            doc.save(output_buffer)
            output_buffer.seek(0)
            output_bytes = output_buffer.getvalue()

            # 返回二进制 DOCX
            self.send_response(200)
            add_cors(self)
            self.send_header('Content-Type',
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            self.send_header('Content-Length', str(len(output_bytes)))
            self.send_header('X-Optimization-Applied', str(len(applied_records)))
            self.send_header('X-Optimization-Total', str(len(optimizations)))
            self.end_headers()
            self.wfile.write(output_bytes)

        except Exception as e:
            tb = traceback.format_exc()
            print(tb)
            self._json_error(500, f'服务器内部错误: {str(e)}')

    def _json_error(self, status_code, message):
        error_body = json.dumps({
            'error': 'DOCX Generation Error' if status_code >= 500 else 'Bad Request',
            'message': message,
            'errorMessage': message,
        }, ensure_ascii=False).encode('utf-8')

        try:
            self.send_response(status_code)
            add_cors(self)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(error_body)))
            self.end_headers()
            self.wfile.write(error_body)
        except Exception:
            pass
