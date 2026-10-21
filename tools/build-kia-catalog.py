"""Build a reviewed Kia catalog from official full-content responses."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
FIELDS={
    'contract':'공급 / 계약','pbv':'PBV / 특장','special':'PBV / 특장',
    'design':'설계 / 공간·접근성','adas':'ADAS / 자율·원격운전','autonomous':'ADAS / 자율·원격운전',
    'software':'차량전자 / 소프트웨어','quality':'시험 / 품질검증','logistics':'물류 / 플릿 운영',
    'body':'차체 / 재료·충돌','material':'차체 / 재료·충돌','ev':'전동화 구동 / 배터리',
    'charging':'열관리 / 충전','thermal':'열관리 / 충전','manufacturing':'스마트제조 / 자동화',
    'welding':'생산공정 / 조립·컨버전','assembly':'생산공정 / 조립·컨버전','paint':'생산공정 / 조립·컨버전',
    'procurement':'구매 / 공급망','business':'재무 / 사업전략','safety':'설비 / 산업안전',
    'chassis':'섀시 / 주행제어','service':'정비 / 서비스 운영','hybrid':'하이브리드 / 에너지 제어',
    'environment':'환경 / 에너지·자원순환','energy':'환경 / 에너지·자원순환',
}
SPECIFIC_EXCLUSIONS={
    '1556':'PV7 티저. 차체·전동화·소프트웨어를 구체적으로 설명하는 정식 공개 원문 1561 수집',
    '1553':'전시 참가와 차량 체험 중심. 개별 신차·생산·실증 기술 원문 우선 수집',
    '1548':'갯벌 생태복원·사회공헌 활동 제외. 공장 환경·에너지 자료는 별도 수집',
    '1538':'해양 환경 보호 단체 차량 지원·사회공헌 목적 후원 제외',
    '1537':'연식변경 사양 구성·가격 중심. 구체적인 제어·설계 기술 자료 우선 수집',
    '1534':'지속가능경영 보고서 발간 안내. 첨부 보고서 전체는 이번 수집 범위 밖; 공장 자원순환·에너지 원문 별도 수집',
    '1531':'교통약자 이동 지원·구매 지원 등 사회공헌 목적 협약 제외. 차량 구조·실제 택시 운용 자료는 별도 수집',
    '1524':'정비사 경연·교육·포상 행사 중심. 구체적인 정비 기술 원문이 아니므로 제외',
    '1521':'월드컵 파트너십에 따른 행사 차량 지원·마케팅 제외',
    '1520':'연식변경 편의사양·가격 구성 중심. 구체적인 기술 원문 우선 수집',
    '1518':'군용차 전시 반복 소개. 동일 차종의 환경 대응 설계와 성능을 설명하는 1530 수집',
    '1515':'올해의 SUV 수상 홍보. 상세 플랫폼·제어 기술 원문 1485 수집',
    '1512':'밀라노 디자인 행사·브랜드 철학 전시 중심. 구체적인 차량 설계 원문 우선 수집',
    '1511':'장애인의 날 연계 체험·지원 프로그램 제외. WAV 차량 구조·실제 운용 원문은 별도 수집',
    '1510':'연식변경 옵션·가격 구성 중심. 구체적인 기술 원문 우선 수집',
    '1505':'오토쇼 전시·기존 차종 소개 반복. 셀토스·PV5 WAV의 상세 기술 원문 우선 수집',
    '1503':'제조사 대상·상품성 평가 홍보 중심. 구체적인 기술·공정 원문 우선 수집',
    '1499':'지역사회·지방소멸 대응 지원 사업 제외',
    '1498':'공장 고객 체험 공간·브랜드 경험 운영 제외',
    '1496':'교통약자 차량 구매 지원금·충전기 무상 설치 지원 중심의 파트너십 제외. 차량 기술·UD택시 실제 도입 원문 우선 수집',
    '1495':'홍보대사·선수 대상 차량 전달·마케팅 제외',
    '1490':'플래그십 스토어·브랜드 체험 거점 개관 제외',
    '1484':'전기차 가격·구매 지원·혜택 중심의 판매 촉진 제외',
    '1482':'니로 디자인 사전 공개. 제어·승차감·플랫폼을 설명하는 정식 원문 1493 수집',
    '1476':'봉고 연식변경 사양·가격 중심. 구체적인 설계·공정 기술 원문 우선 수집',
    '1474':'일반 자동차 어워즈 수상 모음. 구체적인 안전 시험·실주행 검증 원문 별도 수집',
    '1471':'셀토스 정식 출시와 내용 중복. 차체 플랫폼·회생제동·하이브리드 제어를 설명하는 1485 우선 수집',
    '1467':'창립 기념 행사·브랜드 역사 소개 제외',
    '1464':'올해의 밴 선정 홍보. 구체적인 안전 평가·실주행 시험 자료 별도 수집',
    '1462':'셀토스 티저. 상세 기술을 설명하는 1485 수집',
    '1461':'공장 고객 체험 공간·브랜드 경험 운영 제외',
    '1459':'스포츠 행사 차량 전시·브랜드 홍보 제외',
    '1456':'패밀리카 수상 홍보. 구체적인 차량 설계·검증 원문 별도 수집',
    '1452':'올해의 밴 수상 홍보. 구체적인 안전 평가·실주행 시험 원문 별도 수집',
    '1451':'중고차·PBV 체험 거점 개소 중심의 영업·브랜드 경험 운영 제외',
    '1445':'일본 시장 진출 선언. 현재 발표한 공급 계약이 아닌 과거 계약 언급이며 현지 기술 상세는 1519에서 수집',
    '1441':'홍보대사·스포츠 마케팅 파트너십 연장 제외',
}

def exclusion_reason(row):
    if row['id'] in SPECIFIC_EXCLUSIONS:return SPECIFIC_EXCLUSIONS[row['id']]
    title=row['title']
    if re.search(r'\d년.*\d대 판매',title):return '월별·연간 판매대수 공지 제외. 재무·원가 요인은 분기 경영실적에서 수집'
    if re.search(r'그랜드 마스터|채용|하모니움|일하기 좋은|고용 촉진|부트캠프',title):return '채용·인사·직원 포상·조직문화·인재 교육 소식 제외'
    if re.search(r'사회공헌|그린라이트|초록여행|기부|Move & Connect|무브투유',title):return '기부·사회공헌·지역사회 지원 사업 제외'
    if re.search(r'캠페인|광고|FIFA|호주오픈|공모전|이벤트|얼리 체크인|디스플레이 테마|Kia Collection|블랙 에디션|브랜드 체험|볼키즈',title):return '광고·마케팅·협찬·브랜드 경험·판촉·외장 스타일 패키지 소개 제외'
    raise ValueError('Review exclusion explicitly: '+row['id']+' '+title)

def build(cache):
    sources=json.loads((cache/'sources.json').read_text(encoding='utf-8'))
    originals={r['id']:r for r in sources['posts']}
    checks={r['id']:r for r in json.loads((cache/'original-checks.json').read_text(encoding='utf-8'))}
    articles=[]
    with (ROOT/'tools/kia-selection.csv').open(encoding='utf-8',newline='') as file:
        for choice in csv.DictReader(file,delimiter='|'):
            row=originals[choice['source_id']];check=checks[row['id']]
            assert check['verified'] and check['date']==row['date'] and check['url']==row['url']
            assert sources['since']<=row['date']<=sources['until']
            fields=list(dict.fromkeys(FIELDS[k] for k in choice['fields'].split(',')))
            articles.append({'id':'kia-'+row['id'],'title':row['title'],'date':row['date'],'url':row['url'],
                'category':fields[0],'topics':fields[1:],'tags':choice['tags'].split(','),
                'summary':choice['summary'],'study':'공부 질문: '+choice['study'],
                'is_official':True,'verified':True,'source_post_id':row['id'],
                'alternate_urls':[row['alternate_url']],
                'source':'2026-10-22 기아 공식 한국어 목록·상세 API의 제목·공개일·전체 본문 대조'})
    assert len(articles)==len({r['id'] for r in articles})==len({r['url'] for r in articles})==38
    selected={r['source_post_id'] for r in articles}
    excluded=[{k:r[k] for k in ['title','date','url']}|{'reason':exclusion_reason(r)} for r in sources['posts'] if r['id'] not in selected]
    coverage={'since':sources['since'],'until':sources['until'],'listed':len(originals),'selected':len(articles),
        'excluded':len(excluded),'pages_checked':sources['pages_checked'],'oldest_boundary_date':sources['oldest_boundary_date'],
        'selected_originals_verified':len(articles),'all_originals_checked':len(checks),
        'scope':'공식 글로벌 브랜드 사이트의 한국어 뉴스룸 공개 목록 2페이지에서 최근 1년 125건을 확인. 프런트엔드가 사용하는 공개 목록·상세 API의 전체 본문, 제목, 공개일을 대조해 38건 선별. 영문 글로벌 뉴스·SNS·첨부 보고서·PDF 전체는 이번 범위 밖.',
        'identity_policy':'기아 공식 한국어 원문을 대표 URL로 사용하고 그룹 PR 원문 주소를 출처 메타데이터에 보존. 기존 현대자동차그룹의 기사 ID나 회사 연결을 변경하지 않음. DB의 기존 기아 기업 ID는 이름 조회로 재사용.',
        'policy':'기술·개발·설계·재료·생산·설비·시험·품질·소프트웨어·물류·구매·환경·에너지·재무를 포함. 마케팅·영업·인사·사회공헌 제외. 신차 계약 개시는 구매 접수 안내이므로 그 자체로 공급 / 계약에 넣지 않고 실제 공급·업무협약·협력 체결만 별도 분류. 일반 어워즈 대신 구체적인 시험·설계 근거가 있는 자료를 수집.',
        'sources':['https://worldwide.kia.com/ko/newsroom-korea','https://worldwide.kia.com/api/newsroom'],
        'verification_note':'기아 공개 컴포넌트의 newsroom.list4·detail1을 통해 실제 화면의 title·publicatedAt·content 사용을 확인. 1559 원문 화면 제목·날짜와 대조; 최종 선정 자료 전체는 상세 API 본문과 일치.'}
    catalog={'updated':sources['until'],'company':{'id':'kia','name':'기아','newsroom_url':'https://worldwide.kia.com/ko/newsroom-korea',
        'logo_url':'https://ejrgus.github.io/interactive-lab/newsroom/assets/kia.svg',
        'logo_source':'https://www.kia.com/etc.clientlibs/kwp-global/clientlibs/clientlib-site/resources/images/common/logo.svg'},
        'coverage':coverage,'fields':list(dict.fromkeys(FIELDS.values())),'articles':articles}
    target=ROOT/'newsroom/catalogs'
    for name,data in [('kia.json',catalog),('kia-exclusions.json',{'since':sources['since'],'until':sources['until'],'excluded':excluded})]:
        (target/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    counts=Counter(f for a in articles for f in [a['category'],*a['topics']])
    report=[f"기아 공식 자료: {sources['since']} ~ {sources['until']}",
        f'{len(originals)}건 검토 → {len(articles)}건 등록 / {len(excluded)}건 제외',coverage['scope'],coverage['policy'],coverage['identity_policy'],
        '목록 공개일 publicatedAt 사용. 요약은 사실, study는 공부 질문으로 구분. 개인 메모·인증정보·본문 전체는 공개 파일에 포함하지 않음.','',
        '분야별 건수 (같은 기사 교차 분류를 포함하므로 합계는 고유 기사 수보다 큼):']
    report.extend(f'{f}: {counts[f]}' for f in catalog['fields'])
    report.extend(['','공식 로고: '+catalog['company']['logo_source'],'기아 공식 사이트 SVG 원본을 변경 없이 저장.'])
    (target/'kia-coverage.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
    print(json.dumps({'selected':len(articles),'excluded':len(excluded),'fields':len(counts),'contracts':counts[FIELDS['contract']]},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    build(parser.parse_args().cache)
