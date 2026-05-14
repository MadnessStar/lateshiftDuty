/**
 * main.js
 * UI 이벤트 처리 및 전체 흐름 제어
 */

// ── 전역 상태 ─────────────────────────────────────────────────
let state = {
  employees:    [],     // excelParser 결과
  year:         null,
  month:        null,
  holidayMap:   new Map(),  // "YYYY-MM-DD" → 공휴일명
  scheduleResult: null,
};

// ── DOM 참조 ──────────────────────────────────────────────────
const dropZone       = document.getElementById('drop-zone');
const fileInput      = document.getElementById('file-input');
const fileStatus     = document.getElementById('file-status');
const employeeList   = document.getElementById('employee-list');
const employeeChips  = document.getElementById('employee-chips');
const secDate        = document.getElementById('sec-date');
const secResult      = document.getElementById('sec-result');
const yearInput      = document.getElementById('year-input');
const monthInput     = document.getElementById('month-input');
const confirmDateBtn = document.getElementById('confirm-date-btn');
const holidayArea    = document.getElementById('holiday-area');
const holidayList    = document.getElementById('holiday-list');
const addHolidayBtn  = document.getElementById('add-holiday-btn');
const generateBtn    = document.getElementById('generate-btn');
const resultArea     = document.getElementById('result-area');
const warningBox     = document.getElementById('warning-box');
const printBtn       = document.getElementById('print-btn');
const copyBtn        = document.getElementById('copy-btn');

// ── 파일 업로드 ───────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (!file.name.match(/\.xlsx?$/i)) {
    showFileStatus('error', '❌ 엑셀 파일(.xlsx / .xls)만 업로드할 수 있습니다.');
    return;
  }

  // 파일명에서 연도·월 힌트 추출 시도
  const nameHint = file.name.match(/(\d{4})[년\s_-]*(\d{1,2})[월]/);

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = parseExcelBuffer(e.target.result);

      if (parsed.warnings.length) {
        console.warn('[파서 경고]', parsed.warnings);
      }

      state.employees = parsed.employees;
      state.year      = parsed.year  ?? (nameHint ? parseInt(nameHint[1]) : new Date().getFullYear());
      state.month     = parsed.month ?? (nameHint ? parseInt(nameHint[2]) : new Date().getMonth() + 1);

      showFileStatus('ok',
        `✅ "${file.name}" 로드 완료 — ` +
        `요양보호사 ${state.employees.length}명 인식` +
        (parsed.warnings.length ? ` / ⚠️ ${parsed.warnings.join(' / ')}` : '')
      );

      // 인식된 요양보호사 이름 표시
      if (employeeChips && employeeList) {
        employeeChips.innerHTML = state.employees
          .map(e => `<span class="emp-chip">${e.name}</span>`)
          .join('');
        employeeList.classList.toggle('hidden', state.employees.length === 0);
      }

      // STEP 2 표시
      yearInput.value  = state.year;
      monthInput.value = state.month;
      secDate.classList.remove('hidden');
      secDate.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      showFileStatus('error', `❌ 파일을 읽는 중 오류가 발생했습니다: ${err.message}`);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function showFileStatus(type, msg) {
  fileStatus.className = `file-status ${type === 'ok' ? 'ok' : 'err'}`;
  fileStatus.textContent = msg;
  fileStatus.classList.remove('hidden');
}

// ── STEP 2 : 날짜 확인 ───────────────────────────────────────
confirmDateBtn.addEventListener('click', () => {
  const y = parseInt(yearInput.value);
  const m = parseInt(monthInput.value);
  if (!y || !m || m < 1 || m > 12) {
    alert('올바른 연도와 월을 입력해 주세요.');
    return;
  }
  state.year  = y;
  state.month = m;

  // 공휴일 계산
  state.holidayMap = getHolidayMap(y);

  renderHolidayList();
  holidayArea.classList.remove('hidden');
  secResult.classList.remove('hidden');

  if (!hasLunarData(y)) {
    const notice = document.createElement('p');
    notice.style.cssText = 'color:#dc2626;font-size:.85rem;margin-top:8px;';
    notice.textContent = `⚠️ ${y}년의 음력 기반 공휴일(설날·추석·부처님오신날) 내장 데이터가 없습니다. 아래에서 직접 추가해 주세요.`;
    holidayArea.insertBefore(notice, holidayArea.querySelector('ul'));
  }
});

