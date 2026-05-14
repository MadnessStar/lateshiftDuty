/**
 * excelParser.js
 * SheetJS를 사용해 근무표 엑셀을 파싱합니다.
 *
 * ■ 기대 엑셀 구조
 *   - 어딘가에 "연도 N월" 텍스트가 포함된 셀이 있음 (년/월 자동 감지)
 *   - "구분" 컬럼이 있고, 그 옆에 직원 이름 컬럼이 있음
 *   - 날짜 헤더 행: 1, 2, 3 … 28~31 연속 숫자 또는 Excel 날짜 시리얼
 *   - 각 직원 행의 날짜 칸에 공백·O·연·단기·교육 등 값이 있음
 *   - 요보 선생님·송영 선생님 행은 스킵
 *
 * ■ 반환값 ParseResult
 *   {
 *     year:      number | null,
 *     month:     number | null,
 *     employees: Array<{ name: string, schedule: Object<day, string> }>,
 *     warnings:  string[],
 *   }
 */

/**
 * ArrayBuffer → ParseResult
 * @param {ArrayBuffer} buffer
 * @returns {ParseResult}
 */
function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // sheet_to_json으로 2D 배열 추출 (defval='')
  let data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 병합 셀 처리: 병합된 빈 셀에 첫 번째 값을 채워 넣음
  data = expandMergedCells(sheet, data);

  const warnings = [];

  // ── 1. 날짜 헤더 행 찾기 ────────────────────────────────
  //  방법①: 1,2,3…28+ 연속 정수 (날짜가 일(day) 숫자로 기록된 경우)
  //  방법②: Excel 날짜 시리얼 번호(40000~60000대 큰 정수) 28개 이상 연속
  //  ※ 행 끝에 합계 등 비숫자 열이 있어도 최대 연속 수로 판단

  let dateRowIdx   = -1;
  let firstDateCol = -1;
  let firstSerial  = -1;   // 시리얼 방식일 때 첫 번째 시리얼 값

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    let seq = 0, startCol = -1, startVal = -1;
    let maxSeq = 0, bestStartCol = -1, bestStartVal = -1;

    for (let c = 0; c < row.length; c++) {
      const v = Number(row[c]);
      if (!isNaN(v) && Number.isInteger(v) && v > 0 && startCol === -1) {
        startCol = c; startVal = v; seq = 1;
      } else if (startCol !== -1 && v === startVal + seq) {
        seq++;
      } else if (startCol !== -1) {
        if (seq > maxSeq) { maxSeq = seq; bestStartCol = startCol; bestStartVal = startVal; }
        startCol = -1; seq = 0;
        if (!isNaN(v) && Number.isInteger(v) && v > 0) { startCol = c; startVal = v; seq = 1; }
      }
    }
    if (seq > maxSeq) { maxSeq = seq; bestStartCol = startCol; bestStartVal = startVal; }

    if (maxSeq >= 28) {
      // 방법①: 1로 시작하는 작은 정수 (일 숫자)
      if (bestStartVal === 1) {
        dateRowIdx   = r;
        firstDateCol = bestStartCol;
        firstSerial  = -1;
        break;
      }
      // 방법②: Excel 날짜 시리얼 (40000~60000)
      if (bestStartVal > 40000 && bestStartVal < 60000) {
        // 해당 시리얼의 일(day) 확인
        const d = new Date(Math.round((bestStartVal - 25569) * 86400000));
        if (d.getUTCDate() === 1) {          // 1일부터 시작해야 정상
          dateRowIdx   = r;
          firstDateCol = bestStartCol;
          firstSerial  = bestStartVal;
          break;
        }
      }
    }
  }

  if (dateRowIdx === -1) {
    warnings.push('날짜 헤더를 찾지 못했습니다. 엑셀에서 날짜 행이 1,2,3… 또는 날짜 형식 셀인지 확인해 주세요.');
    return { year: null, month: null, employees: [], warnings };
  }

  // 날짜 헤더 행에서 실제 마지막 날짜 확인
  let lastDay = 28;
  if (firstSerial > 0) {
    // 시리얼 방식: 연속 시리얼 개수 = 해당 월의 일수
    for (let c = firstDateCol; c < data[dateRowIdx].length; c++) {
      const v = Number(data[dateRowIdx][c]);
      if (v === firstSerial + (c - firstDateCol)) {
        const dayOfMonth = new Date(Math.round((v - 25569) * 86400000)).getUTCDate();
        if (dayOfMonth > lastDay) lastDay = dayOfMonth;
      } else break;
    }
  } else {
    for (let c = firstDateCol; c < data[dateRowIdx].length; c++) {
      const v = Number(data[dateRowIdx][c]);
      if (v >= 28 && v <= 31) lastDay = v;
      if (v > 31) break;
    }
  }

  // ── 2. 구분·이름 컬럼 찾기 ──────────────────────────────
  let 구분Col = -1;
  let nameCol  = -1;

  // 방법①: 날짜 헤더 행 포함 위쪽 행에서 "구분" 텍스트 검색
  outerA:
  for (let r = dateRowIdx; r >= 0; r--) {
    for (let c = 0; c < data[r].length; c++) {
      if (String(data[r][c]).trim() === '구분') {
        구분Col = c;
        break outerA;
      }
    }
  }

  // 방법②: 데이터 행에서 '요양' 값이 있는 열을 구분 열로 사용
  if (구분Col === -1) {
    outerB:
    for (let r = dateRowIdx + 1; r < Math.min(dateRowIdx + 40, data.length); r++) {
      for (let c = 0; c < firstDateCol; c++) {
        const v = String(data[r][c] ?? '').trim();
        if (v === '요양' || v.startsWith('요양보호')) {
          구분Col = c;
          break outerB;
        }
      }
    }
  }

  if (구분Col === -1) {
    warnings.push('"구분" 열을 찾지 못했습니다(헤더·데이터 모두 확인). 열 위치를 추정합니다.');
    구분Col = Math.max(0, firstDateCol - 2);
  }

  // 이름 컬럼: 방법①로 '성명' 텍스트 검색
  outerC:
  for (let r = dateRowIdx; r >= 0; r--) {
    for (let c = 구분Col + 1; c < firstDateCol; c++) {
      const v = String(data[r][c]).trim();
      if (v === '성명' || v === '이름') {
        nameCol = c;
        break outerC;
      }
    }
  }
  // 방법②: 구분 바로 오른쪽
  if (nameCol === -1) {
    nameCol = 구분Col + 1;
    if (nameCol >= firstDateCol) nameCol = firstDateCol - 1;
  }

  // ── 3. 연도·월 감지 ─────────────────────────────────────
  let year  = null;
  let month = null;

  for (let r = 0; r < data.length && (year === null || month === null); r++) {
    for (let c = 0; c < data[r].length; c++) {
      const cell = String(data[r][c]);
      // "2026년 5월" or "2026년5월" 형태
      const m = cell.match(/(\d{4})[년\s]*(\d{1,2})[월]/);
      if (m) {
        year  = parseInt(m[1], 10);
        month = parseInt(m[2], 10);
        break;
      }
    }
  }

  if (year === null && firstSerial > 0) {
    // 시리얼 방식일 때 첫 시리얼에서 연도·월 추출
    const d = new Date(Math.round((firstSerial - 25569) * 86400000));
    year  = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
  }

  if (year === null) warnings.push('연도·월을 자동으로 감지하지 못했습니다. 직접 입력해 주세요.');

  // ── 4. 직원 데이터 추출 ─────────────────────────────────
  const employees = [];

  for (let r = dateRowIdx + 1; r < data.length; r++) {
    const row = data[r];

    const 구분Val = String(row[구분Col] ?? '').trim();
    const name    = String(row[nameCol]  ?? '').trim();

    // 요양보호사 행만 처리 (정확히 '요양' 또는 '요양보호사'로 시작)
    if (구분Val !== '요양' && !구분Val.startsWith('요양보호')) continue;

    // 요약 행(요보 선생님 등) 스킵
    const normalized = name.replace(/\s/g, '');
    if (SKIP_ROW_NAMES.some(s => normalized.includes(s.replace(/\s/g, '')))) continue;

    // 빈 이름 스킵
    if (!name) continue;

    // 날짜별 근무 상태 추출
    const schedule = {};
    for (let d = 1; d <= lastDay; d++) {
      const colIdx = firstDateCol + d - 1;
      const val = String(row[colIdx] ?? '').trim();
      schedule[d] = val;
    }

    employees.push({ name, schedule });
  }

  if (employees.length === 0) {
    warnings.push('요양보호사 데이터를 추출하지 못했습니다.');
  }

  return { year, month, employees, warnings };
}

// ─── 병합 셀 펼치기 ─────────────────────────────────────────
function expandMergedCells(sheet, data) {
  const merges = sheet['!merges'] || [];
  for (const merge of merges) {
    const { s, e } = merge;
    const val = (data[s.r] && data[s.r][s.c] !== undefined) ? data[s.r][s.c] : '';
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        if (!data[r]) data[r] = [];
        // 병합 범위 내 첫 셀 제외 빈 곳만 채움
        if (r !== s.r || c !== s.c) {
          if (data[r][c] === '' || data[r][c] === undefined) {
            data[r][c] = val;
          }
        }
      }
    }
  }
  return data;
}
