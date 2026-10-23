"""Builds tilawat/data/quran/ from the Tanzil Uthmani text and التفسير الميسر.

Source: api.alquran.cloud (editions quran-uthmani, ar.muyassar and
quran-simple-clean for search).
The Qur'an text is the Tanzil Project's Uthmani text, kept verbatim as its
licence requires. Run from the repo root:  python3 tilawat/tools/build_quran_data.py
"""
import json, os, sys, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'quran')
API = 'https://api.alquran.cloud/v1/quran/'


def load(edition, cache):
    if cache and os.path.exists(cache):
        return json.load(open(cache, encoding='utf8'))['data']
    with urllib.request.urlopen(API + edition, timeout=60) as r:
        return json.load(r)['data']


def surah_names():
    src = open(os.path.join(os.path.dirname(__file__), '..', 'js', 'catalog', 'core.js'), encoding='utf8').read()
    line = src[src.index('export const SURAHS = ['):]
    return json.loads(line[line.index('['):line.index('];') + 1].replace("'", '"'))


import re
_MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\ufeff]')


def normalize(t):
    t = _MARKS.sub('', t)
    t = re.sub('[أإآٱ]', 'ا', t).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
    return re.sub('\\s+', ' ', t).strip()


def main():
    text = load('quran-uthmani', os.environ.get('QURAN_TEXT_JSON'))
    clean = load('quran-simple-clean', os.environ.get('QURAN_CLEAN_JSON'))
    tafsir = load('ar.muyassar', os.environ.get('QURAN_TAFSIR_JSON'))
    names = surah_names()
    # Al-Fatiha's first ayah is the bismillah exactly as the other surahs spell it.
    bism = text['surahs'][0]['ayahs'][0]['text'].replace('\ufeff', '').strip()
    os.makedirs(OUT, exist_ok=True)
    index = []
    for s, f in zip(text['surahs'], tafsir['surahs']):
        n = s['number']
        assert f['number'] == n and len(f['ayahs']) == len(s['ayahs'])
        ayahs = []
        bismillah = n not in (1, 9)
        for i, (a, t) in enumerate(zip(s['ayahs'], f['ayahs'])):
            body = a['text'].replace('﻿', '').strip()
            if i == 0 and bismillah:
                # Two surahs (95, 97) carry an extra shadda on the first letter, so
                # match the bismillah word by word after its first word.
                words, ref = body.split(' '), bism.split(' ')
                assert words[0].startswith('ب') and words[1:4] == ref[1:4], n
                body = ' '.join(words[4:]).strip()
            sajda = 1 if a.get('sajda') else 0
            ayahs.append([body, t['text'].strip(), a['juz'], a['page'], sajda])
        doc = {'n': n, 'name': names[n - 1], 'type': s['revelationType'].lower(), 'bismillah': bismillah, 'ayahs': ayahs}
        with open(os.path.join(OUT, f'{n:03d}.json'), 'w', encoding='utf8') as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
        index.append({'n': n, 'name': names[n - 1], 'type': doc['type'], 'count': len(ayahs),
                      'juz': ayahs[0][2], 'page': ayahs[0][3]})
    meta = {
        'surahs': index,
        'source': {
            'text': 'نص المصحف برسم عثماني من مشروع تنزيل (tanzil.net)، دون تعديل.',
            'tafsir': 'التفسير الميسر، مجمع الملك فهد لطباعة المصحف الشريف.',
        },
    }
    # Madina mushaf pages: pages[p-1] = [[surah, first ayah, last ayah], ...]
    pages = [[] for _ in range(604)]
    for s in text['surahs']:
        for a in s['ayahs']:
            row = pages[a['page'] - 1]
            if row and row[-1][0] == s['number']:
                row[-1][2] = a['numberInSurah']
            else:
                row.append([s['number'], a['numberInSurah'], a['numberInSurah']])
    assert all(pages), 'every page has ayahs'
    with open(os.path.join(OUT, 'pages.json'), 'w', encoding='utf8') as fh:
        json.dump(pages, fh, separators=(',', ':'))
    # Search text: the plain spelling people type, normalised the same way the app
    # normalises a query (see normalizeSearch in js/quran.js).
    search = [[normalize(a['text']) for a in s['ayahs']] for s in clean['surahs']]
    with open(os.path.join(OUT, 'search.json'), 'w', encoding='utf8') as fh:
        json.dump(search, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf8') as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(',', ':'))
    print('wrote', len(index), 'surahs,', sum(x['count'] for x in index), 'ayahs')


if __name__ == '__main__':
    main()
