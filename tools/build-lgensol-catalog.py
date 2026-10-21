"""Build reviewed LGES metadata from cached official originals and editorial selections."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
FIELDS={
    'contract':'공급 / 계약', 'cell':'셀 / 모듈 / 팩 설계',
    'cathode':'양극재 / 원료', 'anode':'음극재 / 리튬메탈',
    'electrolyte':'전해질 / 계면', 'process':'공정 / 생산기술',
    'next':'차세대 배터리 / R&D', 'quality':'시험 / 품질보증',
    'safety':'안전 / 열관리', 'bms':'BMS / 진단',
    'ess':'ESS / 전력시스템', 'application':'전동화 / 신규 응용',
    'procurement':'구매 / 공급망', 'environment':'환경 / 자원순환',
    'digital':'디지털 / AI', 'business':'재무 / 사업전략',
}
EXCLUSIONS={
    48649:'인사·인재 양성 제외',48640:'기술 상세보다 산학 교류 행사 안내 중심',
    48316:'채용 연계 행사 제외',47987:'임직원 포상 제외. LMR 기술 자체는 연구 인터뷰로 별도 수집',
    47755:'인사·전문위원 선임 제외',47004:'파트너 행사 중심. 실제 파트너십 협약은 별도 수집',
    46580:'임원 인사 제외',46562:'사회공헌·지역 홍보 제외',
    46555:'재무공시 수상 홍보 제외',46434:'인사·채용 프로그램 제외',46307:'인재·앰배서더 프로그램 제외',
    48560:'잠정 실적 중복. 같은 분기 실적발표 원문 수집',
    47729:'잠정 실적 중복. 같은 분기 실적발표 원문 수집',
    46939:'잠정 실적 중복. 연간 및 4분기 실적발표 원문 수집',
}

def build(cache):
    sources=json.loads((cache/'sources.json').read_text(encoding='utf-8'))
    posts={p['id']:p for p in sources['posts']}
    corporate={p['post_id']:p for p in sources['corporate']}
    articles=[]
    with (ROOT/'tools/lgensol-selection.csv').open(encoding='utf-8',newline='') as file:
        for choice in csv.DictReader(file,delimiter='|'):
            source_id=int(choice['source_id'])
            original=posts[source_id]
            canonical=corporate.get(source_id, original)
            assert sources['since']<=canonical['date']<=sources['until']
            assert len(original['text'])>100 and canonical['text']
            fields=[FIELDS[key] for key in choice['fields'].split(',')]
            assert len(set(fields))==len(fields)
            articles.append({
                'id':f'lgensol-{source_id}','title':canonical['title'],'url':canonical['url'],
                'date':canonical['date'],'category':fields[0],'topics':fields[1:],
                'tags':choice['tags'].split(','),'summary':choice['summary'],
                'study':'공부 질문: '+choice['study'], 'is_official':True,'verified':True,
                'source':'2026-10-22 공식 한국어 원문·표시 게시일 확인',
                'source_post_id':source_id,
                'alternate_urls':[original['url']] if source_id in corporate else [],
                'channel_date':original['date'],
            })
    selected={a['source_post_id'] for a in articles}
    assert len(selected)==len(articles)
    assert not selected.intersection(EXCLUSIONS)
    assert selected.union(EXCLUSIONS)==set(posts), 'Every original needs an editorial decision'
    assert len({a['url'] for a in articles})==len(articles)
    articles.sort(key=lambda a:(a['date'],a['id']),reverse=True)
    excluded=[{'title':corporate.get(i,p)['title'],'url':corporate.get(i,p)['url'],
               'date':corporate.get(i,p)['date'],'reason':EXCLUSIONS[i]} for i,p in posts.items() if i in EXCLUSIONS]
    coverage={
        'since':sources['since'],'until':sources['until'],'listed':len(posts),
        'selected':len(articles),'excluded':len(excluded),'corporate_originals_checked':len(corporate),
        'cross_channel_duplicates_merged':len(corporate),'unavailable_originals':0,
        'policy':'최근 1년. 마케팅·영업·인사·사회공헌 제외. 실제 공급·계약·기술 협력은 별도 목차와 관련 기술 분야에 교차 분류. 동일 보도자료는 기업 뉴스룸 원문을 우선한다.',
        'sources':['https://www.lgensol.com/kr/company/newsroom','https://inside.lgensol.com/'],
    }
    catalog={'updated':sources['until'],'company':{
        'id':'lg-energy-solution','name':'LG에너지솔루션',
        'newsroom_url':'https://www.lgensol.com/kr/company/newsroom',
        'logo_url':'https://ejrgus.github.io/interactive-lab/newsroom/assets/lg-energy-solution.svg',
        'logo_source':'https://www.lgensol.com/inc/images/symbol/ci_kr.svg',
    },'coverage':coverage,'fields':list(FIELDS.values()),'articles':articles}
    target=ROOT/'newsroom/catalogs'
    (target/'lg-energy-solution.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (target/'lg-energy-solution-exclusions.json').write_text(json.dumps({'since':sources['since'],'until':sources['until'],'excluded':excluded},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    counts=Counter(field for a in articles for field in [a['category'],*a['topics']])
    report=[f"LG에너지솔루션 공식 자료 검수: {sources['since']} ~ {sources['until']}",
        f"공식 채널 게시물 {len(posts)}건 + 기업 뉴스룸 보도자료 {len(corporate)}건 대조",
        f"동일 보도자료 {len(corporate)}건 병합 → 고유 자료 {len(posts)}건 검토 → {len(articles)}건 수집 / {len(excluded)}건 제외",
        '기업 뉴스룸 보도자료는 해당 사이트의 원문과 게시일을 우선. 배터리인사이드와 게시일 차이가 있는 경우 원 채널 날짜도 JSON에 보존.',
        coverage['policy'],'', '분야별 건수 (같은 기사 교차 분류, 합산은 기사 총수와 다름):']
    report.extend(f'{field}: {counts[field]}' for field in FIELDS.values())
    report.extend(['','공식 로고: '+catalog['company']['logo_source'],'CI 원본 SVG를 변경 없이 저장. 기사 본문·개인 메모·인증 정보는 카탈로그에 포함하지 않음.'])
    (target/'lg-energy-solution-coverage.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
    shutil.copyfile(cache/'official-logo.svg',ROOT/'newsroom/assets/lg-energy-solution.svg')
    print(json.dumps({**coverage,'contracts':counts[FIELDS['contract']]},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cache',type=Path,required=True)
    build(parser.parse_args().cache)