// ── 공휴일 목록 렌더링 ────────────────────────────────────────
function renderHolidayList() {
  holidayList.innerHTML = '';
  const y = state.year;
  const m = state.month;
  const prefix = `${y}-${String(m).padStart(2, '0')}`;

  let count = 0;
  for (const [date, name] of [...state.holidayMap].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!date.startsWith(prefix)) continue;
    count++;
    const li = document.createElement('li');
    const d  = new Date(date + 'T00:00:00');
    li.innerHTML = `
      <span>${d.getDate()}일(${DAY_NAMES[d.getDay()]})</span>
      <span>${name}</span>
      <button title="삭제" data-date="${date}">✕</button>
    `;
    li.querySelector('button').addEventListener('click', () => {
      state.holidayMap.delete(date);
      renderHolidayList();
    });
    holidayList.appendChild(li);
  }

  if (count === 0) {
    holidayList.innerHTML = '<li style="color:#94a3b8;background:none;border:none;">이 달의 공휴일 없음</li>';
  }
}

// ── 공휴일 수동 추가 ─────────────────────────────────────────
addHolidayBtn.addEventListener('click', () => {
  const dateVal = document.getElementById('holiday-date-input').value;
  const nameVal = document.getElementById('holiday-name-input').value.trim();
  if (!dateVal) { alert('날짜를 선택해 주세요.'); return; }
  if (!nameVal) { alert('공휴일 이름을 입력해 주세요.'); return; }
  state.holidayMap.set(dateVal, nameVal);
  renderHolidayList();
  document.getElementById('holiday-date-input').value = '';
  document.getElementById('holiday-name-input').value = '';
});

// ── STEP 3 : 편성 생성 ───────────────────────────────────────
generateBtn.addEventListener('click', () => {
  if (!state.employees.length) {
    alert('요양보호사 데이터가 없습니다. 파일을 다시 업로드해 주세요.');
    return;
  }

  state.scheduleResult = generateSchedule(
    state.employees,
    state.year,
    state.month,
    state.holidayMap,
  );

  renderResult(state.scheduleResult);
  warningBox.classList.remove('hidden');
  printBtn.classList.remove('hidden');
  copyBtn.classList.remove('hidden');
  resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ── 결과 렌더링 ───────────────────────────────────────────────
function renderResult(results) {
  const eligibleDays = results.filter(r => !r.skip);
  const totalDays    = eligibleDays.length;
  const noOneDays    = eligibleDays.filter(r => r.available.length === 0).length;

  // 요약
  const summary = document.createElement('div');
  summary.className = 'result-summary';
  summary.innerHTML =
    `늦조 대상 날짜 <strong>${totalDays}일</strong> 중 ` +
    `편성 가능 인원 있는 날 <strong>${totalDays - noOneDays}일</strong>` +
    (noOneDays ? `, <span style="color:#dc2626">편성 불가 날 ${noOneDays}일</span>` : '');

  // 테이블
  const wrap  = document.createElement('div');
  wrap.className = 'result-table-wrap';
  const table = document.createElement('table');
  table.className = 'result-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>날짜</th>
        <th>요일</th>
        <th>늦조 가능 인원</th>
        <th>제외 인원 (사유)</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');

  for (const r of results) {
    const tr = document.createElement('tr');

    if (r.skip) {
      tr.className = r.holidayName ? 'holiday' : 'weekend';
      tr.innerHTML = `
        <td>${r.day}일</td>
        <td>${r.dayName}</td>
        <td colspan="2" style="color:#94a3b8">${r.skipReason}</td>
      `;
    } else {
      if (r.available.length === 0) tr.className = 'no-one';
      tr.innerHTML = `
        <td><strong>${r.day}일</strong></td>
        <td>${r.dayName}</td>
        <td>${renderCandidates(r.available)}</td>
        <td>${renderExcluded(r.excluded)}</td>
      `;
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);

  // 범례
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = `
    <strong>개인 조건 안내</strong>
    <ul>
      ${Object.entries(INDIVIDUAL_CONDITIONS).map(([name, c]) =>
        `<li><strong>${name}</strong> — ${c.desc}</li>`
      ).join('')}
      <li><strong>오태봉·현택정·김연욱</strong> — 남자 요양보호사 (고정 제외)</li>
    </ul>
  `;

  resultArea.innerHTML = '';
  resultArea.appendChild(summary);
  resultArea.appendChild(wrap);
  resultArea.appendChild(legend);
}

function renderCandidates(list) {
  if (!list.length) return '<span style="color:#dc2626">편성 가능 인원 없음</span>';
  return list.map(c => `<span class="badge-candidate">${c.name}</span>`).join('');
}

function renderExcluded(list) {
  if (!list.length) return '';
  return list.map(c => `<span class="badge-excluded">${c.name}(${c.reason})</span>`).join(' ');
}

// ── 텍스트 복사 ───────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  if (!state.scheduleResult) return;

  const lines = [`${state.year}년 ${state.month}월 늦조 편성표`, ''];
  for (const r of state.scheduleResult) {
    if (r.skip) continue;
    const names = r.available.map(c => c.name).join(', ') || '없음';
    lines.push(`${r.day}일(${r.dayName}) : ${names}`);
  }

  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => alert('클립보드에 복사되었습니다.'))
    .catch(() => alert('복사에 실패했습니다. 브라우저 설정을 확인해 주세요.'));
});
