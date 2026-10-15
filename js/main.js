/*
  이 파일은 앱의 핵심 로직을 관리합니다.
  즉, 구독 데이터를 읽고 저장하고,
  사용자가 입력한 값을 처리해서 화면을 갱신하는 역할을 합니다.

  전체 구조는 즉시 실행 함수(IIFE)로 감싸져 있습니다.
  이유는 전역 변수 오염을 막고, 스크립트 로딩 시점에 필요한 초기화만 수행하게 하기 위해서입니다.
*/
(function () {
  // localStorage에 데이터를 저장할 때 사용할 고유 키.
  // 같은 앱을 다시 열어도 데이터를 유지할 수 있습니다.
  const STORAGE_KEY = 'sub-tracker-data-v1';

  // HTML 폼과 버튼 요소를 가져옵니다.
  // 이 요소들을 변수로 저장해 두면 이후에 자주 사용하게 됩니다.
  const form = document.getElementById('subscription-form');
  const submitButton = document.getElementById('submit-btn');
  const cancelButton = document.getElementById('cancel-edit');
  const formTitle = document.getElementById('form-title');

  // 현재 구독 목록을 저장하는 변수.
  // 화면이 업데이트되면 이 배열을 기준으로 render()를 다시 실행합니다.
  let subscriptions = loadSubscriptions();

  // 수정 모드일 때 현재 편집 중인 구독의 id를 저장합니다.
  // null이면 '새 항목 추가' 모드입니다.
  let editingId = null;

  /*
    고유 ID를 생성하는 함수.
    Date.now()와 랜덤값을 조합해 거의 unique한 값을 만듭니다.
    예: sub_1728981234567_ab12cd
  */
  function makeId() {
    return 'sub_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8);
  }

  /*
    날짜에 특정 일수를 더해 새 날짜를 반환합니다.
    예: 오늘 + 4일 => 결제 예정일 계산에 활용합니다.
  */
  function addDays(date, amount) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + amount);
    return nextDate;
  }

  /*
    Date 객체를 input[type="date"]에서 사용할 수 있는 문자열 형식 YYYY-MM-DD로 변환합니다.
    예: 2026-10-15
  */
  function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /*
    앱 첫 실행 시 기본 샘플 데이터를 만들어 줍니다.
    사용자가 아직 구독을 추가하지 않은 상태에서도 화면이 의미 있게 보이도록 데모 데이터를 넣습니다.
  */
  function getDefaultSubscriptions() {
    const today = new Date();
    return [
      { id: 'demo_1', name: '넷플릭스', amount: 13500, cycle: 'monthly', nextPaymentDate: formatDateInput(addDays(today, 4)), category: '영상', paymentMethod: '신한카드' },
      { id: 'demo_2', name: '스포티파이', amount: 10900, cycle: 'monthly', nextPaymentDate: formatDateInput(addDays(today, 10)), category: '음악', paymentMethod: '삼성카드' },
      { id: 'demo_3', name: '클라우드', amount: 120000, cycle: 'yearly', nextPaymentDate: formatDateInput(addDays(today, 15)), category: '생산성', paymentMethod: '카카오뱅크' },
    ];
  }

  /*
    localStorage에서 구독 데이터를 읽어옵니다.
    - 값이 없으면 기본 샘플 데이터를 저장하고 반환합니다.
    - 데이터가 손상되었거나 잘못된 형식이면 예외를 처리합니다.
  */
  function loadSubscriptions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const defaults = getDefaultSubscriptions();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
        return defaults;
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : getDefaultSubscriptions();
    } catch (error) {
      console.warn('로컬 저장소를 읽는 중 문제가 발생했습니다.', error);
      return getDefaultSubscriptions();
    }
  }

  /*
    현재 구독 배열을 localStorage에 JSON 문자열로 저장합니다.
    이렇게 해야 페이지를 새로 고침해도 추가/삭제된 데이터가 유지됩니다.
  */
  function saveSubscriptions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
  }

  /*
    화면을 다시 그리는 핵심 함수입니다.
    UI 모듈의 세 가지 render 함수를 순서대로 호출합니다.
    - 요약 카드 갱신
    - 카테고리 비중 갱신
    - 구독 목록 갱신
  */
  function render() {
    SubTrackerUI.renderSummary(subscriptions);
    SubTrackerUI.renderCategoryBreakdown(subscriptions);
    SubTrackerUI.renderList(subscriptions);
  }

  /*
    폼을 초기 상태로 되돌립니다.
    새 구독 추가 모드로 전환하고,
    취소 버튼을 숨기며, 버튼 문구를 원래대로 바꿉니다.
  */
  function resetForm() {
    form.reset();
    editingId = null;
    formTitle.textContent = '새 구독 추가';
    submitButton.textContent = '추가하기';
    cancelButton.classList.add('hidden');
  }

  /*
    수정 버튼을 누르면 기존 구독 정보를 폼에 채워 넣는 함수입니다.
    사용자가 값을 수정하고 다시 제출하면 해당 데이터만 덮어씁니다.
  */
  function fillForm(subscription) {
    form.elements.name.value = subscription.name;
    form.elements.amount.value = subscription.amount;
    form.elements.cycle.value = subscription.cycle;
    form.elements.nextPaymentDate.value = subscription.nextPaymentDate;
    form.elements.category.value = subscription.category;
    form.elements.paymentMethod.value = subscription.paymentMethod;

    formTitle.textContent = '구독 수정';
    submitButton.textContent = '수정 완료';
    cancelButton.classList.remove('hidden');
  }

  /*
    폼 제출 이벤트를 처리합니다.
    새 구독 추가 또는 기존 구독 수정 둘 다 이 함수에서 처리합니다.
  */
  function handleSubmit(event) {
    event.preventDefault();

    // FormData를 사용하면 form의 값들을 쉽게 꺼낼 수 있습니다.
    const formData = new FormData(form);

    // 새 객체를 생성합니다.
    // 수정 모드이면 기존 id를 유지하고, 추가 모드이면 새로운 id를 생성합니다.
    const nextSubscription = {
      id: editingId || makeId(),
      name: String(formData.get('name') || '').trim(),
      amount: Number(formData.get('amount')) || 0,
      cycle: String(formData.get('cycle') || 'monthly'),
      nextPaymentDate: String(formData.get('nextPaymentDate') || '').trim(),
      category: String(formData.get('category') || '').trim(),
      paymentMethod: String(formData.get('paymentMethod') || '').trim(),
    };

    // 필수 값이 비었는지 확인합니다.
    // amount가 0 이하이면 유효하지 않은 값으로 간주합니다.
    if (!nextSubscription.name || !nextSubscription.nextPaymentDate || !nextSubscription.category || !nextSubscription.paymentMethod || nextSubscription.amount <= 0) {
      alert('필수 값을 올바르게 입력해 주세요.');
      return;
    }

    // 수정 모드인지 추가 모드인지에 따라 배열을 다르게 처리합니다.
    if (editingId) {
      subscriptions = subscriptions.map((sub) => (sub.id === editingId ? nextSubscription : sub));
    } else {
      subscriptions = [nextSubscription, ...subscriptions];
    }

    // 저장 후 다시 렌더링합니다.
    saveSubscriptions();
    render();
    resetForm();
  }

  /*
    목록 카드의 수정/삭제 버튼 클릭을 처리합니다.
    event.target.closest('button[data-action]')는 클릭된 요소가 어떤 버튼인지 알아내는 방법입니다.
  */
  function handleListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const { action, id } = button.dataset;
    const targetSubscription = subscriptions.find((sub) => sub.id === id);
    if (!targetSubscription) return;

    if (action === 'edit') {
      editingId = id;
      fillForm(targetSubscription);
    }

    if (action === 'delete') {
      const isConfirmed = window.confirm(`'${targetSubscription.name}' 구독을 삭제할까요?`);
      if (!isConfirmed) return;

      subscriptions = subscriptions.filter((sub) => sub.id !== id);
      if (editingId === id) {
        resetForm();
      }
      saveSubscriptions();
      render();
    }
  }

  // 이벤트 리스너 등록.
  // 폼 제출: 사용자 입력을 받아 처리
  // 취소 버튼: 폼 초기화
  // 문서 클릭: 수정/삭제 버튼 이벤트를 잡아 처리
  form.addEventListener('submit', handleSubmit);
  cancelButton.addEventListener('click', resetForm);
  document.addEventListener('click', handleListClick);

  // 초기 화면 렌더링.
  SubTrackerUI.cacheDom();
  render();

  // 외부에서 render 함수를 호출할 수 있도록 전역 객체에 등록합니다.
  // 보통 디버깅이나 별도 관리용으로 사용합니다.
  window.SubTrackerApp = {
    render,
  };
})();
