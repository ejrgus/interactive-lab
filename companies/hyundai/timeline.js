const timeline = document.querySelector("#timeline");
const detailPanel = document.querySelector("#detail-panel");
const detailToggle = document.querySelector(".detail-toggle");
const detailContent = document.querySelector("#detail-content");

const setExpanded = (expanded) => {
  detailToggle?.setAttribute("aria-expanded", String(expanded));
  if (detailContent) detailContent.hidden = !expanded;
};
detailToggle?.addEventListener("click", () => setExpanded(detailToggle.getAttribute("aria-expanded") !== "true"));

const emptyState = () => {
  timeline.innerHTML = `<article class="empty-card"><small>현재 단계</small><h3>자료 조사 중</h3><p>사건의 연도, 배경, 관계와 출처를 확인한 뒤 이곳에 순서대로 추가합니다.</p></article><article class="empty-card"><small>표시 원칙</small><h3>출처가 있는 사실만</h3><p>의견이 갈리는 내용은 하나로 단정하지 않고 신뢰도와 함께 구분합니다.</p></article>`;
};

const renderEvent = (event) => {
  const card = document.createElement("button");
  card.className = "event-card"; card.type = "button"; card.dataset.type = event.type || "event";
  card.innerHTML = `<time datetime="${event.date || event.year || ""}">${event.year || event.date || "연도 확인 중"}</time><h3>${event.title}</h3><p>${event.description || "상세 설명을 확인하고 있습니다."}</p>`;
  card.addEventListener("click", () => {
    detailToggle.querySelector("strong").textContent = event.title;
    detailContent.innerHTML = `<p>${event.reason || event.description || "배경 자료를 확인하고 있습니다."}</p><div class="detail-tags"><span>${event.confidence || "researching"}</span><span>출처 ${event.sourceIds?.length || 0}개</span></div>`;
    setExpanded(true);
    detailPanel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  });
  return card;
};

try {
  const response = await fetch("../../data/hyundai-family.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  timeline.replaceChildren();
  if (!Array.isArray(data.events) || data.events.length === 0) emptyState(); else data.events.forEach((event) => timeline.append(renderEvent(event)));
} catch (error) {
  console.error("범현대가 데이터를 불러오지 못했습니다.", error);
  timeline.innerHTML = '<article class="empty-card"><small>연결 오류</small><h3>데이터를 불러올 수 없습니다</h3><p>잠시 후 다시 시도해 주세요.</p></article>';
}

