'use strict';

const ExcelJS = require('exceljs');

/**
 * Turns a workbook spec from the UI into a real .xlsx file.
 *
 * Every sheet gets a frozen, filterable header row, sized columns, rupee and
 * date formatting, and a bold totals row — so the file is usable the moment it
 * opens rather than a wall of raw text.
 */

const CREAM = 'FFF6ECDB';
const INK = 'FF241B15';
const LINE = 'FFE8DCC9';
const TERRACOTTA = 'FFC2643F';

const MONEY_FMT = '₹#,##0';
const DATE_FMT = 'dd-mmm-yyyy';
const PERCENT_FMT = '0%';

function numberFormatFor(format) {
  switch (format) {
    case 'money':
      return MONEY_FMT;
    case 'date':
      return DATE_FMT;
    case 'percent':
      return PERCENT_FMT;
    case 'number':
      return '#,##0';
    default:
      return undefined;
  }
}

// 'YYYY-MM-DD' -> a real Date at UTC noon, so Excel shows the same day everywhere.
function toExcelDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function buildSheet(workbook, spec) {
  const sheet = workbook.addWorksheet(spec.name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  sheet.columns = spec.columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 16,
    style: { numFmt: numberFormatFor(col.format) },
  }));

  const header = sheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, size: 11, color: { argb: INK } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
    cell.border = { bottom: { style: 'thin', color: { argb: TERRACOTTA } } };
  });

  const dateKeys = new Set(spec.columns.filter((c) => c.format === 'date').map((c) => c.key));

  for (const row of spec.rows) {
    const prepared = { ...row };
    for (const key of dateKeys) prepared[key] = toExcelDate(row[key]);
    const added = sheet.addRow(prepared);
    added.eachCell((cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: LINE } } };
    });
  }

  if (spec.totals && spec.rows.length) {
    const totalRow = sheet.addRow({ [spec.columns[0].key]: 'Total', ...spec.totals });
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: TERRACOTTA } } };
    });
  }

  // Filter dropdowns on every column, so any sheet can be sliced by branch,
  // room, status or month without touching the app.
  if (spec.rows.length) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: spec.columns.length },
    };
  }

  return sheet;
}

async function writeWorkbook(spec, filePath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sri Bharathi Manager';
  workbook.created = new Date(spec.generatedAt || Date.now());
  workbook.title = spec.title;

  for (const sheetSpec of spec.sheets) buildSheet(workbook, sheetSpec);

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

module.exports = { writeWorkbook };
