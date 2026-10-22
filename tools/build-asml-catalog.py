"""Build ASML metadata from official originals read in the browser and public HTML.

The investor site rejects ordinary HTTP clients. Read its public listing/details
with the normal browser, saving visible main text to investor-originals.json.
Stories are checked against the official sitemap, never inferred from search snippets.
Raw originals remain outside the repository; only reviewed metadata is published.
"""
import argparse
from collections import Counter
import csv
from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
import re
import shutil

ROOT=Path(__file__).resolve().parents[1]
SINCE,UNTIL='2025-10-22','2026-10-22'
FIELDS={
    'contract':'공급 / 계약','euv':'노광 / High NA EUV','mask':'마스크 / 공정통합',
    'light':'광원 / 장비 제어','software':'소프트웨어 / AI','metrology':'계측 / 결함검사',
    'quality':'시험 / 품질검증','manufacturing':'장비 제조 / 생산운영',
    'service':'고객지원 / 유지보수','procurement':'구매 / 공급망','business':'재무 / 사업전략',
}
EXCLUSIONS={
    'asml-discloses-2026-agm-results':'주주총회 의결·임원 선임·배당 안내 중심. 기술·운영 학습 정보가 부족한 일반 공시 제외',
    'asml-publishes-agenda-annual-general-meeting-2026':'주주총회 일정·임원 인사 안내 제외',
    'asml-publishes-2025-annual-report':'보고서 발간 안내 중심. 원문 기사에 구체적인 기술 설명이 부족하고 실적은 연간 실적발표로 수집',
    'asml-ceo-christophe-fouquet-co-signed-opinion-piece-european-technology-companies':'정책 촉구 기고문으로 기술·제조 직무의 구체적인 내용이 부족해 제외',
    'strengthening-focus-on-engineering-and-innovation':'조직 개편·인력 운영에 관한 인사 공지 제외',
    'improved-accessibility-and-future-proof-mobility-for-mre':'지역사회 교통 인프라 재정 지원으로 사회공헌 범위 제외',
    'statement-relating-to-recent-book-publication':'서적 내용에 관한 입장문으로 직무 기술 자료에 해당하지 않아 제외',
    'marco-pieters-asml-cto':'CTO 소개·인사 인터뷰 제외',
}
DATE_RE=r'([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})'

def date_of(text):
    value=re.search(DATE_RE,text,re.I)
    if not value:
        raise ValueError('Original has no visible publication date')
    return datetime.strptime(value[1].title(),'%B %d, %Y').date().isoformat()

