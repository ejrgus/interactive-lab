"""Build the reviewed public catalog from cached originals and editorial selections."""
import argparse
import csv
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FIELDS = {
    'contract':'공급 / 계약',
    'design':'타이어 설계 / 성능', 'ev':'전기차 / 저회전저항',
    'winter':'겨울용 / 올웨더', 'truck':'상용차 / 내구성', 'nvh':'소음 / 진동',
    'material':'컴파운드 / 재료', 'future':'미래 모빌리티 / 비공기입',
    'test':'시험 / 성능검증', 'quality':'품질 / 생산관리',
    'process':'공정 / 자원순환', 'energy':'환경 / 에너지',
    'procurement':'구매 / 공급망', 'digital':'디지털 / AI',
    'safety':'안전 / 보건', 'business':'재무 / 사업전략',
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    since, until = '2025-10-22', '2026-10-22'
    listing = json.loads((args.cache/'recent-list.json').read_text(encoding='utf-8'))
    listing = [r for r in listing if since <= r['date'] <= until]
    by_id = {re.search(r'media-detail\.(\d+)\.html', r['DETAIL_URL'])[1]:r for r in listing}
    articles = []
    with (ROOT/'tools/hankook-selection.csv').open(encoding='utf-8', newline='') as file:
        for choice in csv.DictReader(file, delimiter='|'):
            source_id = choice['source_id']
            if source_id not in by_id:
                raise ValueError(f'Not in official listing for the period: {source_id}')
            original = json.loads((args.cache/f'{source_id}.json').read_text(encoding='utf-8'))
            if not since <= original['date'] <= until or not original['lines']:
                raise ValueError(f'Original outside period or empty: {source_id}')
            fields = [FIELDS[key] for key in choice['fields'].split(',')]
            if re.search(r'공급', original['title']) and not re.search(r'공급업체|공급업자', original['title']):
                fields = [FIELDS['contract'], *[field for field in fields if field != FIELDS['contract']]]
            elif re.search(r'계약|MOU|협약', original['title']) and FIELDS['contract'] not in fields:
                fields.append(FIELDS['contract'])
            articles.append({
                'id':f'hankook-{source_id}', 'title':original['title'], 'url':original['url'],
                'date':original['date'], 'category':fields[0], 'topics':fields[1:],
                'tags':choice['tags'].split(','), 'summary':choice['summary'], 'study':choice['study'],
                'is_official':True, 'verified':True, 'source':f'{until} 공식 한국어 원문·표시 게시일 확인',
                'listing_date':by_id[source_id]['date'],
            })
    articles.sort(key=lambda a:(a['date'],a['id']), reverse=True)
    selected = {a['id'].removeprefix('hankook-') for a in articles}
    excluded = []
    for source_id, row in by_id.items():
        if source_id in selected:
            continue
        title = row['TITLE']
        reason = '마케팅·영업·인사·사회공헌 또는 기술 설명이 부족한 행사·후원·수상 소식. 실제 타이어 공급·계약은 별도 수집.'
        if re.search(r'헌혈|봉사|기부|성금|나눔|장학|사회적 가치|CSR|수자원 인프라', title):
            reason = '사회공헌 제외'
        elif re.search(r'임직원.*성과|프로액티브 어워|신년 간담회', title):
            reason = '인사·조직문화 제외'
        excluded.append({'url':'https://www.hankooktire.com'+row['DETAIL_URL'].removeprefix('/content/hankooktire'), 'title':title, 'date':row['date'], 'reason':reason})
    catalog = {
        'updated':until,
        'company':{
            'id':'hankook-tire', 'name':'한국타이어',
            'newsroom_url':'https://www.hankooktire.com/kr/ko/company/media-list.html',
            'logo_url':'https://ejrgus.github.io/interactive-lab/newsroom/assets/hankook-tire.svg',
            'logo_source':'https://asset.hankooktire.com/content/dam/hankooktire/local/img/main/main-key-visual/pc/logo.svg',
        },
        'coverage':{'since':since,'until':until,'listed':len(listing),'selected':len(articles),
                    'excluded':len(excluded),'unavailable_originals':0,
                    'policy':'최근 1년. 마케팅·영업·인사·사회공헌 제외. 공급·계약은 별도 목차에 수집하며 기술 설명이 있으면 기술 목차에도 표시.'},
        'fields':list(FIELDS.values()), 'articles':articles,
    }
    target = ROOT/'newsroom/catalogs'
    target.mkdir(parents=True, exist_ok=True)
    (target/'hankook-tire.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (target/'hankook-exclusions.json').write_text(json.dumps({'since':since,'until':until,'excluded':excluded},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(catalog['coverage'],ensure_ascii=False))

if __name__ == '__main__':
    main()
