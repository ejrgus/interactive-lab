const treeView = document.querySelector('[data-view="tree"]');
const viewport = document.querySelector('#tree-viewport');
const canvas = document.querySelector('#tree-canvas');
const nodeLayer = document.querySelector('#node-layer');
const stageLayer = document.querySelector('#stage-layer');
const connectorLayer = document.querySelector('#connector-layer');
const search = document.querySelector('#tree-search');
const status = document.querySelector('#tree-status');
const memberSearchResults = document.querySelector('#member-search-results');
const inspector = document.querySelector('#node-inspector');
const inspectorScrim = document.querySelector('#inspector-scrim');
const infoToggle = document.querySelector('[data-info-toggle]');
const infoPanel = document.querySelector('#archive-info');
const researchDocument = document.querySelector('#research-document');
const researchSearch = document.querySelector('#research-search');
const researchResult = document.querySelector('#research-result');

let graph = null;
let nodeMap = new Map();
let sourceMap = new Map();
let selectedNodeId = null;
let researchMarkdown = '';
let activeDepartureCategory = '전체';

const normalize = (value = '') => value.toLocaleLowerCase('ko-KR').replace(/[\s·→()\-–—]/g, '');
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[char]);
const groupMembers = (group) => Array.isArray(group.members) ? group.members : String(group.members || '').split(/,\s*/).filter(Boolean);

