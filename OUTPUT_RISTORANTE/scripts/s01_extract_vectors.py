"""Step 1 - Estrazione vettoriale dai PDF AutoCAD (orientamento di visualizzazione).
Produce dati/vettori_<piano>.json: lista di path, ciascuno con segmenti/curve in coordinate
di pagina ruotata (pt, origine in alto a sinistra, y verso il basso)."""
import json, sys, pathlib
import pymupdf as fitz
ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = {'terra': ROOT/'00_originali/planimetrie_Dvca_x_Lorenzo_P_terra.pdf',
       'int':   ROOT/'00_originali/planimetrie_Dvca_x_Lorenzo_P_int.pdf'}

def extract(pdf):
    page = fitz.open(pdf)[0]
    M = page.rotation_matrix          # unrotated -> displayed
    out = []
    for i, d in enumerate(page.get_drawings()):
        segs = []
        for it in d['items']:
            if it[0] == 'l':
                a, b = it[1]*M, it[2]*M
                segs.append(['l', [a.x, a.y], [b.x, b.y]])
            elif it[0] == 'c':
                pts = [p*M for p in it[1:5]]
                segs.append(['c'] + [[p.x, p.y] for p in pts])
            elif it[0] == 're':
                q = it[1].quad*M
                segs.append(['re'] + [[p.x, p.y] for p in (q.ul, q.ur, q.lr, q.ll)])
            elif it[0] == 'qu':
                q = it[1]*M
                segs.append(['qu'] + [[p.x, p.y] for p in (q.ul, q.ur, q.lr, q.ll)])
        out.append({'id': i, 'color': d.get('color'), 'width': d.get('width'),
                    'closePath': d.get('closePath'), 'segs': segs})
    texts = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                r = fitz.Rect(s['bbox'])*M
                texts.append({'text': s['text'], 'bbox': [r.x0, r.y0, r.x1, r.y1]})
    return {'page_size_displayed': [page.rect.width, page.rect.height], 'paths': out, 'texts': texts}

if __name__ == '__main__':
    (ROOT/'dati').mkdir(exist_ok=True)
    for k, f in SRC.items():
        data = extract(f)
        (ROOT/f'dati/vettori_{k}.json').write_text(json.dumps(data))
        print(k, len(data['paths']), 'paths', data['page_size_displayed'])
