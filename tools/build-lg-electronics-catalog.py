"""Build a reviewed one-year LG Electronics catalog; never includes private notes."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import re
import shutil

ROOT=Path(__file__).resolve().parents[1]
FIELDS={
    'contract':'공급 / 계약','hvac':'히트펌프 / 냉난방공조','dc':'데이터센터 / 열관리',
    'components':'컴프레서 / 핵심부품','appliance':'생활가전 / 위생기술',
    'display':'디스플레이 / 화질','audio':'음향 / 오디오','vs':'전장 / SDV',
    'connectivity':'통신 / 차세대 네트워크','iot':'AI홈 / IoT','robot':'로봇 / 피지컬 AI',
    'software':'소프트웨어 / AI','security':'사이버보안','material':'소재 / 경량화',
    'manufacturing':'스마트팩토리 / 생산','quality':'시험 / 품질보증','design':'설계 / UX·접근성',
    'energy':'환경 / 에너지','procurement':'구매 / 공급망','business':'재무 / 사업전략',
}
SPECIFIC_EXCLUSIONS={
    '236210':'스마트코티지 현장·주거 경험 소개. 구체적인 모델·설비 정보가 있는 236105 등 우선 수집',
    '236204':'히트펌프 주거모델 확산 발표. 공동주택 실증과 역할을 설명하는 236177 등 우선 수집',
    '236180':'개발자 행사 소개 중심. 구체적인 AI 코드리뷰·테스트 자료 236091·236070 우선 수집',
    '236170':'AI홈 전시 종합 소개. 실제 연구공간·허브·건설사 연동 자료 우선 수집',
    '236067':'판매 증가 및 생산라인 가동 현황 중심. 공장·공정·협력사 개선 자료 우선 수집',
    '236043':'사내벤처 육성·분사 프로그램 소개 중심. 구체적인 개발·검증 정보를 다룬 자료 우선 수집',
    '234262':'라이프스타일·인테리어 중심의 디자인 소개. 구체적인 광학·영상 처리 자료 우선 수집',
    '236115':'잠정 실적 중복. 2분기 확정 실적 236138 수집',
    '235995':'잠정 실적 중복. 1분기 확정 실적 236047 수집',
    '235010':'잠정 실적 중복. 연간 확정 실적 235393 수집',
    '235112':'동일 주제 중복 게시 및 인물 포상 중심. 차량 디스플레이·SDV 기술 원문 우선 수집',
    '235043':'인물 포상 중심. 차량 디스플레이·SDV 기술을 설명하는 자료 우선 수집',
    '234221':'협업 확대 논의 단계의 종합 소개. 구체적인 전장 공급·개발 자료 우선 수집',
    '236075':'구독 결합 상품 판매·판촉 제외',
}

def exclusion_reason(row):
    if row['id'] in SPECIFIC_EXCLUSIONS:return SPECIFIC_EXCLUSIONS[row['id']]
    title=row['title']
    if re.search(r'위클리|Vol\.|Vol\.\s*\d',title,re.I):
        return '주간·영상·종합 요약. 해당 기술을 구체적으로 설명하는 개별 원문을 우선 수집'
    if re.search(r'봉사|기부|나눔|온정|헌신|수해|참전|멸종위기|장애.?청소년|희망직업|소말리아|에티오피아|생태계 복원|해양생태계|마린.?글라스|마린.?밸런스|배터리턴|나무심기|무료 세탁|교실|생태 감수성',title):
        return '기부·지역사회 지원·사회공헌 캠페인 제외'
    if re.search(r'임원인사|조직개편|연구.?전문위원|테크.?콘퍼런스|취업|인재|청년 대상|사업센터.*신설|구성원|Life’s Good Day|사내벤처',title,re.I):
        return '인사·조직·교육·조직문화 소식 제외'
    if re.search(r'프로모션|캠페인|세일|판촉|할인|구독료|이벤트|협찬|완판|판매.*돌파|최대 매출|매출 기록|에이아이돌|옥외광고|체험존|앰버서더|미디어 파사드|고객 접점|국가대표가전|고객 감사',title):
        return '마케팅·영업·판매 촉진·브랜드 경험 행사 제외'
    if re.search(r'수상|최우수|대상|1위|최고제품상|최고 혁신상|최고 등급|어워드|어워즈',title):
        return '홍보·수상·평가 소식 중 별도 기술 원문보다 구체적인 설계·공정·검증 정보가 적어 제외'
    return '전시·출시·적용·운영 소개 중 구체적인 원리·설계·공정·시험 정보를 다룬 자료를 우선 선별. 이 게시물은 이번 수집 범위에서 제외'

def build(cache):
    sources=json.loads((cache/'sources.json').read_text(encoding='utf-8'))
    originals={p['id']:p for p in sources['posts']}
    checks={p['id']:p for p in json.loads((cache/'original-checks.json').read_text(encoding='utf-8'))}
    articles=[]
    with (ROOT/'tools/lg-electronics-selection.csv').open(encoding='utf-8',newline='') as file:
        for choice in csv.DictReader(file,delimiter='|'):
            row=originals[choice['source_id']];check=checks[row['id']]
            assert check['verified'] and check['url']==row['url'] and check['date']==row['date']
            assert sources['since']<=row['date']<=sources['until']
            fields=[FIELDS[key] for key in choice['fields'].split(',')]
            assert len(set(fields))==len(fields)
            articles.append({
                'id':'lg-electronics-'+row['id'],'title':row['title'],'url':row['url'],'date':row['date'],
                'category':fields[0],'topics':fields[1:],'tags':choice['tags'].split(','),
                'summary':choice['summary'],'study':'공부 질문: '+choice['study'],
                'is_official':True,'verified':True,'source_post_id':row['id'],
                'source':'2026-10-22 LG전자 공식 원문·정식 URL·게시일·본문 대조',
            })
    selected={a['source_post_id'] for a in articles}
    assert len(selected)==len(articles)==len({a['url'] for a in articles})
    assert len(articles)==120
    articles.sort(key=lambda a:(a['date'],a['id']),reverse=True)
    excluded=[{'url':r['url'],'title':r['title'],'date':r['date'],'reason':exclusion_reason(r)}
              for i,r in originals.items() if i not in selected]
    coverage={
        'since':sources['since'],'until':sources['until'],'listed':len(originals),'selected':len(articles),
        'excluded':len(excluded),'pages_checked':sources['pages_checked'],
        'oldest_boundary_date':sources['oldest_boundary_date'],'originals_checked':len(checks),
        'selected_originals_verified':len(articles),'unavailable_selected_originals':0,
        'scope':f"이전 뉴스룸 live.lge.co.kr가 안내하는 새 공식 뉴스룸을 사용. 공개 목록 {sources['pages_checked']}페이지의 최근 1년 {len(originals)}건을 검토하고 공개 API에서 전체 본문을 확보. 후보 {len(checks)}건의 정식 원문 페이지를 대조해 {len(articles)}건 선별. 마케팅·인사·사회공헌·주간 요약 및 비슷한 내용의 반복 출시·전시 소개는 제외.",
        'policy':'기술·개발·소재·생산·시험·품질·보안·에너지·구매·재무 관련 자료. 제품 출시는 구체적인 기술 설명이 있는 경우 포함. 공급·계약·기술 협력은 별도 목차에 모으고 실제 기술 내용이 있으면 관련 목차에도 교차 분류. 주제 집계는 중복 표시를 포함.',
        'sources':['https://www.lge.co.kr/story/newsroom', 'https://apiv2.lge.co.kr/displaysvc/ajax/v1/story/newsroom-list'],
    }
    catalog={'updated':sources['until'],'company':{
        'id':'lg-electronics','name':'LG전자','newsroom_url':'https://www.lge.co.kr/story/newsroom',
        'logo_url':'https://ejrgus.github.io/interactive-lab/newsroom/assets/lg-electronics.svg',
        'logo_source':'https://www.lge.co.kr/kr/common/footer/lge-logo.svg',
    },'coverage':coverage,'fields':list(FIELDS.values()),'articles':articles}
    target=ROOT/'newsroom/catalogs'
    (target/'lg-electronics.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (target/'lg-electronics-exclusions.json').write_text(json.dumps({'since':sources['since'],'until':sources['until'],'excluded':excluded},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    counts=Counter(f for a in articles for f in [a['category'],*a['topics']])
    report=[f"LG전자 공식 자료 검수: {sources['since']} ~ {sources['until']}",
        f'공개 목록 {len(originals)}건 검토 → {len(articles)}건 수집 / {len(excluded)}건 제외',
        f"후보 원문 {len(checks)}건 정식 URL·제목·게시일·본문 대조. 선정 {len(articles)}건 전부 확인.",
        coverage['scope'],coverage['policy'],'기사의 사실 요약과 공부 질문을 구분. 본문 전체·개인 메모·인증 정보를 공개 카탈로그에 포함하지 않음.','',
        '분야별 건수 (같은 기사 교차 분류로 합계는 고유 기사 수보다 큼):']
    report.extend(f'{f}: {counts[f]}' for f in FIELDS.values())
    report.extend(['','공식 로고: '+catalog['company']['logo_source'],'LG전자 공식 사이트의 SVG 원본을 변경 없이 저장.'])
    (target/'lg-electronics-coverage.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
    shutil.copyfile(cache/'official-logo.svg',ROOT/'newsroom/assets/lg-electronics.svg')
    print(json.dumps({'selected':len(articles),'excluded':len(excluded),'fields':len(counts),'contracts':counts[FIELDS['contract']]},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    build(parser.parse_args().cache)
