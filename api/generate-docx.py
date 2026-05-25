"""
Vercel Python Serverless Function — 生成带 Word 批注的修改版 DOCX

POST /api/generate-docx
Body: { "docxBase64": "...", "optimizations": [...], "jobTitle": "..." }
Response: DOCX 二进制流 (含 Word 原生批注气泡)
"""

import base64
import io
import json
import re
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.part import Part
from docx.opc.packuri import PackURI
from lxml import etree


# ── CORS ──────────────────────────────────────────────────────────────────

def add_cors(handler):
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type')


# ── Word 批注 (Comments) 支持 ────────────────────────────────────────────

COMMENTS_URI = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments'


class CommentsPart:
    """管理 Word 文档的 comments.xml part — 已验证可工作的实现"""

    def __init__(self, doc):
        self.doc = doc
        self.comments_element = None
        self._comments_part = None
        self._init_comments()

    def _init_comments(self):
        doc_part = self.doc.part
        # 检查是否已有 comments part
        try:
            for rel in doc_part.rels.values():
                if rel.reltype == COMMENTS_URI:
                    self.comments_element = etree.fromstring(rel.target_part.blob)
                    self._comments_part = rel.target_part
                    return
        except Exception:
            pass

        # 创建新的 comments.xml
        comments_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:comments xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
            'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" '
            'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
            'xmlns:o="urn:schemas-microsoft-com:office:office" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
            'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
            'xmlns:v="urn:schemas-microsoft-com:vml" '
            'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" '
            'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
            'xmlns:w10="urn:schemas-microsoft-com:office:word" '
            'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
            'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
            'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" '
            'xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" '
            'xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" '
            'xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" '
            'xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" '
            'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
            'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" '
            'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '
            'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
            '</w:comments>'
        )
        self.comments_element = etree.fromstring(comments_xml.encode('utf-8'))

        # 创建 Part 并建立关系
        comments_part = Part(
            partname=PackURI('/word/comments.xml'),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
            blob=etree.tostring(self.comments_element, xml_declaration=True, encoding='UTF-8', standalone=True),
            package=doc_part.package
        )
        doc_part.relate_to(comments_part, COMMENTS_URI)
        self._comments_part = comments_part

    def add_comment(self, comment_id, author, date_str, text):
        """添加一条批注到 comments.xml"""
        comment_elem = OxmlElement('w:comment')
        comment_elem.set(qn('w:id'), str(comment_id))
        comment_elem.set(qn('w:author'), author)
        comment_elem.set(qn('w:date'), date_str)
        comment_elem.set(qn('w:initials'), author[0] if author else 'A')

        lines = text.split('\n')
        for line in lines:
            p_elem = OxmlElement('w:p')
            r_elem = OxmlElement('w:r')
            t_elem = OxmlElement('w:t')
            t_elem.set(qn('xml:space'), 'preserve')
            t_elem.text = line
            r_elem.append(t_elem)
            p_elem.append(r_elem)
            comment_elem.append(p_elem)

        self.comments_element.append(comment_elem)

    def save(self):
        """保存 comments.xml 到 part blob"""
        self._comments_part._blob = etree.tostring(
            self.comments_element,
            xml_declaration=True,
            encoding='UTF-8',
            standalone=True
        )


def add_comment_to_paragraph(paragraph, comment_id):
    """在段落中插入 commentRangeStart、commentRangeEnd 和 commentReference"""
    p_elem = paragraph._element

    # commentRangeStart — 插入到段落开头
    range_start = OxmlElement('w:commentRangeStart')
    range_start.set(qn('w:id'), str(comment_id))
    p_elem.insert(0, range_start)

    # commentRangeEnd — 插入到段落末尾
    range_end = OxmlElement('w:commentRangeEnd')
    range_end.set(qn('w:id'), str(comment_id))
    p_elem.append(range_end)

    # commentReference run — 批注引用标记
    ref_run = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')
    rStyle = OxmlElement('w:rStyle')
    rStyle.set(qn('w:val'), 'CommentReference')
    rPr.append(rStyle)
    ref_run.append(rPr)
    ref_elem = OxmlElement('w:commentReference')
    ref_elem.set(qn('w:id'), str(comment_id))
    ref_run.append(ref_elem)
    p_elem.append(ref_run)


