/**
 * constants.js
 * 늦조 편성에 필요한 모든 상수·설정값
 */

// ─── 늦조 편성에서 제외되는 남자 요양보호사 ──────────────────
const MALE_NURSES = ['오태봉', '현택정', '김연욱'];

// ─── 당일 근무 상태에 따른 제외 값 ──────────────────────────
// 이 값이 해당 날짜 칸에 있으면 늦조 편성 불가
const EXCLUDED_STATUSES = ['O', '연', '교육'];
const SHORT_TERM_STATUS  = '단기';   // 단기보호 근무

// ─── 요약 행 이름 (파싱 시 직원 행에서 제외) ─────────────────
const SKIP_ROW_NAMES = ['요보선생님', '요보 선생님', '송영선생님', '송영 선생님'];

// ─── 개인별 늦조 조건 ─────────────────────────────────────────
// type 설명:
//   nth_weekday      : 매월 N번째 특정 요일에 불가
//   blocked_weekdays : 특정 요일에는 불가
//   allowed_weekdays : 특정 요일에만 가능
//   day_before_off   : 휴무(O/연) 전날만 가능
//
// weekday 숫자: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
const INDIVIDUAL_CONDITIONS = {
  '이정옥': {
    type: 'nth_weekday',
    weekday: 3,   // 수요일
    nth: 4,       // 4번째
    desc: '매월 4번째 수요일 불가',
  },
  '김명숙': {
    type: 'blocked_weekdays',
    weekdays: [2, 4],  // 화, 목
    desc: '매주 화요일·목요일 불가',
  },
  '위은실': {
    type: 'blocked_weekdays',
    weekdays: [3],     // 수
    desc: '매주 수요일 불가',
  },
  '홍채연': {
    type: 'allowed_weekdays',
    weekdays: [1, 5],  // 월, 금
    desc: '월요일·금요일만 가능',
  },
  '탁정심': {
    type: 'day_before_off',
    desc: '휴무(O) 또는 연차(연) 전날만 가능',
  },
};

// ─── 요일 이름 ────────────────────────────────────────────────
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
