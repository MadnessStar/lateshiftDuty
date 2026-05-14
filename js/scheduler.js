/**
 * scheduler.js
 * 늦조 근무 편성 핵심 로직
 *
 * ■ 주요 함수
 *   generateSchedule(employees, year, month, holidayMap)
 *     → DayResult[] 반환
 *
 * ■ DayResult 구조
 *   {
 *     date:      string,          // "YYYY-MM-DD"
 *     day:       number,          // 1~31
 *     dow:       number,          // 0=일 … 6=토
 *     dayName:   string,          // "월" 등
 *     skip:      boolean,         // 토·일·공휴일이면 true
 *     skipReason:string,          // 스킵 이유
 *     holidayName:string|null,
 *     available: CandidateInfo[], // 늦조 가능 인원
 *     excluded:  CandidateInfo[], // 제외된 인원 + 이유
 *   }
 *
 *   CandidateInfo: { name, reason }
 */

/**
 * 편성 메인 함수
 * @param {Array<{name:string, schedule:Object}>} employees
 * @param {number} year
 * @param {number} month
 * @param {Map<string,string>} holidayMap  key="YYYY-MM-DD", value=공휴일명
 * @returns {DayResult[]}
 */
function generateSchedule(employees, year, month, holidayMap) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const results = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date    = new Date(year, month - 1, day);
    const dow     = date.getDay();
    const dateStr = toDateStr(date);
    const dayName = DAY_NAMES[dow];

    // ── 날짜 제외 조건 ──────────────────────────────────────
    if (dow === 0) {
      results.push(makeDayResult(dateStr, day, dow, true, '일요일 (센터 휴무)', null, [], []));
      continue;
    }
    if (dow === 6) {
      results.push(makeDayResult(dateStr, day, dow, true, '토요일', null, [], []));
      continue;
    }
    const holidayName = holidayMap.get(dateStr) || null;
    if (holidayName) {
      results.push(makeDayResult(dateStr, day, dow, true, `공휴일: ${holidayName}`, holidayName, [], []));
      continue;
    }

    // ── 인원 필터링 ─────────────────────────────────────────
    const available = [];
    const excluded  = [];

    for (const emp of employees) {
      const { name, schedule } = emp;
      const status = String(schedule[day] ?? '').trim();

      const ex = getExclusionReason(name, status, day, dow, year, month, schedule);
      if (ex) {
        excluded.push({ name, reason: ex, status });
      } else {
        available.push({ name, status });
      }
    }

    results.push(makeDayResult(dateStr, day, dow, false, null, null, available, excluded));
  }

  return results;
}

// ─── 제외 이유 반환 (없으면 null) ──────────────────────────
function getExclusionReason(name, status, day, dow, year, month, schedule) {
  // ① 남자 요양보호사
  if (MALE_NURSES.includes(name)) {
    return '남자 요양보호사 (고정 제외)';
  }

  // ② 당일 근무 상태
  if (EXCLUDED_STATUSES.includes(status)) {
    const label = { O: '휴무', '연': '연차', '교육': '교육' };
    return `당일 ${label[status] ?? status}`;
  }

  // ③ 단기보호 근무
  if (status === SHORT_TERM_STATUS) {
    return '단기보호 근무';
  }

  // ④ 개인 조건
  const cond = INDIVIDUAL_CONDITIONS[name];
  if (!cond) return null;

  if (cond.type === 'nth_weekday') {
    // 매월 N번째 특정 요일에 불가
    if (dow === cond.weekday) {
      const nthDay = getNthWeekdayOfMonth(year, month, cond.weekday, cond.nth);
      if (day === nthDay) {
        return cond.desc;
      }
    }
  }

  if (cond.type === 'blocked_weekdays') {
    if (cond.weekdays.includes(dow)) {
      return cond.desc;
    }
  }

  if (cond.type === 'allowed_weekdays') {
    if (!cond.weekdays.includes(dow)) {
      return cond.desc;
    }
  }

  if (cond.type === 'day_before_off') {
    // 내일이 휴무(O) 또는 연차(연)인지 확인
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day >= daysInMonth) {
      // 마지막 날이면 다음 달 휴무를 알 수 없으므로 제외 처리 (안전)
      return `${cond.desc} (월말이라 다음 날 확인 불가)`;
    }
    const tomorrowStatus = String(schedule[day + 1] ?? '').trim();
    const tomorrowDow    = new Date(year, month - 1, day + 1).getDay();
    // 내일이 일요일(센터 휴무)도 '쉬는 날'로 간주
    const isTomorrowOff  = tomorrowStatus === 'O' || tomorrowStatus === '연' || tomorrowDow === 0;
    if (!isTomorrowOff) {
      return cond.desc;
    }
  }

  return null;
}

// ─── 매월 N번째 특정 요일의 날짜 ───────────────────────────
function getNthWeekdayOfMonth(year, month, weekday, nth) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === weekday) {
      count++;
      if (count === nth) return d;
    }
  }
  return -1; // 해당 없음
}

// ─── DayResult 생성 헬퍼 ────────────────────────────────────
function makeDayResult(dateStr, day, dow, skip, skipReason, holidayName, available, excluded) {
  return {
    date: dateStr,
    day,
    dow,
    dayName: DAY_NAMES[dow],
    skip,
    skipReason: skipReason || null,
    holidayName: holidayName || null,
    available,
    excluded,
  };
}

// ─── 날짜 → "YYYY-MM-DD" ────────────────────────────────────
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