# ── 文本替换 & 格式标记 ─────────────────────────────────────────────────

def find_and_replace_in_paragraph(para, old_text, new_text):
    """在段落中查找并替换文本，应用格式标记。返回 True 如果找到并替换。"""
    full = para.text
    if old_text not in full:
        # 去空格 + 全角空格模糊匹配
        normalized_old = ''.join(old_text.split()).replace('　', '').replace('\t', '')
        normalized_full = ''.join(full.split()).replace('　', '').replace('\t', '')
        if normalized_old not in normalized_full:
            return False

    # 计算替换后的完整段落文本
    if old_text in full:
        new_full = full.replace(old_text, new_text, 1)
    else:
        new_full = new_text.join(full.split(old_text, 1)) if old_text in full else full

    # 清空所有现有 runs
    for run in para.runs:
        run.text = ''

    if not new_full or not new_full.strip():
        return True

    # 解析并应用格式标记（**bold**, ##red##）
    if '**' in new_full or '##' in new_full:
        apply_formatted_text(para, new_full)
    else:
        if para.runs:
            para.runs[0].text = new_full
        else:
            para.add_run(new_full)

    return True


def apply_formatted_text(paragraph, formatted_text):
    """解析 **bold** 和 ##red## 标记，创建对应格式的 runs。"""
    if not formatted_text or not formatted_text.strip():
        return paragraph

    if '**' not in formatted_text and '##' not in formatted_text:
        if paragraph.runs:
            paragraph.runs[0].text = formatted_text
        else:
            paragraph.add_run(formatted_text)
        return paragraph

    for run in paragraph.runs:
        run.text = ''

    segments = _parse_format_segments(formatted_text)
    if not segments:
        return paragraph

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
    pattern = re.compile(r'\*\*(.+?)\*\*|##(.+?)##')

    for match in pattern.finditer(text):
        start = match.start()
        if start > pos:
            normal = text[pos:start]
            if normal:
                segments.append((normal, False, False))
        if match.group(1) is not None:
            if match.group(1):
                segments.append((match.group(1), True, False))
        elif match.group(2) is not None:
            if match.group(2):
                segments.append((match.group(2), False, True))
        pos = match.end()

    if pos < len(text):
        remaining = text[pos:]
        if remaining:
            segments.append((remaining, False, False))

    return segments


# ── 优化应用 ─────────────────────────────────────────────────────────────

def build_comment_text(opt):
    """根据 optimization 条目构建批注文本。"""
    parts = []
    mod_type = opt.get('modification_type', '未分类')
    old = opt.get('old_text', '')
    new = opt.get('new_text', '')
    comment = opt.get('comment', '')

    parts.append(f'【修改类型】{mod_type}')
    if old:
        parts.append(f'【原文】{old[:150]}{"..." if len(old) > 150 else ""}')
    if new:
        parts.append(f'【修改后】{new[:150]}{"..." if len(new) > 150 else ""}')
    elif new == '' and old:
        parts.append('【修改后】（已删除）')
    if comment:
        parts.append(f'【详细说明】{comment}')

    return '\n'.join(parts)