def build(cache):
    originals=json.loads((cache/'investor-originals.json').read_text(encoding='utf-8'))
    originals+=json.loads((cache/'story-originals.json').read_text(encoding='utf-8'))
    sources={}
    for row in originals:
        key=row['url'].rstrip('/').rsplit('/',1)[-1]
        date=date_of(row['text'])
        assert SINCE<=date<=UNTIL,(key,date)
        if row.get('context'):
            assert date==date_of(row['context']),(key,'Listing date differs from original')
        assert len(row['text'])>200
        sources[key]=dict(row,date=date,title=row.get('heading',row['title']).strip())
    assert len(sources)==len(originals), 'Duplicate original'
    articles=[]
    with (ROOT/'tools/asml-selection.csv').open(encoding='utf-8',newline='') as file:
        for choice in csv.DictReader(file,delimiter='|'):
            row=sources[choice['source_key']]
            fields=[FIELDS[k] for k in choice['fields'].split(',')]
            assert len(fields)==len(set(fields))
            articles.append({
                'id':'asml-'+sha256(row['url'].encode()).hexdigest()[:16],
                'title':row['title'],'url':row['url'],'date':row['date'],
                'category':fields[0],'topics':fields[1:],'tags':choice['tags'].split(','),
                'summary':choice['summary'],'study':'공부 질문: '+choice['study'],
                'verified':True,'is_official':True,'source_key':choice['source_key'],
                'source':'2026-10-22 ASML 공식 원문·표시 게시일 확인',
            })
    selected={a['source_key'] for a in articles}
    assert len(selected)==len(articles) and not selected.intersection(EXCLUSIONS)
    assert selected.union(EXCLUSIONS)==set(sources),set(sources)-selected-set(EXCLUSIONS)
    articles.sort(key=lambda a:(a['date'],a['id']),reverse=True)
    excluded=[{key:row[key] for key in ['url','title','date']}|{'reason':EXCLUSIONS[k]}
              for k,row in sources.items() if k not in selected]
    coverage={
        'since':SINCE,'until':UNTIL,'listed':len(sources),'selected':len(articles),'excluded':len(excluded),
        'originals_checked':len(originals),'unavailable_originals':0,
        'scope':'공식 보도자료 공개 목록 1·2페이지의 해당 기간 12건, 공지 목록 해당 기간 5건, 현재 공식 사이트맵의 해당 기간 스토리 2건을 원문 확인. Stories 검색 목록은 결과를 반환하지 않아 사이트맵으로 대조. 현재 목록·사이트맵에서 확인한 범위이며 비공개·검색 미노출 자료의 전수 수집을 보장하지 않음.',
        'policy':'최근 1년. 마케팅·영업·인사·사회공헌·기술 설명이 부족한 일반 공지 제외. 실제 공급·기술 협력은 공급 / 계약 및 관련 기술 목차에 교차 분류. 계획·협약과 양산 실적을 구분.',
        'sources':['https://investor.asml.com/news/press-releases','https://investor.asml.com/news/announcements','https://www.asml.com/sitemap.xml'],
    }
    catalog={'updated':UNTIL,'company':{
        'id':'asml','name':'ASML','newsroom_url':'https://investor.asml.com/news/press-releases-and-announcements',
        'logo_url':'https://ejrgus.github.io/interactive-lab/newsroom/assets/asml.svg',
        'logo_source':'https://www.asml.com/images/icons/asml-logo.svg',
    },'coverage':coverage,'fields':list(FIELDS.values()),'articles':articles}
    target=ROOT/'newsroom/catalogs'
    (target/'asml.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (target/'asml-exclusions.json').write_text(json.dumps({'since':SINCE,'until':UNTIL,'excluded':excluded},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    counts=Counter(f for a in articles for f in [a['category'],*a['topics']])
    report=[f'ASML 공식 자료 검수: {SINCE} ~ {UNTIL}',
        f'원문 {len(sources)}건 확인 → {len(articles)}건 수집 / {len(excluded)}건 제외',
        coverage['scope'],coverage['policy'],'제목은 공식 영어 원문을 유지하고 요약·공부 질문은 한국어로 작성.',
        '기사 본문·개인 기록·인증 정보를 공개 카탈로그에 포함하지 않음.',
        'ASML Investor 원문은 내부 프레임에서 표시되지 않음. 2026-10-22부터 해당 기사는 원문 주요 내용을 한국어로 정리한 내부 읽기 자료를 표시하며 원문 전체·원문 화면과 구분. 원문을 강제로 새 탭에서 열지 않음. Stories 원문 웹 동작은 유지.','',
        '분야별 건수 (동일 기사 교차 분류로 분야 합계와 고유 기사 수는 다름):']
    report.extend(f'{field}: {counts[field]}' for field in FIELDS.values())
    report.extend(['','공식 로고: '+catalog['company']['logo_source'],
        '공식 원본 심볼의 도형은 유지. 독립 이미지 표시용 viewBox·use와 홈페이지 테마색 #10069f만 추가. 원본도 asml-source.svg로 보관.'])
    (target/'asml-coverage.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
    source=(cache/'logo.txt').read_text(encoding='utf-8')
    assert '<symbol id="logo"' in source and 'viewBox="0 0 108 30"' in source
    shutil.copyfile(cache/'logo.txt',ROOT/'newsroom/assets/asml-source.svg')
    svg=source.replace('<svg xmlns="http://www.w3.org/2000/svg">',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 30" role="img" aria-label="ASML">')
    svg=svg.replace('</svg>','  <use href="#logo" fill="#10069f"/>\n</svg>')
    (ROOT/'newsroom/assets/asml.svg').write_text(svg,encoding='utf-8')
    print(json.dumps({'selected':len(articles),'excluded':len(excluded),'fields':len(counts),'contracts':counts[FIELDS['contract']]},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cache',type=Path,required=True)
    build(parser.parse_args().cache)