function setView(name) {
  document.querySelectorAll('[data-view]').forEach((view) => view.classList.toggle('is-active', view.dataset.view === name));
  document.querySelectorAll('[data-view-button]').forEach((button) => {
    const active = button.dataset.viewButton === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  closeInspector();
  if (name === 'research' && !researchMarkdown) loadResearch();
}

function setSidebar(open) {
  treeView.classList.toggle('sidebar-collapsed', !open);
  document.querySelector('[data-sidebar-open]').setAttribute('aria-expanded', String(open));
}

function edgePath(from, to, edge) {
  const width = graph.meta.nodeWidth;
  const height = graph.meta.nodeHeight;
  const x1 = from.x + width;
  const y1 = from.y + height / 2;
  const x2 = to.x;
  const y2 = to.y + height / 2;
  const bend = Math.max(54, Math.min(260, Math.abs(x2 - x1) * .42));
  if (Number.isFinite(edge.routeY)) {
    return `M ${x1} ${y1} C ${x1 + bend * .45} ${y1}, ${x1 + bend * .45} ${edge.routeY}, ${x1 + bend} ${edge.routeY} L ${x2 - bend} ${edge.routeY} C ${x2 - bend * .45} ${edge.routeY}, ${x2 - bend * .45} ${y2}, ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function renderStages() {
  stageLayer.replaceChildren(...graph.stages.map((stage) => {
    const column = document.createElement('div');
    column.className = `stage-column ${stage.id === 'current' ? 'current' : ''}`;
    column.style.left = `${stage.x}px`;
    const label = document.createElement('span');
    label.textContent = stage.label;
    column.append(label);
    return column;
  }));
}

function setOptionalText(sectionId, targetId, value) {
  const section = document.querySelector(sectionId);
  section.hidden = !value;
  document.querySelector(targetId).textContent = value || '';
}

function closeInspector() {
  if (!inspector) return;
  inspector.classList.remove('is-open');
  inspector.setAttribute('aria-hidden', 'true');
  inspectorScrim.classList.remove('is-open');
  nodeLayer.querySelector(`[data-node-id="${selectedNodeId}"]`)?.classList.remove('is-selected');
  selectedNodeId = null;
}

function openInspector(node) {
  if (!node) return;
  if (selectedNodeId === node.id && inspector.classList.contains('is-open')) {
    closeInspector();
    return;
  }
  nodeLayer.querySelector('.tree-node.is-selected')?.classList.remove('is-selected');
  selectedNodeId = node.id;
  nodeLayer.querySelector(`[data-node-id="${node.id}"]`)?.classList.add('is-selected');
  document.querySelector('#inspector-meta').textContent = `${node.year} · ${node.kind}`;
  document.querySelector('#inspector-title').textContent = node.label;
  document.querySelector('#inspector-detail').textContent = node.detail || node.note;
  setOptionalText('#inspector-context-section', '#inspector-context', node.context);
  setOptionalText('#inspector-ownership-section', '#inspector-ownership', node.ownership);

  const confidence = String(node.confidence || '조사 중').split('·');
  document.querySelector('#inspector-confidence').replaceChildren(...confidence.map((grade) => {
    const badge = document.createElement('span');
    badge.className = `confidence-badge ${grade.includes('D') || node.unverified ? 'warn' : ''}`;
    badge.textContent = grade.length <= 2 ? `출처 ${grade}` : grade;
    return badge;
  }), ...(node.unverified ? [Object.assign(document.createElement('span'), { className:'confidence-badge warn', textContent:'추가 확인 필요' })] : []));

  const subsidiaries = node.subsidiaries || [];
  const subsidiarySection = document.querySelector('#inspector-subsidiaries-section');
  subsidiarySection.hidden = subsidiaries.length === 0;
  document.querySelector('#inspector-subsidiaries-title').textContent = node.subsidiariesTitle || '주요 계열사';
  document.querySelector('#inspector-subsidiaries').replaceChildren(...subsidiaries.map((item) => {
    const entry = document.createElement('div');
    entry.className = 'subsidiary-item';
    const name = document.createElement('strong');
    const description = document.createElement('span');
    name.textContent = typeof item === 'string' ? item : item.name;
    description.textContent = typeof item === 'string' ? '' : item.description || '';
    entry.append(name, description);
    return entry;
  }));

  const links = (node.sourceIds || []).map((id) => sourceMap.get(id)).filter(Boolean).map((source) => {
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = source.title;
    return link;
  });
  document.querySelector('.source-section').hidden = links.length === 0;
  document.querySelector('#inspector-sources').replaceChildren(...links);
  inspector.classList.add('is-open');
  inspector.setAttribute('aria-hidden', 'false');
  inspectorScrim.classList.add('is-open');
}

function renderNodes() {
  nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  nodeLayer.replaceChildren(...graph.nodes.map((node) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `tree-node ${node.current ? 'is-current' : ''} ${node.external ? 'is-external' : ''} ${node.unverified ? 'is-unverified' : ''}`;
    card.dataset.nodeId = node.id;
    card.dataset.category = node.category || 'core';
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.setAttribute('aria-label', `${node.year} ${node.label}. ${node.note}. 상세 정보 보기`);
    const top = document.createElement('span');
    top.className = 'node-top';
    const year = document.createElement('span');
    year.className = 'node-year';
    year.textContent = node.year;
    const kind = document.createElement('span');
    kind.className = 'node-kind';
    kind.textContent = node.kind;
    top.append(year, kind);
    const title = document.createElement('strong');
    title.className = 'node-title';
    title.textContent = node.label;
    const note = document.createElement('span');
    note.className = 'node-note';
    note.textContent = node.note;
    card.append(top, title, note);
    card.addEventListener('click', () => openInspector(node));
    return card;
  }));
}

function renderEdges() {
  connectorLayer.setAttribute('viewBox', `0 0 ${graph.meta.canvasWidth} ${graph.meta.canvasHeight}`);
  connectorLayer.replaceChildren(...graph.edges.map((edge) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(nodeMap.get(edge.from), nodeMap.get(edge.to), edge));
    path.setAttribute('class', `tree-edge type-${edge.type}`);
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;
    return path;
  }));
}

function ancestorsOf(ids) {
  const included = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    graph.edges.forEach((edge) => {
      if (included.has(edge.to) && !included.has(edge.from)) {
        included.add(edge.from);
        changed = true;
      }
    });
  }
  return included;
}

function currentNodeForGroup(group) {
  const groupName = normalize(group.name);
  return graph.nodes.find((node) => {
    if (!node.current) return false;
    const nodeNames = normalize([node.label, ...(node.aliases || [])].join(' '));
    return nodeNames.includes(groupName) || groupName.includes(normalize(node.label));
  });
}

function revealGroupMember(groupName, memberName) {
  setView('groups');
  document.querySelectorAll('.group-card.is-search-target').forEach((card) => card.classList.remove('is-search-target'));
  document.querySelectorAll('.group-member-list li.is-search-target').forEach((item) => item.classList.remove('is-search-target'));
  const card = [...document.querySelectorAll('.group-card')].find((item) => normalize(item.dataset.groupName) === normalize(groupName));
  if (!card) return;
  const member = [...card.querySelectorAll('[data-member-name]')].find((item) => normalize(item.dataset.memberName) === normalize(memberName));
  card.classList.add('is-search-target');
  member?.classList.add('is-search-target');
  card.scrollIntoView({ behavior:'smooth', block:'center' });
}

function renderMemberSearchResults(matches) {
  memberSearchResults.replaceChildren(...matches.slice(0, 12).map(({ group, member }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'member-search-result';
    button.innerHTML = `<strong>${escapeHtml(member)}</strong><span>${escapeHtml(group.name)} · 현재 그룹에서 보기</span>`;
    button.addEventListener('click', () => revealGroupMember(group.name, member));
    return button;
  }));
}

function applyFilters() {
  const enabled = new Set([...document.querySelectorAll('.filter-list input:checked')].map((input) => input.value));
  nodeLayer.querySelectorAll('.tree-node').forEach((card) => card.classList.toggle('is-hidden', !enabled.has(card.dataset.category)));
  connectorLayer.querySelectorAll('.tree-edge').forEach((path) => {
    const from = nodeLayer.querySelector(`[data-node-id="${path.dataset.from}"]`);
    const to = nodeLayer.querySelector(`[data-node-id="${path.dataset.to}"]`);
    path.style.display = from?.classList.contains('is-hidden') || to?.classList.contains('is-hidden') ? 'none' : '';
  });
  updateSearch();
}

function updateSearch() {
  if (!graph) return;
  const raw = search.value.trim();
  const query = normalize(raw);
  const cards = [...nodeLayer.querySelectorAll('.tree-node:not(.is-hidden)')];
  const paths = [...connectorLayer.querySelectorAll('.tree-edge')].filter((path) => path.style.display !== 'none');
  cards.forEach((card) => card.classList.remove('is-dimmed', 'is-highlighted', 'is-match'));
  paths.forEach((path) => path.classList.remove('is-dimmed', 'is-highlighted'));
  memberSearchResults.replaceChildren();
  if (!query) {
    status.textContent = '기업을 검색하면 이어지는 경로를 강조합니다.';
    return;
  }
  const visibleIds = new Set(cards.map((card) => card.dataset.nodeId));
  const allMatches = graph.nodes.filter((node) => visibleIds.has(node.id) && normalize([node.label, ...(node.aliases || [])].join(' ')).includes(query));
  const exactCurrent = allMatches.filter((node) => node.current && normalize([node.label, ...(node.aliases || [])].join(' ')).includes(query));
  const directMatches = exactCurrent.length ? exactCurrent : allMatches;
  const memberMatches = graph.groups.flatMap((group) => groupMembers(group)
    .filter((member) => normalize(member).includes(query))
    .map((member) => ({ group, member })));
  renderMemberSearchResults(memberMatches);
  const parentMatches = [...new Map(memberMatches.map(({ group }) => {
    const node = currentNodeForGroup(group);
    return node ? [node.id, node] : null;
  }).filter(Boolean)).values()].filter((node) => visibleIds.has(node.id));
  const matches = directMatches.length ? directMatches : parentMatches;
  if (!matches.length && !memberMatches.length) {
    cards.forEach((card) => card.classList.add('is-dimmed'));
    paths.forEach((path) => path.classList.add('is-dimmed'));
    status.textContent = `“${raw}” 검색 결과가 없습니다.`;
    return;
  }
  if (!matches.length) {
    status.textContent = `계열사 검색 결과 ${memberMatches.length}개입니다. 결과를 눌러 현재 그룹에서 확인하세요.`;
    return;
  }
  const matchIds = new Set(matches.map((node) => node.id));
  const pathIds = ancestorsOf(matchIds);
  cards.forEach((card) => {
    const active = pathIds.has(card.dataset.nodeId);
    card.classList.toggle('is-highlighted', active);
    card.classList.toggle('is-match', matchIds.has(card.dataset.nodeId));
    card.classList.toggle('is-dimmed', !active);
  });
  paths.forEach((path) => {
    const active = pathIds.has(path.dataset.from) && pathIds.has(path.dataset.to);
    path.classList.toggle('is-highlighted', active);
    path.classList.toggle('is-dimmed', !active);
  });
  const target = matches[0];
  if (memberMatches.length && !directMatches.length) {
    status.textContent = `${memberMatches[0].member} · ${memberMatches[0].group.name} 경로를 강조했습니다.`;
  } else {
    status.textContent = `${matches.map((node) => node.label).join(', ')} 경로를 강조했습니다.${memberMatches.length ? ` 계열사 결과 ${memberMatches.length}개.` : ''}`;
  }
  viewport.scrollTo({ left: Math.max(0, target.x - viewport.clientWidth * .64), top: Math.max(0, target.y - viewport.clientHeight * .42), behavior: 'smooth' });
}

function renderTimeline() {
  document.querySelector('#timeline-list').replaceChildren(...graph.timeline.map((era) => {
    const section = document.createElement('section');
    section.className = 'timeline-era';
    const heading = document.createElement('div');
    heading.innerHTML = `<h3>${escapeHtml(era.era)}</h3><span>${escapeHtml(era.range)}</span>`;
    const events = document.createElement('div');
    events.className = 'timeline-events';
    events.replaceChildren(...era.events.map((event) => {
      const article = document.createElement('article');
      article.className = 'timeline-event';
      article.innerHTML = `<time>${escapeHtml(event.date)}</time><p>${escapeHtml(event.text)}<span class="grade grade-${escapeHtml(event.grade.slice(-1))}">${escapeHtml(event.grade)}</span></p>`;
      return article;
    }));
    section.append(heading, events);
    return section;
  }));
}

function renderGroups() {
  document.querySelector('#group-grid').replaceChildren(...graph.groups.map((group) => {
    const card = document.createElement('article');
    card.className = 'group-card';
    card.dataset.groupName = group.name;
    const members = groupMembers(group);
    card.innerHTML = `<div class="group-card-main"><div class="group-card-top"><h3>${escapeHtml(group.name)}</h3><span class="group-status">${escapeHtml(group.status)}</span></div><div class="group-meta"><span>${escapeHtml(group.rank)}</span><span>${escapeHtml(group.assets)}</span><span>${escapeHtml(group.affiliates)}</span><span>${escapeHtml(group.controller)}</span></div><p>${escapeHtml(group.summary)}</p></div><section class="group-directory" aria-label="${escapeHtml(group.name)} 계열사 목록"><div class="group-directory-head"><strong>현재 계열사·관련 회사</strong><span>${escapeHtml(group.memberScope || `${members.length}개사`)}</span></div><ul class="group-member-list">${members.map((member) => `<li data-member-name="${escapeHtml(member)}">${escapeHtml(member)}</li>`).join('')}</ul></section>`;
    const target = graph.nodes.find((node) => node.current && normalize([node.label, ...(node.aliases || [])].join(' ')).includes(normalize(group.name)));
    if (target) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '계보에서 보기 →';
      button.addEventListener('click', () => {
        setView('tree');
        search.value = target.label;
        updateSearch();
        openInspector(target);
      });
      card.querySelector('.group-card-main').append(button);
    }
    return card;
  }));
}

function renderDepartureControls() {
  const categories = ['전체', ...new Set(graph.departures.map((item) => item.category))];
  document.querySelector('#departure-controls').replaceChildren(...categories.map((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category;
    button.classList.toggle('is-active', category === activeDepartureCategory);
    button.addEventListener('click', () => {
      activeDepartureCategory = category;
      renderDepartureControls();
      renderDepartures();
    });
    return button;
  }));
}

function renderDepartures() {
  const rows = activeDepartureCategory === '전체' ? graph.departures : graph.departures.filter((item) => item.category === activeDepartureCategory);
  document.querySelector('#departure-list').replaceChildren(...rows.map((item) => {
    const card = document.createElement('article');
    card.className = 'departure-card';
    card.innerHTML = `<header><h3>${escapeHtml(item.former)}</h3><span class="grade grade-${escapeHtml(item.grade.slice(-1))}">${escapeHtml(item.grade)}</span></header><p class="now">현재: ${escapeHtml(item.now)}</p><p>${escapeHtml(item.path)}</p><small>이유 · ${escapeHtml(item.reason)}</small>`;
    return card;
  }));
}

function inlineMarkdown(text) {
  let output = escapeHtml(text);
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    if (!/^(https?:\/\/|#|\.\.?\/)/.test(url)) return match;
    const external = /^https?:\/\//.test(url) ? ' target="_blank" rel="noreferrer"' : '';
    return `<a href="${url}"${external}>${label}</a>`;
  });
  output = output.replace(/(?<!["'=])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  return output;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const html = [];
  let listType = null;
  const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || /^<!--/.test(trimmed)) { closeList(); continue; }
    if (/^\|/.test(trimmed) && /^\|?[\s:|-]+\|?$/.test((lines[index + 1] || '').trim())) {
      closeList();
      const rows = [];
      const splitRow = (row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      rows.push(splitRow(trimmed));
      index += 2;
      while (index < lines.length && /^\|/.test(lines[index].trim())) { rows.push(splitRow(lines[index].trim())); index += 1; }
      index -= 1;
      html.push('<table><thead><tr>', ...rows[0].map((cell) => `<th>${inlineMarkdown(cell)}</th>`), '</tr></thead><tbody>');
      rows.slice(1).forEach((row) => html.push('<tr>', ...row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`), '</tr>'));
      html.push('</tbody></table>');
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    if (/^---+$/.test(trimmed)) { closeList(); html.push('<hr>'); continue; }
    if (/^>\s?/.test(trimmed)) { closeList(); html.push(`<blockquote>${inlineMarkdown(trimmed.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const wanted = ordered ? 'ol' : 'ul';
      if (listType !== wanted) { closeList(); listType = wanted; html.push(`<${wanted}>`); }
      html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  closeList();
  return html.join('');
}

function highlightResearch(query) {
  researchDocument.querySelectorAll('mark').forEach((mark) => mark.replaceWith(document.createTextNode(mark.textContent)));
  const raw = query.trim();
  if (!raw) { researchResult.textContent = '원문 1,000여 줄 전체를 표시하고 있습니다.'; return; }
  const walker = document.createTreeWalker(researchDocument, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let count = 0;
  let first = null;
  nodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    const lower = text.toLocaleLowerCase('ko-KR');
    const needle = raw.toLocaleLowerCase('ko-KR');
    if (!lower.includes(needle)) return;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let found = lower.indexOf(needle);
    while (found >= 0) {
      fragment.append(document.createTextNode(text.slice(cursor, found)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(found, found + raw.length);
      fragment.append(mark);
      if (!first) first = mark;
      count += 1;
      cursor = found + raw.length;
      found = lower.indexOf(needle, cursor);
    }
    fragment.append(document.createTextNode(text.slice(cursor)));
    textNode.replaceWith(fragment);
  });
  researchResult.textContent = count ? `${count}곳을 찾았습니다.` : '검색 결과가 없습니다.';
  first?.scrollIntoView({ behavior:'smooth', block:'center' });
}

async function loadResearch() {
  researchDocument.innerHTML = '<p class="research-loading">전체 조사 원문을 불러오는 중입니다…</p>';
  try {
    const response = await fetch('../research/hyundai-family-complete.md?v=20260920-7');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    researchMarkdown = await response.text();
    researchDocument.innerHTML = renderMarkdown(researchMarkdown);
    researchDocument.setAttribute('aria-busy', 'false');
    researchResult.textContent = '원문 1,000여 줄 전체를 표시하고 있습니다.';
  } catch (error) {
    researchDocument.innerHTML = `<p>조사 원문을 불러오지 못했습니다. <a href="../research/hyundai-family-complete.md">원본 Markdown 파일 열기</a></p>`;
    researchDocument.setAttribute('aria-busy', 'false');
    console.error(error);
  }
}

async function loadGraph() {
  try {
    const response = await fetch('../data/hyundai-family.json?v=20260920-7');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    graph = await response.json();
    sourceMap = new Map(graph.sources.map((source) => [source.id, source]));
    canvas.style.width = `${graph.meta.canvasWidth}px`;
    canvas.style.height = `${graph.meta.canvasHeight}px`;
    document.documentElement.style.setProperty('--node-width', `${graph.meta.nodeWidth}px`);
    document.documentElement.style.setProperty('--node-height', `${graph.meta.nodeHeight}px`);
    document.querySelector('[data-stat="groups"]').textContent = graph.groups.length;
    document.querySelector('[data-stat="nodes"]').textContent = graph.nodes.length;
    document.querySelector('[data-stat="sources"]').textContent = graph.meta.sourceCount;
    renderStages();
    renderNodes();
    renderEdges();
    renderTimeline();
    renderGroups();
    renderDepartureControls();
    renderDepartures();
    canvas.setAttribute('aria-busy', 'false');
    viewport.scrollTo({ left: 0, top: 690 });
  } catch (error) {
    canvas.setAttribute('aria-busy', 'false');
    status.textContent = '계보 데이터를 불러오지 못했습니다.';
    console.error(error);
  }
}

document.querySelectorAll('[data-view-button]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewButton)));
document.querySelector('[data-sidebar-close]').addEventListener('click', () => setSidebar(false));
document.querySelector('[data-sidebar-open]').addEventListener('click', () => setSidebar(true));
document.querySelector('[data-reset-view]').addEventListener('click', () => viewport.scrollTo({ left:0, top:690, behavior:'smooth' }));
document.querySelector('[data-inspector-close]').addEventListener('click', closeInspector);
inspectorScrim.addEventListener('click', closeInspector);
document.querySelectorAll('.filter-list input').forEach((input) => input.addEventListener('change', applyFilters));
infoToggle.addEventListener('click', () => {
  const willOpen = infoPanel.hidden;
  infoPanel.hidden = !willOpen;
  infoToggle.setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('click', (event) => {
  if (!infoPanel.hidden && !infoPanel.contains(event.target) && !infoToggle.contains(event.target)) {
    infoPanel.hidden = true;
    infoToggle.setAttribute('aria-expanded', 'false');
  }
});
search.addEventListener('input', updateSearch);
search.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') memberSearchResults.querySelector('button')?.click();
});
researchSearch.addEventListener('input', () => highlightResearch(researchSearch.value));
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.querySelector('[data-view="tree"]').classList.contains('is-active') && document.activeElement !== search) { event.preventDefault(); search.focus(); }
  if (event.key === 'Escape') {
    if (!infoPanel.hidden) { infoPanel.hidden = true; infoToggle.setAttribute('aria-expanded', 'false'); }
    else if (inspector.classList.contains('is-open')) closeInspector();
    else if (document.activeElement === search || search.value) { search.value = ''; updateSearch(); search.blur(); }
  }
});
viewport.addEventListener('wheel', (event) => {
  if (event.shiftKey && event.deltaY !== 0) {
    viewport.scrollLeft += event.deltaY;
    event.preventDefault();
  }
}, { passive:false });

loadGraph();
