"""Build the manually reviewed LG Innotek public catalog; no personal data."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FIELDS={'contract':'공급 / 계약','optical':'카메라 / 광학','sensing':'자율주행 / 센서 퓨전',
    'robot':'로봇 / 피지컬 AI','packaging':'반도체 기판 / 패키징','glass':'유리기판',
    'smartic':'스마트 IC 기판','lighting':'차량 조명 / 포토닉스','wireless':'무선통신 / 커넥티비티',
    'power':'전동화 / 전력변환','software':'소프트웨어 / AI','manufacturing':'생산기술 / 공정',
    'quality':'시험 / 품질검증','material':'소재 / 표면처리','energy':'환경 / 에너지',
    'procurement':'구매 / 공급망','business':'재무 / 사업전략'}
EXCLUSIONS={
    'press-6603':'인물 포상 중심. 패키지 생산·공정 기술은 별도 원문에서 수집',
    'press-6599':'인재 채용·채용 행사 제외',
    'press-6596':'공식 제목은 2분기 실적이나 본문은 1분기 실적으로 불일치. 잘못된 분기 요약을 방지하기 위해 제외',
    'press-6595':'대학생 숏폼 광고 공모전·브랜드 홍보 제외',
    'press-6589':'기존 파트너십의 경영진 회동·협력 방안 논의. 실제 파트너십 체결 및 플릿 운영 원문 우선 수집',
    'press-6585':'대학생 숏폼 광고 공모전·채용 브랜딩 제외',
    'press-6584':'노경 관계·직원 건강·조직문화 선언 중심. 구체적인 공정 안전 기술 자료가 아니므로 제외',
    'press-6583':'아동 지원·사회공헌 사업 제외',
    'press-6577':'의결권 대리행사 위임장 안내. 직무 기술·운영 자료 수집 범위 밖',
    'insights-226':'기술백서 도입 안내로 공개 본문은 센서 개관에 그침. 구체적인 센싱·실증·시뮬레이션 원문 우선 수집; 첨부 백서는 이번 범위 밖',
    'press-6570':'신년 경영방침·조직 메시지 중심. 구체적인 기술·투자·실적 원문 우선 수집',
    'press-6569':'임직원 봉사·사회공헌 사업 제외',
    'press-6564':'CES 사전 전시 예고. 실제 전시와 개별 신제품 기술 원문으로 중복 축소',
    'press-6561':'동반성장 평가 수상 중심. 구체적인 협력사 협약·지원 운영은 2026년 원문에서 수집',
}

def build(cache):
    sources=json.loads((cache/'sources.json').read_text(encoding='utf-8'))
    originals={r['id']:r for r in sources['posts']}
    checks={r['id']:r for r in json.loads((cache/'original-checks.json').read_text(encoding='utf-8'))}
    articles=[]
    with (ROOT/'tools/lg-innotek-selection.csv').open(encoding='utf-8',newline='') as file:
        for choice in csv.DictReader(file,delimiter='|'):
            row=originals[choice['source_id']];check=checks[row['id']]
            assert check['verified'] and check['url']==row['url'] and check['date']==row['date']
            fields=[FIELDS[k] for k in choice['fields'].split(',')]
            assert len(fields)==len(set(fields))
            articles.append({'id':'lg-innotek-'+row['id'],'title':row['title'],'url':row['url'],
                'date':row['date'],'category':fields[0],'topics':fields[1:],'tags':choice['tags'].split(','),
                'summary':choice['summary'],'study':'공부 질문: '+choice['study'],
                'is_official':True,'verified':True,'source_post_id':row['id'],
                'detail_registration_date':check['detail_registration_date'],
                'source':'2026-10-22 LG이노텍 공식 목록 공개일(from_day)·제목·원문 전체 본문 대조'})
    selected={a['source_post_id'] for a in articles}
    assert len(selected)==len(articles)==28
    assert selected.isdisjoint(EXCLUSIONS) and selected|EXCLUSIONS.keys()==originals.keys()
    assert len({a['url'] for a in articles})==len(articles)
    articles.sort(key=lambda a:(a['date'],a['id']),reverse=True)
    excluded=[{k:r[k] for k in ['url','title','date']}|{'reason':EXCLUSIONS[r['id']]} for r in sources['posts'] if r['id'] not in selected]
    coverage={'since':sources['since'],'until':sources['until'],'listed':len(originals),
        'selected':len(articles),'excluded':len(excluded),'pages_checked':sources['pages_checked'],
        'oldest_boundary_dates':sources['oldest_boundary_dates'],'selected_originals_verified':len(articles),
        'scope':'공식 기업 사이트 한국어 보도자료 3페이지와 Insights 1페이지에서 기간 경계까지 확인한 최근 1년 42건. 각 원문의 제목·공개 목록의 공개일·전체 본문을 대조해 28건 선별. 공식 티스토리·SNS·제품 상시 소개·첨부 PDF 전체는 수집 범위에 포함하지 않음.',
        'date_policy':'공식 목록의 from_day를 공개일로 사용. 상세 화면 reg_dt는 CMS 등록일이 달라질 수 있어 별도 기록. 등록일을 공개일로 바꾸지 않음.',
        'policy':'기술·설계·소재·생산·시험·품질·전력·에너지·구매·사업전략 포함. 마케팅·영업·인사·사회공헌 제외. 실제 공급·투자협약·공동개발·협력사 협약은 공급 / 계약에 모으고 기술 본문이 있는 분야에도 같은 기사 ID로 교차 분류. 단순 수주잔고·공급 언급만 있는 실적 자료는 계약 목차에 넣지 않음.',
        'sources':['https://www.lginnotek.com/news/press.do','https://www.lginnotek.com/news/insights.do'],
        'source_conflicts_excluded':['press-6596']}
    catalog={'updated':sources['until'],'company':{'id':'lg-innotek','name':'LG이노텍',
        'newsroom_url':'https://www.lginnotek.com/news/press.do',
        'logo_url':'https://ejrgus.github.io/interactive-lab/newsroom/assets/lg-innotek.png',
        'logo_source':'https://www.lginnotek.com/resources/img/img-logo-en-gr%403x.png'},
        'coverage':coverage,'fields':list(FIELDS.values()),'articles':articles}
    target=ROOT/'newsroom/catalogs'
    for name,data in [('lg-innotek.json',catalog),('lg-innotek-exclusions.json',{'since':sources['since'],'until':sources['until'],'excluded':excluded})]:
        (target/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    counts=Counter(f for a in articles for f in [a['category'],*a['topics']])
    report=[f"LG이노텍 공식 자료: {sources['since']} ~ {sources['until']}",
        f'42건 검토 → {len(articles)}건 수집 / {len(excluded)}건 제외',coverage['scope'],coverage['date_policy'],coverage['policy'],
        '제목·본문의 분기가 일치하지 않는 2026-07-27 실적 자료 1건은 제외 사유에 명시.',
        '사실 요약과 공부 질문 구분. 전체 원문·개인 메모·인증정보는 공개 파일에 포함하지 않음.','',
        '분야별 건수 (교차 분류를 포함하므로 합계는 고유 기사 수보다 큼):']
    report.extend(f'{f}: {counts[f]}' for f in FIELDS.values())
    report.extend(['','공식 로고: '+catalog['company']['logo_source'],'공식 회사명과 심벌이 결합된 고해상도 PNG 원본을 변경 없이 저장.'])
    (target/'lg-innotek-coverage.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
    print(json.dumps({'selected':len(articles),'excluded':len(excluded),'fields':len(counts),'contracts':counts[FIELDS['contract']]},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    build(parser.parse_args().cache)
