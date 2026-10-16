#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the offline Akopyan shorthand practice pack from the saved reference charts.

Inputs: uploads/akopyan/q6.jpg (consonants) and q3.jpg (vowels).
Outputs: data/stenography-akopyan.json and transparent PNG sign references under
assets/stenography/akopyan/.  The scan is used only as a guide; image masks are
converted to centerline polylines so the app can grade/draw locally, offline.
"""
import json
import os
from collections import defaultdict

import cv2
import numpy as np
from PIL import Image, ImageDraw
from skimage.morphology import skeletonize

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UP = os.path.join(ROOT, 'uploads', 'akopyan')
OUT_DIR = os.path.join(ROOT, 'assets', 'stenography', 'akopyan')
OUT_JSON = os.path.join(ROOT, 'data', 'stenography-akopyan.json')
SMOOTH_ITERATIONS = 6
RESAMPLE_STEP = 3.0
STROKE_WIDTH = 9
RENDER_SCALE = 8
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)

# Centers are aligned to the actual glyphs (some slanted signs sit to the right
# of their printed labels in the scans).
Q6_CENTERS = [29.5, 74.5, 113, 144.5, 179, 215, 250, 272.5, 312, 344,
              384, 418.5, 458, 490.5, 530.5, 562.5, 593, 620.5, 649, 683]
Q3_CENTERS = [47, 112, 176, 226.5, 312]

CONSONANTS = [
    ('st_b', 'Б', 'b', 'Б начинается от основной линии: вверх, влево и к началу.', ['Б']),
    ('st_v', 'В', 'v', 'В — маленькая петля с ровной спинкой и узким закруглением.', ['В']),
    ('st_g', 'Г', 'g', 'Г: рукописная форма с узкими закруглениями и ровной спинкой.', ['Г']),
    ('st_d', 'Д', 'd', 'Д — прямой начальный штрих и маленькая узкая петля.', ['Д']),
    ('st_zh', 'Ж', 'zh', 'Ж: закругление, ровная спинка и невысокая петля.', ['Ж']),
    ('st_z', 'З', 'z', 'З — S-образная основа с петлёй снизу.', ['З']),
    ('st_k', 'К', 'k', 'К — наклонная прямая, начало и конец острые.', ['К']),
    ('st_l', 'Л', 'l', 'Л пишется движением влево, как начальная часть рукописной Л.', ['Л']),
    ('st_m', 'М', 'm', 'М начинается остро и заканчивается закруглением.', ['М']),
    ('st_n', 'Н', 'n', 'Н — короткая волнистая линия, начинающаяся от основной линии.', ['Н']),
    ('st_p', 'П', 'p', 'П начинается закруглением и заканчивается наклонной прямой.', ['П']),
    ('st_r', 'Р', 'r', 'Р — малый круглый знак; направление как у Б.', ['Р']),
    ('st_s', 'С', 's', 'С — короткая наклонная черта с закруглённым концом.', ['С']),
    ('st_t', 'Т', 't', 'Т — малый знак: закругление переходит в наклонный штрих.', ['Т']),
    ('st_f', 'Ф', 'f', 'Ф начинается маленькой петлёй; S-образная спинка заканчивается петлёй.', ['Ф']),
    ('st_h', 'Х', 'h', 'Х — петля, которая заканчивается прямым штрихом.', ['Х']),
    ('st_c', 'Ц', 'c', 'Ц — петля с S-образной спинкой и острым концом.', ['Ц']),
    ('st_ch', 'Ч', 'ch', 'Ч — спинка изгибается влево и заканчивается закруглением.', ['Ч']),
    ('st_sh', 'Ш', 'sh', 'Ш — одномерный S-образный знак.', ['Ш']),
    ('st_shch', 'Щ', 'shch', 'Щ — малый S-образный знак, конечная часть рукописной Щ.', ['Щ']),
]


def bounds_from_centers(centers, width):
    return [0] + [int(round((centers[i] + centers[i + 1]) / 2))
                  for i in range(len(centers) - 1)] + [width]


def clean_binary(gray, threshold):
    mask = (gray < threshold).astype(np.uint8)
    if not np.any(mask):
        return mask
    # Remove isolated scan flecks but preserve the thinnest deliberate strokes.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    cleaned = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 2:
            cleaned[labels == i] = 1
    # Join one-pixel gaps caused by the old, low-resolution JPEG scan.
    return cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))


def transform_cell(img, x0, x1, y1, threshold, center_x, top_line=16):
    src = np.zeros_like(img, dtype=np.uint8)
    src[:y1, x0:x1] = clean_binary(img[:y1, x0:x1], threshold) * 255
    scale = 3.0  # the source ruled-line interval is about 32 px; app interval is 96 px
    M = np.array([[scale, 0, 128 - scale * center_x],
                  [0, scale, 80 - scale * top_line]], dtype=np.float32)
    dst = cv2.warpAffine(src, M, (256, 256), flags=cv2.INTER_NEAREST,
                         borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return dst


def path_key(a, b):
    return (a, b) if a < b else (b, a)


def skeleton_paths(mask):
    skel = skeletonize(mask > 0)
    ys, xs = np.nonzero(skel)
    pixels = {(int(x), int(y)) for x, y in zip(xs, ys)}
    if not pixels:
        return []
    adj = {}
    for x, y in pixels:
        ns = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not (dx or dy):
                    continue
                q = (x + dx, y + dy)
                if q not in pixels:
                    continue
                # Avoid a diagonal shortcut when an orthogonal connection already exists.
                if dx and dy and ((x + dx, y) in pixels or (x, y + dy) in pixels):
                    continue
                ns.append(q)
        adj[(x, y)] = ns
    used = set()
    paths = []

    def walk(start, nxt):
        path = [start]
        prev, cur = start, nxt
        used.add(path_key(prev, cur))
        path.append(cur)
        guard = 0
        while guard < len(pixels) + 4:
            guard += 1
            if len(adj[cur]) != 2:
                break
            opts = [q for q in adj[cur] if path_key(cur, q) not in used]
            if not opts:
                break
            q = opts[0]
            used.add(path_key(cur, q))
            prev, cur = cur, q
            path.append(cur)
        return path

    terminals = sorted((p for p in pixels if len(adj[p]) != 2), key=lambda p: (p[1], p[0]))
    for p in terminals:
        for q in adj[p]:
            if path_key(p, q) not in used:
                path = walk(p, q)
                if len(path) >= 2:
                    paths.append(path)
    # Remaining edges belong to closed loops (or an all-degree-two component).
    for p in sorted(pixels, key=lambda p: (p[1], p[0])):
        for q in adj[p]:
            if path_key(p, q) not in used:
                path = walk(p, q)
                if len(path) >= 2:
                    paths.append(path)
    # Keep only useful paths and store numbers as compact integers.
    result = []
    for path in paths:
        if len(path) < 2:
            continue
        result.append([[int(x), int(y)] for x, y in path])
    return result


def add_line(paths, pts):
    paths.append([[int(round(x)), int(round(y))] for x, y in pts])


def svg_path(path):
    pts = [(float(p[0]), float(p[1])) for p in path]
    if len(pts) < 2:
        return ''
    d = 'M %.2f %.2f' % pts[0]
    if len(pts) == 2:
        return d + ' L %.2f %.2f' % pts[1]
    # Catmull–Rom to cubic Bézier keeps the centerline smooth at every node.
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else pts[i + 1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += ' C %.2f %.2f %.2f %.2f %.2f %.2f' % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    return d


def render_svg(paths, dest):
    commands = [svg_path(path) for path in paths]
    commands = [d for d in commands if d]
    body = ''.join('<path d="%s"/>' % d for d in commands)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" '
           'width="512" height="512" fill="none" stroke="#fff" stroke-width="%d" '
           'stroke-linecap="round" stroke-linejoin="round">%s</svg>' % (STROKE_WIDTH, body))
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(svg)


def curve_points(path, step=0.35):
    """Sample the same Catmull-Rom Béziers as the SVG for a clean PNG fallback."""
    pts = [(float(p[0]), float(p[1])) for p in path]
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else pts[i + 1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        n = max(2, int(np.ceil(np.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step)))
        for j in range(1, n + 1):
            t = j / n; u = 1.0 - t
            x = u**3*p1[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t**3*p2[0]
            y = u**3*p1[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t**3*p2[1]
            out.append((x, y))
    return out


def render_png(paths, dest):
    # Draw the same smooth Bézier centerline as the vector SVG at 8x, then
    # downsample with LANCZOS for a clean, compact offline fallback.
    scale, width = RENDER_SCALE, STROKE_WIDTH
    im = Image.new('RGBA', (256 * scale, 256 * scale), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    r = width * scale // 2
    for path in paths:
        if len(path) < 2:
            continue
        xy = [(round(x * scale), round(y * scale)) for x, y in curve_points(path)]
        d.line(xy, fill=(255, 255, 255, 255), width=width * scale, joint='curve')
        for x, y in (xy[0], xy[-1]):
            d.ellipse((x-r, y-r, x+r, y+r), fill=(255, 255, 255, 255))
    im = im.resize((256, 256), Image.Resampling.LANCZOS)
    im.save(dest, 'PNG', optimize=True)


def smooth_path(path, iterations=2):
    """Round scan-derived pixel corners while keeping open endpoints fixed."""
    pts = [(float(p[0]), float(p[1])) for p in path]
    if len(pts) < 3:
        return pts
    closed = np.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) <= 1.5
    if closed:
        pts = pts[:-1]
        for _ in range(iterations):
            nxt = []
            for i, a in enumerate(pts):
                b = pts[(i + 1) % len(pts)]
                nxt.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
                nxt.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
            pts = nxt
        pts.append(pts[0])
    else:
        for _ in range(iterations):
            nxt = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                nxt.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
                nxt.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
            nxt.append(pts[-1])
            pts = nxt
    return pts


def resample_path(path, step=2.0):
    """Limit JSON size while retaining a smooth, uniformly spaced polyline."""
    if len(path) < 2:
        return [[round(path[0][0], 1), round(path[0][1], 1)]] if path else []
    segs, total = [], 0.0
    for a, b in zip(path, path[1:]):
        d = float(np.hypot(b[0] - a[0], b[1] - a[1]))
        segs.append(d); total += d
    if total <= 0.01:
        return [[round(path[0][0], 1), round(path[0][1], 1)], [round(path[-1][0], 1), round(path[-1][1], 1)]]
    n = max(2, int(np.ceil(total / step)))
    out = []
    j = 0; acc = 0.0
    for k in range(n + 1):
        target = total * k / n
        while j < len(segs) - 1 and acc + segs[j] < target:
            acc += segs[j]; j += 1
        t = 0.0 if segs[j] <= 1e-9 else (target - acc) / segs[j]
        a, b = path[j], path[j + 1]
        out.append([round(a[0] + (b[0] - a[0]) * t, 1), round(a[1] + (b[1] - a[1]) * t, 1)])
    return out


def gaussian_fair(path, sigma=4.0, input_step=1.0):
    """Remove residual scan wobble over a short arc-length window."""
    pts = np.asarray(resample_path(path, input_step), dtype=float)
    if len(pts) < 6:
        return pts.tolist()
    closed = np.hypot(*(pts[0] - pts[-1])) <= 1.0
    core = pts[:-1] if closed else pts
    radius = int(np.ceil(3 * sigma))
    offsets = np.arange(-radius, radius + 1, dtype=float)
    weights = np.exp(-0.5 * (offsets / sigma) ** 2)
    weights /= weights.sum()
    if closed:
        padded = np.concatenate([core[-radius:], core, core[:radius]], axis=0)
    else:
        padded = np.pad(core, ((radius, radius), (0, 0)), mode='edge')
    smoothed = np.column_stack([
        np.convolve(padded[:, axis], weights, mode='valid') for axis in range(2)
    ])
    if closed:
        smoothed = np.vstack([smoothed, smoothed[0]])
    else:
        smoothed[0] = core[0]
        smoothed[-1] = core[-1]
    return smoothed.tolist()


def trim_paths(paths):
    # The source scan is skeletonized, then corner-cut and resampled so both the
    # PNG sign and the app's tracing/grading template use smooth, evenly spaced paths.
    out = []
    for path in paths:
        clean = []
        last = None
        for p in path:
            p = [int(p[0]), int(p[1])]
            if p != last:
                clean.append(p)
                last = p
        if len(clean) >= 2:
            out.append(resample_path(gaussian_fair(smooth_path(clean, SMOOTH_ITERATIONS), sigma=4.0), RESAMPLE_STEP))
    return out


q6 = cv2.imread(os.path.join(UP, 'q6.jpg'), cv2.IMREAD_GRAYSCALE)
q3 = cv2.imread(os.path.join(UP, 'q3.jpg'), cv2.IMREAD_GRAYSCALE)
if q6 is None or q3 is None:
    raise SystemExit('Missing source chart uploads/akopyan/q6.jpg or q3.jpg')

b6 = bounds_from_centers(Q6_CENTERS, q6.shape[1])
b3 = bounds_from_centers(Q3_CENTERS, q3.shape[1])

cards = []
for idx, (cid, letter, slug, hint, accepted) in enumerate(CONSONANTS):
    mask = transform_cell(q6, b6[idx], b6[idx + 1], 55, 160,
                          Q6_CENTERS[idx], top_line=16)
    paths = trim_paths(skeleton_paths(mask))
    if not paths:
        raise SystemExit('No centerline extracted for ' + letter)
    rel = './assets/stenography/akopyan/ak_' + slug + '.png'
    rel_svg = './assets/stenography/akopyan/ak_' + slug + '.svg'
    render_svg(paths, os.path.join(OUT_DIR, 'ak_' + slug + '.svg'))
    render_png(paths, os.path.join(OUT_DIR, 'ak_' + slug + '.png'))
    cards.append({
        'id': cid, 'letter': letter, 'hint': hint,
        'svg': rel_svg, 'png': rel, 'grading': 'cloud',
        'strokeCount': len(paths), 'loopCount': 0,
        'reverseAcceptedLetters': accepted, 'ambiguityNote': None,
        'templates': [paths],
    })

# Reference vowel forms. Я is А plus a distinguishing mark beneath it;
# Й is И plus a short mark above, as described in the beginner course.
vowel_defs = [
    ('st_a', 'А', 'a', 'Прямая с большим наклоном — знак для А.', ['А'], 0, None),
    ('st_ya', 'Я', 'ya', 'Знак А со штришком под ним.', ['Я'], 0, 'ya'),
    ('st_e', 'Е / Ё / Э', 'e', 'Один гласный знак для Е, Ё и Э.', ['Е', 'Ё', 'Э'], 1, None),
    ('st_i', 'И / Ы', 'i', 'Один гласный знак для И и Ы.', ['И', 'Ы'], 2, None),
    ('st_o', 'О', 'o', 'Гласный знак для О.', ['О'], 3, None),
    ('st_u', 'У / Ю', 'u', 'Один гласный знак для У и Ю.', ['У', 'Ю'], 4, None),
]
for cid, letter, slug, hint, accepted, src_idx, modifier in vowel_defs:
    if slug == 'u':
        # В источнике знак У/Ю — длинный горизонтальный соединительный штрих.
        paths = [[[52, 176], [204, 176]]]
    else:
        mask = transform_cell(q3, b3[src_idx], b3[src_idx + 1], 50, 170,
                              Q3_CENTERS[src_idx], top_line=16)
        paths = trim_paths(skeleton_paths(mask))
    if modifier == 'ya':
        add_line(paths, [[120, 191], [136, 191]])
    rel = './assets/stenography/akopyan/ak_' + slug + '.png'
    rel_svg = './assets/stenography/akopyan/ak_' + slug + '.svg'
    render_svg(paths, os.path.join(OUT_DIR, 'ak_' + slug + '.svg'))
    render_png(paths, os.path.join(OUT_DIR, 'ak_' + slug + '.png'))
    cards.append({
        'id': cid, 'letter': letter, 'hint': hint,
        'svg': rel_svg, 'png': rel, 'grading': 'cloud',
        'strokeCount': len(paths), 'loopCount': 0,
        'reverseAcceptedLetters': accepted, 'ambiguityNote': None,
        'templates': [paths],
    })

# Й is normally contextual: a short mark is placed above И in the middle of a word.
# Give it a standalone practice card by combining the И/Ы form with that mark.
i_mask = transform_cell(q3, b3[2], b3[3], 50, 170, Q3_CENTERS[2], top_line=16)
y_paths = trim_paths(skeleton_paths(i_mask))
add_line(y_paths, [[120, 66], [136, 66]])
render_svg(y_paths, os.path.join(OUT_DIR, 'ak_j.svg'))
render_png(y_paths, os.path.join(OUT_DIR, 'ak_j.png'))
cards.append({
    'id': 'st_j', 'letter': 'Й',
    'hint': 'В середине слова — знак И с коротким штрихом сверху; в конце загибается влево.',
    'svg': './assets/stenography/akopyan/ak_j.svg', 'png': './assets/stenography/akopyan/ak_j.png',
    'grading': 'cloud', 'strokeCount': len(y_paths), 'loopCount': 0,
    'reverseAcceptedLetters': ['Й'], 'ambiguityNote': None,
    'templates': [y_paths],
})

# Ъ and Ь are one contextual dot above the previous sign in this system.
soft_paths = [[[127, 68], [129, 68]]]
render_svg(soft_paths, os.path.join(OUT_DIR, 'ak_hard_soft.svg'))
render_png(soft_paths, os.path.join(OUT_DIR, 'ak_hard_soft.png'))
cards.append({
    'id': 'st_hard', 'letter': 'Ъ / Ь',
    'hint': 'Точка над предыдущим знаком; Ъ и Ь различаются по контексту.',
    'svg': './assets/stenography/akopyan/ak_hard_soft.svg', 'png': './assets/stenography/akopyan/ak_hard_soft.png',
    'grading': 'cloud', 'strokeCount': 1, 'loopCount': 0,
    'reverseAcceptedLetters': ['Ъ', 'Ь'],
    'ambiguityNote': 'В системе Акопьяна Ъ и Ь отмечаются точкой над предыдущим знаком.',
    'templates': [soft_paths],
})

pkg = {
    'schemaVersion': 1,
    'contentVersion': 3,
    'language': 'ru',
    'system': 'akopyan',
    'updatedAt': '2026-10-16',
    'space': {'size': 256, 'controlY': 80, 'baselineY': 176},
    'sourceNote': 'О. С. Акопьян. Согласные и гласные знаки по учебным схемам q6/q3; Й, Я, Ъ/Ь дополнены по правилам письма.',
    'cards': cards,
}
with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(pkg, f, ensure_ascii=False, separators=(',', ':'))

print('Akopyan pack:', len(cards), 'cards; paths:', sum(len(c['templates'][0]) for c in cards),
      'centerline points:', sum(sum(len(st) for st in c['templates'][0]) for c in cards))
print('JSON:', OUT_JSON)
print('PNGs:', OUT_DIR)
