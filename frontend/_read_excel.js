const XLSX = require('xlsx');
const wb = XLSX.readFile(process.argv[2], { cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log('TOTAL_FILAS:' + rows.length);
console.log('HEADERS:' + JSON.stringify(Object.keys(rows[0] || {})));
rows.forEach((r, i) => console.log('FILA_' + (i+2) + ':' + JSON.stringify(r)));
