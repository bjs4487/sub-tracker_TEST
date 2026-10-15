/*
  이 파일은 화면 렌더링 전용 코드를 담당합니다.
  'SubTrackerUI'라는 객체를 만들고,
  데이터를 받아서 실제 DOM 요소에 HTML 문자열을 넣는 역할을 합니다.

  핵심 개념:
  - DOM: 브라우저 화면에 그려지는 요소들을 의미합니다.
  - render: 화면을 다시 그린다는 뜻입니다.
  - innerHTML: HTML 문자열을 실제 화면에 넣는 속성입니다.
*/
const SubTrackerUI = (() => {
  // DOM 요소를 저장할 객체.
  // 여기서 id 값들을 한 번 꺼내두면 반복적으로 document.getElementById를 호출하지 않아도 됩니다.
  const els = {};

  /*
    화면에 필요한 요소들을 미리 찾아서 els 객체에 저장합니다.
    이 함수는 앱이 시작될 때와 새로 렌더링할 때마다 호출됩니다.
  */
  function cacheDom() {
    els.monthlyTotal = document.getElementById('monthly-total');
    els.yearlyTotal = document.getElementById('yearly-total');
    els.upcomingTotal = document.getElementById('upcoming-total');
    els.categoryBreakdown = document.getElementById('category-breakdown');
    els.subscriptionList = document.getElementById('subscription-list');
  }

  /*
    숫자를 한국화된 화폐 형식으로 바꿉니다.
    예: 13500 -> ₩13,500
  */
  function formatCurrency(value) {
    const safeValue = Number(value) || 0;
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(safeValue);
  }

  /*
    '2026-10-18' 같은 날짜 문자열을 보기 좋은 한국식 날짜로 변환합니다.
    dateString + 'T00:00:00'을 붙이는 이유는 브라우저가 시간대 문제 없이 날짜를 읽도록 하기 위해서입니다.
  */
  function formatDate(dateString) {
    if (!dateString) return '미정';
    const date = new Date(dateString + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  }

  /*
    결제일까지 남은 일수에 따라 D-Day 문구를 만들어 줍니다.
    예:
    - 0일: D-Day
    - 3일: D-3
    - 1일 지남: D+1
  */
  function getDdayText(nextPaymentDate) {
    const daysLeft = getDaysUntilNextPayment(new Date(), nextPaymentDate);
    if (daysLeft === 0) return 'D-Day';
    if (daysLeft < 0) return `D+${Math.abs(daysLeft)}`;
    return `D-${daysLeft}`;
  }

  /*
    D-day 배지 색상을 결정합니다.
    결제일이 가까울수록 빨간색, 7일 이내면 주황색, 그 외는 기본색을 사용합니다.
  */
  function getBadgeClass(nextPaymentDate) {
    const daysLeft = getDaysUntilNextPayment(new Date(), nextPaymentDate);
    if (daysLeft <= 3) return 'urgent';
    if (daysLeft <= 7) return 'warning';
    return '';
  }

  /*
    사용자 입력값을 HTML에 그대로 넣을 때 문제가 생길 수 있습니다.
    예: <script> 같은 문자열이 HTML로 해석되면 보안/오류 문제가 생길 수 있습니다.
    그래서 특수 문자를 안전한 형태로 변환합니다.
  */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /*
    상단 요약 영역을 그리는 함수입니다.
    월 합계, 연간 합계, 이번 주 결제 예정 금액을 계산해서
    각각의 strong 요소에 넣어줍니다.
  */
  function renderSummary(subscriptions) {
    cacheDom();
    const monthlyTotal = getTotalMonthlyAmount(subscriptions);
    const yearlyTotal = getTotalYearlyAmount(subscriptions);
    const upcoming = getUpcomingPayments(subscriptions, 7);
    const upcomingTotal = upcoming.reduce((sum, sub) => sum + getMonthlyAmount(sub), 0);

    els.monthlyTotal.textContent = formatCurrency(monthlyTotal);
    els.yearlyTotal.textContent = formatCurrency(yearlyTotal);
    els.upcomingTotal.textContent = `${upcoming.length}건 · ${formatCurrency(upcomingTotal)}`;
  }

  /*
    카테고리별 비중을 막대 그래프로 표시합니다.
    예: 영상 40%, 음악 30% 이런 식으로 보입니다.
  */
  function renderCategoryBreakdown(subscriptions) {
    cacheDom();
    const categories = getMonthlyAmountByCategory(subscriptions);
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    if (!entries.length || total === 0) {
      els.categoryBreakdown.innerHTML = '<div class="empty-state">아직 카테고리 데이터가 없습니다.</div>';
      return;
    }

    const rows = entries.map(([label, value]) => {
      const percent = (value / total) * 100;
      return `
        <div class="category-row">
          <div class="category-meta">
            <span>${escapeHtml(label)}</span>
            <strong>${formatCurrency(value)}</strong>
          </div>
          <div class="bar">
            <div class="bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>
      `;
    });

    els.categoryBreakdown.innerHTML = rows.join('');
  }

  /*
    구독 목록을 카드 형태로 그리는 함수입니다.
    각 구독 하나를 article 태그로 만들어서 리스트 형태로 보여줍니다.
  */
  function renderList(subscriptions) {
    cacheDom();

    if (!subscriptions.length) {
      els.subscriptionList.innerHTML = '<div class="empty-state">아직 등록된 구독이 없습니다.</div>';
      return;
    }

    const cards = subscriptions
      .map((subscription) => {
        const monthlyAmount = getMonthlyAmount(subscription);
        const daysLeft = getDaysUntilNextPayment(new Date(), subscription.nextPaymentDate);
        const dday = getDdayText(subscription.nextPaymentDate);
        const badgeClass = getBadgeClass(subscription.nextPaymentDate);
        const cycleLabel = subscription.cycle === 'yearly' ? '연간 결제' : '월간 결제';

        return `
          <article class="subscription-card">
            <div class="card-header">
              <div>
                <div class="sub-name">${escapeHtml(subscription.name)}</div>
                <div class="sub-meta">${escapeHtml(subscription.category)} · ${cycleLabel}</div>
              </div>
              <span class="badge ${badgeClass}">${dday}</span>
            </div>

            <div class="card-body">
              <div class="amount">${formatCurrency(monthlyAmount)}</div>
              <div class="date-text">결제 예정: ${formatDate(subscription.nextPaymentDate)} (${daysLeft <= 0 ? '기한 도래' : `${daysLeft}일 남음`})</div>
            </div>

            <div class="card-actions">
              <button type="button" class="btn btn-secondary" data-action="edit" data-id="${subscription.id}">수정</button>
              <button type="button" class="btn btn-danger" data-action="delete" data-id="${subscription.id}">삭제</button>
            </div>
          </article>
        `;
      })
      .join('');

    els.subscriptionList.innerHTML = cards;
  }

  return {
    cacheDom,
    renderSummary,
    renderCategoryBreakdown,
    renderList,
    formatCurrency,
    formatDate,
  };
})();

// 전역에서 접근할 수 있도록 객체를 window에 연결합니다.
// 이렇게 해두면 다른 스크립트(main.js)에서 SubTrackerUI를 바로 사용할 수 있습니다.
window.SubTrackerUI = SubTrackerUI;
