/**
 * holidays.js
 * 한국 공휴일 계산 모듈
 *
 * ■ 처리 방식
 *   1) 양력 고정 공휴일 → 매년 동일, 대체휴일 자동 계산
 *   2) 음력 기반 공휴일(설날·추석·부처님오신날) → 2024~2026 내장 데이터
 *      그 외 연도는 고정 공휴일만 반환하며, 사용자가 UI에서 직접 추가 가능
 */

// ─── 양력 고정 공휴일 ────────────────────────────────────────
// hasSubstitute: true → 토·일 겹칠 때 대체휴일 자동 생성
const FIXED_HOLIDAYS = [
  { month: 1,  day: 1,  name: '신정',    hasSubstitute: false },
  { month: 3,  day: 1,  name: '삼일절',  hasSubstitute: true  },
  { month: 5,  day: 5,  name: '어린이날', hasSubstitute: true },
  { month: 6,  day: 6,  name: '현충일',  hasSubstitute: true  },
  { month: 8,  day: 15, name: '광복절',  hasSubstitute: true  },
  { month: 10, day: 3,  name: '개천절',  hasSubstitute: true  },
  { month: 10, day: 9,  name: '한글날',  hasSubstitute: true  },
  { month: 12, day: 25, name: '성탄절',  hasSubstitute: true  },
];

// ─── 음력 기반 공휴일 (연도별 내장) ─────────────────────────
// 설날 전날·설날·설날 다음날, 부처님오신날, 추석 전날·추석·추석 다음날
// 대체휴일도 포함 (주말 겹침 시)
const LUNAR_HOLIDAYS = {
  2024: [
    { date: '2024-02-09', name: '설날 전날' },
    { date: '2024-02-10', name: '설날' },
    { date: '2024-02-11', name: '설날 다음날' },
    { date: '2024-02-12', name: '대체휴일 (설날)' },    // 설날이 토요일
    { date: '2024-05-15', name: '부처님오신날' },
    { date: '2024-09-16', name: '추석 전날' },
    { date: '2024-09-17', name: '추석' },
    { date: '2024-09-18', name: '추석 다음날' },
  ],
  2025: [
    { date: '2025-01-28', name: '설날 전날' },
    { date: '2025-01-29', name: '설날' },
    { date: '2025-01-30', name: '설날 다음날' },
    { date: '2025-05-05', name: '부처님오신날 (어린이날 동일)' },
    { date: '2025-05-06', name: '대체휴일 (부처님오신날)' },
    { date: '2025-10-05', name: '추석 전날' },
    { date: '2025-10-06', name: '추석' },
    { date: '2025-10-07', name: '추석 다음날' },
    { date: '2025-10-08', name: '대체휴일 (추석)' },    // 전날이 일요일
  ],
  2026: [
    { date: '2026-02-17', name: '설날 전날' },
    { date: '2026-02-18', name: '설날' },
    { date: '2026-02-19', name: '설날 다음날' },
    { date: '2026-05-24', name: '부처님오신날' },
    { date: '2026-05-25', name: '대체휴일 (부처님오신날)' }, // 일요일
    { date: '2026-09-24', name: '추석 전날' },
    { date: '2026-09-25', name: '추석' },
    { date: '2026-09-26', name: '추석 다음날' },
    { date: '2026-09-28', name: '대체휴일 (추석)' },    // 다음날이 토요일
  ],
};

// ─── 유틸 ────────────────────────────────────────────────────

/** Date → "YYYY-MM-DD" 문자열 */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → Date 객체 */
function fromDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 특정 연도의 모든 공휴일을 Map으로 반환
 * @param {number} year
 * @returns {Map<string, string>}  key="YYYY-MM-DD", value=공휴일명
 */
function getHolidayMap(year) {
  const map = new Map();

  // 1) 양력 고정 공휴일
  for (const h of FIXED_HOLIDAYS) {
    const date = new Date(year, h.month - 1, h.day);
    map.set(toDateStr(date), h.name);

    // 대체휴일: 토요일 → +2일(월), 일요일 → +1일(월)
    if (h.hasSubstitute) {
      const dow = date.getDay();
      let subDate = null;
      if (dow === 6) subDate = new Date(year, h.month - 1, h.day + 2);
      if (dow === 0) subDate = new Date(year, h.month - 1, h.day + 1);
      if (subDate && !map.has(toDateStr(subDate))) {
        map.set(toDateStr(subDate), `대체휴일 (${h.name})`);
      }
    }
  }

  // 2) 음력 기반 공휴일 (내장 데이터)
  const lunar = LUNAR_HOLIDAYS[year];
  if (lunar) {
    for (const h of lunar) {
      if (!map.has(h.date)) map.set(h.date, h.name);
    }
  }

  return map;
}

/**
 * 특정 연도·월의 공휴일 배열 반환
 * @param {number} year
 * @param {number} month  1-based
 * @returns {Array<{date:string, name:string}>}
 */
function getHolidaysForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const all = getHolidayMap(year);
  const result = [];
  for (const [date, name] of all) {
    if (date.startsWith(prefix)) result.push({ date, name });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 해당 연도에 내장 음력 데이터가 있는지 여부
 * @param {number} year
 * @returns {boolean}
 */
function hasLunarData(year) {
  return Boolean(LUNAR_HOLIDAYS[year]);
}
