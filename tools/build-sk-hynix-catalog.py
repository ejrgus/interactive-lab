"""Build the reviewed one-year SK hynix public catalog and exclusion report."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
FIELDS={'contract':'공급 / 계약','hbm':'HBM / 고대역폭 메모리','dram':'D램 / 저전력·서버 메모리',
    'nand':'낸드 / 3D 적층','storage':'SSD / 스토리지','pkg':'패키징 / TSV·본딩',
    'device':'소자 / 신소재','metrology':'마스크 / 계측·분석','process':'공정 / 수율',
    'manufacture':'양산관리 / 생산계획','automation':'스마트팩토리 / 자동화',
    'test':'시험 / 신뢰성','system':'시스템 아키텍처 / CXL','pim':'PIM / 차세대 컴퓨팅',
    'software':'소프트웨어 / AI','thermal':'열관리 / 전력효율','infra':'팹 / 유틸리티',
    'safety':'설비 / 산업안전','environment':'환경 / 자원순환','procurement':'구매 / 공급망',
    'logistics':'물류 / 통관','business':'재무 / 사업전략','optical':'광인터커넥트 / CPO'}
SPECIFIC_EXCLUSIONS={
    '67514':'부지 방문·추진 의지 소개. 팹·클린룸 규모와 투자 범위가 구체적인 공식 자료 우선 수집',
    '67332':'최근 보도 관련 사실관계 공지. 직무 기술·운영 정보 범위 밖',
    '66624':'미확정 보도에 대한 부인. 공급·투자 확정 사실로 취급하지 않음',
    '66472':'글로벌 인재 교류·기술 비전 행사 중심. 구체적인 연구·공정·제품 원문 우선 수집',
    '66145':'내부 미래포럼·비전 논의 중심. 구체적인 연구·설비·시스템 원문 우선 수집',
    '65825':'인디애나 기공식 현장 스케치 중복. 투자와 R&D MOU를 명시한 65824 수집',
    '65352':'본문이 없는 기공식 영상. 정식 기공 보도자료 65824 수집',
    '65756':'전시 포트폴리오 반복 소개. 개별 제품·규격·시스템 데모 원문 우선 수집',
    '64804':'FMS 현장 후속 소개. HBF 규격·차세대 낸드 발표 원문 64588 우선 수집',
    '64477':'그룹 경영진의 빅테크 회동·협력 논의 중심. 구체적인 체결·공동 개발 원문 우선 수집',
    '64121':'PIM 강의·개념 반복. 구조 설명 64436과 소자·연구·시스템 직무 원문 우선 수집',
    '63907':'나스닥 타종 기념사 중복. ADR 거래 개시 공식 보도자료 63836 수집',
    '63801':'풀 스택 메모리 종합 소개. 계층 구조 및 개별 제품 기술 원문 우선 수집',
    '63573':'지역 투자 계획 설명. 실제 팹 투자·클린룸·패키징 계획 원문 우선 수집',
    '63572':'지역 투자 계획 설명. 실제 팹 투자·클린룸·패키징 계획 원문 우선 수집',
    '63531':'그룹 AI 인프라 종합 발표. SK하이닉스 직접 생산·연구·공동 개발 원문 우선 수집',
    '63514':'중장기 투자 방향 설명. 팹별 투자 범위·일정이 구체적인 후속 원문 우선 수집',
    '63273':'입문용 종합 요약. 개별 메모리 제품·직무·기술 구조 원문 우선 수집',
    '63262':'HPE 행사·기존 파트너십 재확인. 구체적인 신규 공급·체결 자료가 아니며 제품 기술은 별도 수집',
    '63122':'COMPUTEX 관람·해설 중복. iHBM·HBM4E 등 개별 기술 원문 우선 수집',
    '62380':'HBM·패키징 강의 반복. TSV·MR-MUF·하이브리드 본딩 전용 원문 우선 수집',
    '62466':'폭스콘 경영진 회동·협력 논의. 확정 공급 계약으로 취급하지 않음',
    '62444':'TSMC 경영진 회동·협력 논의. 실제 기술 구조를 다룬 심포지엄 원문 별도 수집',
    '62600':'경영진 COMPUTEX 회동 스케치. 정식 장기 기술 파트너십 62951 수집',
    '62539':'COMPUTEX 전시 종합 소개. 신제품·패키징 기술 원문 우선 수집',
    '62439':'키노트 참석·전략 비전 소개. 구체적인 기술·체결 원문 우선 수집',
    '60634':'차세대 메모리 입문·전망. 시스템 계층·메모리 연산의 상세 원문 우선 수집',
    '60219':'지역 클러스터·국가 산업 전망 칼럼. 실제 팹·유틸리티 투자 원문 우선 수집',
    '61174':'지역 경제·부활 전략 칼럼. 이번 직무 기술·운영 자료 선별 범위 밖',
    '61263':'기업 혁신상 수상 홍보. 구체적인 HBM 구조·공정·검증 원문 별도 수집',
    '61489':'지구의 날 종합 캠페인. 용수 재이용·HyLCA·제품 탄소 검증 원문 우선 수집',
    '61165':'P&T7 지역 경제 효과 소개. 시설·전후공정 연계 설명 57925 수집',
    '61209':'동반성장협의회 행사·운영 방향 논의. 실제 상생 협약·금융 지원 63643·67797 수집',
    '60246':'지역 클러스터 전망 칼럼. 구체적인 투자·클린룸 계획 원문 우선 수집',
    '60228':'AI 산업 생태계 전망 칼럼. 구체적인 시스템·메모리 공동 설계 원문 우선 수집',
    '59864':'국가 산업 자본·에너지 정책 전망 칼럼. 구체적인 공장·냉각 운영 원문 우선 수집',
    '60866':'윤리경영 선정 홍보. 구체적인 직무 기술·운영 자료 우선 수집',
    '59318':'투자 법제에 관한 전망 칼럼. 실제 설비 투자 원문 우선 수집',
    '60746':'GTC 관람·전망 해설. 제품·시스템 및 공동 개발 원문 우선 수집',
    '59683':'국가 산업 정책·피지컬 AI 전망 칼럼. 구체적인 기술 설명 원문 우선 수집',
    '60430':'GTC 경영진 참석·위상 홍보. 실제 기술 파트너십 62951 수집',
    '60330':'GTC 제품 포트폴리오·파트너십 재확인. 제품·공동 개발 전용 원문 우선 수집',
    '60423':'GTC 전시 예고 반복. 개별 기술 원문 우선 수집',
    '60249':'환경 평가 수상 홍보. 구체적인 물 재이용·탄소 검증 자료 별도 수집',
    '59370':'구글 경영진 회동·협력 논의. 확정 계약으로 취급하지 않음',
    '59368':'메타 경영진 회동·협력 논의. 확정 계약으로 취급하지 않음',
    '59366':'마이크로소프트 경영진 회동·협력 논의. 확정 계약으로 취급하지 않음',
    '59362':'브로드컴 경영진 회동·협력 논의. 확정 계약으로 취급하지 않음',
    '59360':'엔비디아 경영진 회동. 정식 장기 기술 파트너십 62951 수집',
    '58219':'AI 회사 설명 중복. 회사 개편·투자 구상을 상세히 설명하는 58349 수집',
    '57950':'CES 경영진 현장 스케치. HBM·패키징·메모리 전용 기술 원문 우선 수집',
    '57656':'시장·투자기관 전망 종합. 실제 제품·양산·분기 실적 원문 우선 수집',
    '57699':'신년 경영방침·조직 메시지 제외',
    '57236':'공장 투자 관련 설명. 더 구체적인 팹별 투자·클린룸 계획 원문 우선 수집',
    '56931':'일반 AI 사회·생존 전략 강연. 반도체 기술 원문 우선 수집',
    '56911':'일반 기업 어워즈 수상 홍보. 기술·성능 근거가 구체적인 원문 우선 수집',
    '55890':'슈퍼컴퓨팅 제품 전시 반복. 스토리지 전략·제품 기술 원문 우선 수집',
    '56146':'AE 용어 개관. 실제 실장평가 업무 원문 55655 수집',
    '55413':'로봇과 사회·관계에 대한 일반 칼럼. 기술 직무 자료 우선 수집',
    '54348':'본문이 없는 로고플레이. 브랜드 홍보 미디어 제외',
    '55563':'AI Summit 종합 비전 소개. 개별 제품·구조·연구 자료 우선 수집',
    '54743':'전시 포트폴리오 종합 소개. 상세 제품·패키징·시스템 원문 우선 수집',
}

def reason(row):
    if row['id'] in SPECIFIC_EXCLUSIONS:return SPECIFIC_EXCLUSIONS[row['id']]
    title=row['title']
    if re.search(r'상생 IN사이드|사회적가치|하인슈타인|행복GPS|행복AI스터디랩|ICT사랑방|핸드볼|나눔|기부|행복나눔|그린 Green|Green Impact|워터 포지티브|상생협력 확대',title,re.I):return '사회공헌·지역사회 지원·교육·생태보전 목적의 활동 제외'
    if re.search(r'채용|Talent|The Leaders|신임임원|임원인사|조직개편|기술전문가 임명|일·생활|대상 시상식|발명.*시상식|훈장|수훈|포상|표창|수상.*공로|유공|산업포장|앰버서더.*모집|앰버서더.*발대식|앰버서더.*어워즈|하이닉스.*해커톤',title,re.I):return '채용·인사·리더 선임·직원 포상·조직문화 행사 중심. 기술 원문은 별도 수집'
    if re.search(r'ThanksFULL|기업열전|초심|캐릭터|하빔이|HBM 칩스|기업 PR|광고|서평|슈퍼 모멘텀|카페테리아|주니어보드|캠퍼스 비긴어게인|H리그|문화축제|캠퍼스 투어|SR 포럼',title,re.I):return '광고·브랜드 경험·일반 행사·독서·복지·조직문화 소식 제외'
    return '직무 공부에 구체적인 원리·공정·시험·운영 정보를 제공하는 원문을 우선해 선별. 이 종합 소개·행사·전망 자료는 제외'

def build(cache):
    sources=json.loads((cache/'sources.json').read_text(encoding='utf-8'))
    rows={r['id']:r for r in sources['posts']}
    checks={r['id']:r for r in json.loads((cache/'original-checks.json').read_text(encoding='utf-8'))}
    articles=[]
    with (ROOT/'tools/sk-hynix-selection.csv').open(encoding='utf-8',newline='') as file:
        for choice in csv.DictReader(file,delimiter='|'):
            row=rows[choice['source_id']];check=checks[row['id']]
            assert check['verified'] and check['url']==row['url'] and check['date']==row['date']
            fields=[FIELDS[k] for k in choice['fields'].split(',')];assert len(fields)==len(set(fields))
            articles.append({'id':'sk-hynix-'+row['id'],'title':row['title'],'date':row['date'],'url':row['url'],
                'category':fields[0],'topics':fields[1:],'tags':choice['tags'].split(','),
                'summary':choice['summary'],'study':'공부 질문: '+choice['study'],
                'is_official':True,'verified':True,'source_post_id':row['id'],
                'source':'2026-10-22 SK하이닉스 공식 원문·정식 URL·게시일·전체 본문 대조'})
    assert len(articles)==len({r['id'] for r in articles})==len({r['url'] for r in articles})==64
    selected={r['source_post_id'] for r in articles}
    excluded=[{k:r[k] for k in ['title','date','url']}|{'reason':reason(r)} for r in sources['posts'] if r['id'] not in selected]
    articles.sort(key=lambda r:(r['date'],r['id']),reverse=True)
    coverage={'since':sources['since'],'until':sources['until'],'listed':len(rows),'selected':len(articles),'excluded':len(excluded),
        'inventory_total':sources['inventory_total'],'inventory_pages':sources['inventory_pages'],'text_pages':sources['text_pages'],
        'non_text_posts':sources['inventory_total']-len(rows),'selected_originals_verified':len(articles),
        'scope':'공식 한국어 WordPress 공개 목록의 기간 내 전체 1,179개 게시물 메타데이터를 확인. PRESS·FACT·STORY·TECH&AI 및 기술·문화·지속가능성 본문 분류 202건의 전체 텍스트를 확보해 64건 선별. 선정 원문 64건의 정식 URL·화면 제목·게시일·본문을 HTML과 대조. 사진·영상·SNS·IR 등 별도 분류 977건은 중복·미디어 구분을 위해 목록만 확인했으며 개별 내용은 수집하지 않음.',
        'policy':'최근 1년 기술·설계·소자·공정·패키징·양산·품질·소프트웨어·구매·물류·산업안전·환경·재무 자료. 채용 행사·인물 포상·임원 선임·조직문화·마케팅·사회공헌 제외. 기술 원리·실무를 설명하는 직무 인터뷰는 포함. 공급·협약·공동 개발은 별도 분류하되 단순 CEO 회동·협의 진행·양산 발표만으로 확정 계약이라 표시하지 않음.',
        'sources':['https://news.skhynix.co.kr/','https://news.skhynix.co.kr/wp-json/wp/v2/posts'],
        'limitations':'영문 뉴스룸·첨부 논문 전체·사진 및 영상 본문 전체는 범위 밖. 연구 성과는 공식 뉴스룸의 설명을 요약하며 논문 전체를 검증했다는 의미가 아님.'}
    catalog={'updated':sources['until'],'company':{'id':'sk-hynix','name':'SK하이닉스','newsroom_url':'https://news.skhynix.co.kr/',
        'logo_url':'https://ejrgus.github.io/interactive-lab/newsroom/assets/sk-hynix.png',
        'logo_source':'https://www.skhynix.com/img/common/img_logo.png'},'coverage':coverage,'fields':list(FIELDS.values()),'articles':articles}
    target=ROOT/'newsroom/catalogs'
    for name,data in [('sk-hynix.json',catalog),('sk-hynix-exclusions.json',{'since':sources['since'],'until':sources['until'],'excluded':excluded})]:
        (target/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    counts=Counter(f for r in articles for f in [r['category'],*r['topics']])
    report=[f"SK하이닉스 공식 자료: {sources['since']} ~ {sources['until']}",
        f'전체 목록 1,179건 → 정식 본문 202건 검토 → {len(articles)}건 등록 / {len(excluded)}건 제외',coverage['scope'],coverage['policy'],coverage['limitations'],
        '공식 게시일 사용. 사실 요약과 공부 질문 구분. 전체 원문·개인 메모·인증 정보는 공개 파일에 포함하지 않음.','',
        '분야별 건수 (교차 분류를 포함하므로 합계는 고유 기사 수보다 큼):']
    report.extend(f'{f}: {counts[f]}' for f in FIELDS.values())
    report.extend(['','공식 회사 로고: '+catalog['company']['logo_source'],'공식 기업 사이트의 PNG 로고를 변경 없이 저장. 뉴스룸 워드마크 대신 기업 로고 사용.'])
    (target/'sk-hynix-coverage.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
    print(json.dumps({'selected':len(articles),'excluded':len(excluded),'fields':len(counts),'contracts':counts[FIELDS['contract']]},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    build(parser.parse_args().cache)
