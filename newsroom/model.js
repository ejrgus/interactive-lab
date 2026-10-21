export function canonicalUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('http 또는 https 기사 주소를 입력하세요.');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return url.href.replace(/\/$/, '');
}

export const DEFAULT_COMPANY = 'hyundai-motor-group';
export const EXTERNAL_CATEGORY = '외부링크';
export const NOTE_LABELS = { memo:'메모1', qa:'메모2', takeaway:'메모3' };
export const topicId = (companyId, category) => companyId === DEFAULT_COMPANY ? `topic:${category}` : `company:${companyId}:topic:${category}`;
export function topicCompany(id) {
  return id.startsWith('company:') ? id.split(':')[1] : DEFAULT_COMPANY;
}
export function articleFields(articles) {
  return [...new Set(articles.filter(a=>a.is_official !== false).flatMap(a=>[a.category,...a.topics]))].filter(c=>c!==EXTERNAL_CATEGORY);
}
export function inCategory(article, category) {
  if (article.is_official === false) return category === EXTERNAL_CATEGORY;
  return category !== EXTERNAL_CATEGORY && (article.category === category || article.topics.includes(category));
}

export function parseBackup(input) {
  if (!input || typeof input !== 'object' || !input.records || Array.isArray(input.records) || typeof input.records !== 'object') throw new Error('records 항목이 있는 공부 기록 JSON을 선택하세요.');
  const entries = Object.entries(input.records);
  if (!entries.length || entries.length > 2000) throw new Error('한 번에 1~2,000건의 메모를 가져올 수 있어요.');
  const records = {};
  for (const [id, value] of entries) {
    if (!id || id.length > 200 || !value || typeof value !== 'object') throw new Error('메모 형식을 확인해주세요.');
    const row = {};
    for (const key of ['memo', 'qa', 'takeaway', 'origin']) {
      if (value[key] != null && typeof value[key] !== 'string') throw new Error('메모는 텍스트여야 합니다.');
      row[key] = value[key] || '';
      if (row[key].length > (key === 'origin' ? 500 : 200000)) throw new Error('너무 긴 메모가 있습니다.');
    }
    const timestamp = value.updated ?? value.updated_at;
    row.updated = timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : '';
    row.favorite = value.favorite === true; row.read = value.read === true;
    row.userEdited = value.userEdited === true || value.user_edited === true;
    Object.defineProperty(records, id, { value: row, enumerable: true });
  }
  const customArticles = input.customArticles ?? [];
  if (!Array.isArray(customArticles) || customArticles.length > 500) throw new Error('추가 기사 형식을 확인해주세요.');
  const articles = customArticles.map(a => {
    if (!a || typeof a.id !== 'string' || !a.id || a.id.length > 200 || typeof a.title !== 'string' || !a.title.trim() || a.title.length > 500) throw new Error('추가 기사 제목을 확인해주세요.');
    const url = canonicalUrl(a.url);
    if (url.length > 2000) throw new Error('기사 주소가 너무 깁니다.');
    const text = (key, max, fallback = '') => {
      const v = a[key] ?? fallback;
      if (typeof v !== 'string' || v.length > max) throw new Error('추가 기사 형식을 확인해주세요.');
      return v;
    };
    const date = a.date || null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('게시일은 YYYY-MM-DD 형식이어야 합니다.');
    const official = a.is_official === true;
    const companyId = text('company_id',100);
    return { id: a.id, url, title: a.title.trim(), company: text('company',100), ...(companyId ? {company_id:companyId} : {}), is_official:official, category: official ? text('category',100,'기타') || '기타' : EXTERNAL_CATEGORY, date, summary:text('summary',5000), study:text('study',5000) };
  });
  return { records, customArticles:articles };
}

export function recordForExport(note) {
  return { memo:note.memo, qa:note.qa, takeaway:note.takeaway, origin:note.origin, favorite:note.favorite, read:note.read, userEdited:note.user_edited, updated:note.updated_at };
}
