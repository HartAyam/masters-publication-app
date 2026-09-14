import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

export const exportToExcel = (data: any[], filename: string, sheetName: string = 'Sheet1') => {
  if (!data || data.length === 0) {
    console.error('Export failed: No data provided');
    alert('No data to export.');
    return;
  }

  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Auto-fit column widths approximately
    const colWidths = Object.keys(data[0] || {}).map(key => {
      let maxLen = key.length;
      data.forEach(row => {
        const valStr = String(row[key] ?? '');
        if (valStr.length > maxLen) maxLen = Math.min(valStr.length, 45);
      });
      return { wch: Math.max(maxLen + 2, 10) };
    });
    worksheet['!cols'] = colWidths;

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');
    saveAs(blob, `${safeFilename}.xlsx`);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    alert('Failed to export Excel file. Please try again.');
  }
};

export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    console.error('Export failed: No data provided');
    return;
  }

  try {
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        let val = row[header];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') {
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }
        return val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');
    saveAs(blob, `${safeFilename}.csv`);
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    alert('Failed to export CSV. Please check the console for details.');
  }
};

export const printDiv = (divId: string, title: string) => {
  const element = document.getElementById(divId);
  if (!element) {
    console.error(`Print failed: Element with ID "${divId}" not found`);
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocked! Please allow pop-ups for this site to print.');
    return;
  }

  // Get all styles from the current document
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(style => style.outerHTML)
    .join('\n');

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        ${styles}
        <style>
          @media print {
            body { padding: 0; margin: 0; }
            .no-print, .print\\:hidden { display: none !important; }
            /* Force background colors in print */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            @page { margin: 1cm; }
          }
          body { font-family: sans-serif; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${element.innerHTML}
        </div>
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
              // window.close(); // Optional: close after printing
            }, 500);
          };
          // Fallback if onload doesn't fire
          setTimeout(() => {
            if (document.readyState === 'complete') {
              window.print();
            }
          }, 2000);
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
