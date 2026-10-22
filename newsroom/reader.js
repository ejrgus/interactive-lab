import { canonicalUrl } from './model.js?v=20261022-09';
import { READER_SOURCES } from './reader-sources.js?v=20261022-09';

function sourceKey(value) {
  const url = new URL(canonicalUrl(value));
  if (url.hostname === 'lginnotek.com') url.hostname = 'www.lginnotek.com';
  if (url.hostname === 'www.investor.asml.com') url.hostname = 'investor.asml.com';
  url.searchParams.sort();
  return url.href;
}
const sources = new Map(Object.entries(READER_SOURCES).map(([url, data]) => [sourceKey(url), data]));
const readingHosts = new Set(['investor.asml.com', 'www.investor.asml.com', 'www.lginnotek.com', 'lginnotek.com']);

export function articleReader(value) {
  if (!value) return {kind: 'none'};
  const url = canonicalUrl(value);
  const source = sources.get(sourceKey(url));
  if (source) return {...source, sourceUrl: url};
  if (readingHosts.has(new URL(url).hostname)) return {kind: 'reading', sourceUrl: url, sections: null};
  return {kind: 'frame', url, sourceUrl: url};
}

export function renderArticleReading(container, article, plan) {
  const doc = container.ownerDocument;
  const node = (tag, text, className) => {
    const element = doc.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const header = doc.createElement('header');
  header.append(node('p', '공식 자료 읽기', 'reading-eyebrow'), node('h1', article.title));
  header.append(node('p', [article.company, article.date].filter(Boolean).join(' · '), 'reading-meta'));
  container.replaceChildren(header);
  if (!plan.sections) {
    container.append(node('p', '이 기사의 내부 읽기 자료는 아직 준비되지 않았어요. 학습 요약에서 핵심 내용과 공부할 포인트를 확인할 수 있어요.', 'reading-notice'));
    return;
  }
  container.append(node('p', '공식 원문의 주요 내용을 한국어로 정리한 읽기 자료입니다. 원문 전체나 원문 사이트 화면은 아닙니다.', 'reading-notice'));
  for (const [heading, text] of plan.sections) {
    const section = doc.createElement('section');
    section.append(node('h2', heading), node('p', text));
    container.append(section);
  }
  const source = doc.createElement('footer');
  source.className = 'reading-source';
  source.append(node('p', `출처 · ${new URL(plan.sourceUrl).hostname} · ${plan.checked} 원문 확인`));
  container.append(source);
}
