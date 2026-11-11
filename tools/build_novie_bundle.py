"""把本地 TXT 小说转换为 Novie 工程包（默认前 50 个主章节，自动合并分节）。

用法：
  python tools/build_novie_bundle.py <input.txt> <output.json> [--chapters 50] [--title 书名] [--author 作者]

说明：
- 只读取用户本地文件，生成可供 Novie 导入的 JSON；不会把正文写入源码。
- 同一主章节的多个小节（（一）（二）等）会合并成一个 Novie 章节，保证章节完整。
- 识别“第X集”作为分卷；没有分卷时统一放入“第一卷”。
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path

CN_DIGITS = {'零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
             '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
CN_UNITS = {'十': 10, '百': 100, '千': 1000, '万': 10000}
NUM_CHARS = '0-9零一二三四五六七八九十百千万两〇'
CHAPTER_RE = re.compile(rf'^\s*第([{NUM_CHARS}]+)章\s*(.*?)\s*$')
VOLUME_RE = re.compile(rf'^\s*第([{NUM_CHARS}]+)集\s*(.*?)\s*$')
PART_SUFFIX_RE = re.compile(r'\s*[（(]\s*[一二三四五六七八九十0-9上中下]+\s*[）)]\s*$')
SEP_RE = re.compile(r'^\s*-{5,}\s*$')


def cn_to_int(value: str) -> int:
    if value.isdigit():
        return int(value)
    total = 0
    section = 0
    num = 0
    for ch in value:
        if ch in CN_DIGITS:
            num = CN_DIGITS[ch]
        elif ch in CN_UNITS:
            unit = CN_UNITS[ch]
            if unit == 10000:
                section = (section + num) * unit
                total += section
                section = 0
            else:
                section += (num or 1) * unit
            num = 0
    return total + section + num


def detect_encoding(raw: bytes) -> str:
    for enc in ('utf-8-sig', 'utf-8', 'gb18030', 'gbk'):
        try:
            raw.decode(enc)
            return enc
        except UnicodeDecodeError:
            continue
    return 'utf-8'


def clean_volume_title(line: str) -> str:
    m = VOLUME_RE.match(line)
    if not m:
        return line.strip()
    rest = m.group(2).strip()
    # 有的行把“第X章”也拼在集标题后面，截掉
    rest = re.split(rf'第[{NUM_CHARS}]+章', rest, maxsplit=1)[0].strip()
    return f'第{m.group(1)}集 {rest}'.strip()


def count_chars(text: str, exclude_punctuation: bool = False) -> int:
    no_space = re.sub(r'\s', '', text)
    if not exclude_punctuation:
        return len(no_space)
    return sum(1 for ch in no_space if not unicodedata.category(ch).startswith(('P', 'S')))


def text_to_html(text: str) -> str:
    blocks = re.split(r'\n\s*\n', text.strip())
    out = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        safe = html.escape(block, quote=False).replace('\n', '<br>')
        out.append(f'<p>{safe}</p>')
    return ''.join(out)


def plain_text(html_text: str) -> str:
    return re.sub(r'<[^>]+>', '', html_text).replace('<br>', '\n')


def chapter_match(line: str):
    """匹配行内章节标题；兼容“第五集 星斗森林 第二十九章 …”这种合并在同一行的格式。"""
    m = CHAPTER_RE.match(line)
    if m:
        return m
    if VOLUME_RE.match(line):
        return re.search(rf'第([{NUM_CHARS}]+)章\s*(.*?)\s*$', line)
    return None


def parse_book(path: Path, max_chapters: int):
    raw = path.read_bytes()
    text = raw.decode(detect_encoding(raw))
    lines = text.splitlines()

    chapter_heads = []
    volume_heads = []
    for idx, line in enumerate(lines):
        m = chapter_match(line)
        if m:
            num = cn_to_int(m.group(1))
            chapter_heads.append((idx, num, line.strip(), m.group(2).strip()))
        if VOLUME_RE.match(line):
            volume_heads.append((idx, clean_volume_title(line)))

    if not chapter_heads:
        raise SystemExit('没有识别到“第X章”标题，请检查文件格式')

    first_chapter_line = chapter_heads[0][0]
    # 引子：从“引子”行到首个章节标题之前，遇到分隔线/广告即停
    prologue = None
    for idx, line in enumerate(lines[:first_chapter_line]):
        if re.match(r'^\s*引子\b', line):
            body_lines = []
            for next_line in lines[idx + 1:first_chapter_line]:
                if SEP_RE.match(next_line):
                    break
                body_lines.append(next_line)
            body = '\n'.join(body_lines).strip()
            if body:
                prologue = {
                    'title': line.strip(),
                    'content_parts': [body],
                }
            break

    # 按卷的起始行建立顺序，章节归属最近的“集”
    volume_heads = sorted(volume_heads, key=lambda x: x[0])
    volume_defs = []
    seen_volumes = set()
    for line_no, title in volume_heads:
        if title in seen_volumes:
            continue
        seen_volumes.add(title)
        volume_defs.append({'line': line_no, 'title': title})
    if not volume_defs:
        volume_defs = [{'line': -1, 'title': '第一卷'}]

    def volume_for_line(line_no: int):
        current = volume_defs[0]
        for v in volume_defs:
            if v['line'] <= line_no:
                current = v
            else:
                break
        return current['title']

    # 收集所有标题的分节内容；合并同一主章节的多个小节
    heading_indexes = {h[0] for h in chapter_heads}
    volumes_seen = {}
    chapters = {}

    def add_volume(title):
        if title not in volumes_seen:
            volumes_seen[title] = {
                'id': f'vol_import_{uuid.uuid4().hex[:10]}',
                'title': title,
                'order': len(volumes_seen),
            }
        return volumes_seen[title]

    # 引子作为第一卷的第一个章节
    if prologue:
        vol_title = volume_for_line(0)
        vol = add_volume(vol_title)
        chapters[0] = {
            'num': 0,
            'title': prologue['title'],
            'content_parts': prologue['content_parts'],
            'volume': vol_title,
            'line': 8,
        }

    current = None
    for line_no, line in enumerate(lines):
        m = chapter_match(line)
        if m:
            num = cn_to_int(m.group(1))
            if num > max_chapters:
                break
            title_part = PART_SUFFIX_RE.sub('', m.group(2).strip())
            full_title = f'第{m.group(1)}章 {title_part}'.strip()
            full_title = re.sub(r'\s+', ' ', full_title).strip()
            if num not in chapters:
                chapters[num] = {
                    'num': num,
                    'title': full_title,
                    'content_parts': [],
                    'volume': volume_for_line(line_no),
                    'line': line_no,
                }
            current = chapters[num]
            continue
        if VOLUME_RE.match(line):
            current = None
            volume_for_line(line_no)  # 确保该卷被记录在下方
            continue
        if current is not None and not SEP_RE.match(line):
            current['content_parts'].append(line)

    # 按卷建立有序结构
    ordered = sorted(chapters.values(), key=lambda c: (0 if c['num'] == 0 else 1, c['line']))
    for ch in ordered:
        add_volume(ch['volume'])
        ch['content'] = '\n'.join(ch.get('content_parts', [])).strip()

    volume_list = sorted(volumes_seen.values(), key=lambda v: v['order'])
    volume_ids = {v['title']: v['id'] for v in volume_list}

    project_id = f'prj_import_{uuid.uuid4().hex[:12]}'
    now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    chapter_records = []
    content_records = []
    order = 0
    for ch in ordered:
        body = ch['content']
        if not body:
            continue
        cid = f'ch_import_{uuid.uuid4().hex[:12]}'
        html_body = text_to_html(body)
        chars = count_chars(body)
        chapter_records.append({
            'id': cid,
            'projectId': project_id,
            'volumeId': volume_ids[ch['volume']],
            'title': ch['title'],
            'order': order,
            'summary': '',
            'status': 'done',
            'targetWords': 0,
            'tags': ['导入'],
            'plotlineIds': [],
            'wordCount': chars,
            'wordCountNoPunct': count_chars(body, True),
            'mentions': [],
            'createdAt': now,
            'updatedAt': now,
        })
        content_records.append({'id': cid, 'html': html_body, 'updatedAt': now})
        order += 1

    title = path.stem
    return {
        'project_id': project_id,
        'title': title,
        'volumes': volume_list,
        'chapters': chapter_records,
        'contents': content_records,
        'total_words': sum(c['wordCount'] for c in chapter_records),
        'chapter_count': len(chapter_records),
        'volume_count': len(volume_list),
    }


def build_bundle(parsed, title: str, author: str):
    now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    project = {
        'id': parsed['project_id'],
        'name': title,
        'author': author,
        'description': '从本地 TXT 导入前 50 个章节（含引子，正文至第七集末，已合并分节），保留原文分章；仅供本地个人阅读与整理，版权归原作者与权利方所有。',
        'createdAt': now,
        'updatedAt': now,
        'lastOpenedAt': now,
        'dailyGoal': 3000,
        'totalGoal': 3000000,
        'color': '#8a5a3b',
        'password': None,
    }
    return {
        'app': 'Novie',
        'schemaVersion': 1,
        'exportedAt': datetime.now(tz=timezone.utc).isoformat(),
        'project': project,
        'volumes': parsed['volumes'],
        'chapters': parsed['chapters'],
        'contents': parsed['contents'],
        'characters': [],
        'lore': [],
        'materials': [],
        'snippets': [],
        'plotlines': [],
        'plotnodes': [],
        'versions': [],
        'daily': [],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('txt')
    ap.add_argument('output')
    ap.add_argument('--chapters', type=int, default=50)
    ap.add_argument('--title', default='')
    ap.add_argument('--author', default='')
    args = ap.parse_args()

    src = Path(args.txt)
    parsed = parse_book(src, args.chapters)
    title = args.title.strip() or f'{src.stem}（前{args.chapters}章）'
    author = args.author.strip()
    bundle = build_bundle(parsed, title, author)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding='utf-8')

    print('output:', out)
    print('chapters:', parsed['chapter_count'])
    print('volumes:', parsed['volume_count'])
    print('words:', parsed['total_words'])
    print('range:', parsed['chapters'][0]['title'], '→', parsed['chapters'][-1]['title'])
    print('size_bytes:', out.stat().st_size)


if __name__ == '__main__':
    main()