def apply_optimizations(doc, optimizations):
    """在文档中应用优化建议，每处修改添加 Word 批注。

    Returns:
        (applied_records, comment_count)
    """
    comments = CommentsPart(doc)
    comment_id = 0
    applied = []
    now = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')

    # 收集所有段落（正文 + 表格）
    all_paras = list(doc.paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    all_paras.append(para)

    for opt in optimizations:
        old_text = (opt.get('old_text') or '').strip()
        new_text = opt.get('new_text', '')
        comment_text = opt.get('comment', '')
        if not old_text:
            continue

        matched_para = None
        for para in all_paras:
            if old_text in para.text:
                matched_para = para
                break

        if not matched_para:
            # 去空格模糊匹配
            old_stripped = ''.join(old_text.split()).replace('　', '').replace('\t', '')
            for para in all_paras:
                para_stripped = ''.join(para.text.split()).replace('　', '').replace('\t', '')
                if old_stripped in para_stripped:
                    matched_para = para
                    break

        if not matched_para:
            continue

        # 替换文本 + 应用格式标记
        find_and_replace_in_paragraph(matched_para, old_text, new_text)

        # 添加 Word 批注（合并 opt.comment + 自动生成的结构）
        full_comment = build_comment_text(opt)
        comment_id += 1
        comments.add_comment(
            comment_id=comment_id,
            author='简历优化助手',
            date_str=now,
            text=full_comment
        )
        add_comment_to_paragraph(matched_para, comment_id)

        applied.append({
            'old_text': old_text[:120],
            'new_text': new_text[:120] if new_text else '(已删除)',
            'comment': comment_text,
            'modification_type': opt.get('modification_type', '未分类'),
        })

    # 保存 comments 到 part
    comments.save()

    return applied, comment_id


def add_summary_section(doc, applied_records, comment_count, job_title):
    """在文档末尾添加「简历优化说明」section。"""
    if not doc.sections:
        return

    doc.add_paragraph('\n')

    heading = doc.add_paragraph()
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = heading.add_run(f'简历优化说明 — {job_title}')
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x0a, 0x84, 0xff)

    time_para = doc.add_paragraph()
    time_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    time_run = time_para.add_run(f'生成时间：{datetime.now().strftime("%Y-%m-%d %H:%M")}   批注数量：{comment_count}')
    time_run.font.size = Pt(10)
    time_run.font.color.rgb = RGBColor(0x86, 0x86, 0x8b)

    doc.add_paragraph('')

    summary = doc.add_paragraph()
    summary_run = summary.add_run(f'共应用 {len(applied_records)} 处修改：')
    summary_run.bold = True
    summary_run.font.size = Pt(12)

    for i, rec in enumerate(applied_records, 1):
        doc.add_paragraph('')
        title = doc.add_paragraph()
        title_run = title.add_run(f'{i}. 【{rec["modification_type"]}】')
        title_run.bold = True
        title_run.font.size = Pt(11)
        title_run.font.color.rgb = RGBColor(0x30, 0xd1, 0x58)

        orig = doc.add_paragraph()
        orig_label = orig.add_run('原文：')
        orig_label.bold = True
        orig_label.font.size = Pt(10)
        orig_text = orig.add_run(rec['old_text'])
        orig_text.font.size = Pt(10)
        orig_text.font.color.rgb = RGBColor(0xff, 0x3b, 0x30)

        mod = doc.add_paragraph()
        mod_label = mod.add_run('修改后：')
        mod_label.bold = True
        mod_label.font.size = Pt(10)
        mod_text = mod.add_run(rec['new_text'])
        mod_text.font.size = Pt(10)
        mod_text.font.color.rgb = RGBColor(0x30, 0xd1, 0x58)

        if rec['comment']:
            detail = doc.add_paragraph()
            detail_label = detail.add_run('优化说明：')
            detail_label.bold = True
            detail_label.font.size = Pt(10)
            detail_text = detail.add_run(rec['comment'])
            detail_text.font.size = Pt(10)

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

            docx_base64 = data.get('docxBase64', '')
            optimizations = data.get('optimizations', [])
            job_title = data.get('jobTitle', '未指定职位')

            if not docx_base64:
                self._json_error(400, '缺少 docxBase64 字段')
                return
            if not isinstance(optimizations, list) or len(optimizations) == 0:
                self._json_error(400, 'optimizations 必须是非空数组')
                return

            try:
                docx_bytes = base64.b64decode(docx_base64)
            except Exception as e:
                self._json_error(400, f'base64 解码失败: {str(e)}')
                return

            try:
                doc = Document(io.BytesIO(docx_bytes))
            except Exception as e:
                self._json_error(400, f'无法打开 DOCX 文件: {str(e)}')
                return

            # 应用优化（含 Word 批注）
            applied_records, comment_count = apply_optimizations(doc, optimizations)

            # 添加修改说明 section
            if applied_records:
                add_summary_section(doc, applied_records, comment_count, job_title)

            # 保存到内存
            output_buffer = io.BytesIO()
            doc.save(output_buffer)
            output_buffer.seek(0)
            output_bytes = output_buffer.getvalue()

            self.send_response(200)
            add_cors(self)
            self.send_header('Content-Type',
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            self.send_header('Content-Length', str(len(output_bytes)))
            self.send_header('X-Optimization-Applied', str(len(applied_records)))
            self.send_header('X-Optimization-Total', str(len(optimizations)))
            self.send_header('X-Comment-Count', str(comment_count))
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
