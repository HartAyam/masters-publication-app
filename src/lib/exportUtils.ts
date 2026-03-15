import { saveAs } from 'file-saver';

export const exportToCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${filename}.csv`);
};

export const printDiv = (divId: string, title: string) => {
  const element = document.getElementById(divId);
  if (!element) return;
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
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
            .no-print { display: none !important; }
            /* Force background colors in print */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
          body { font-family: sans-serif; padding: 20px; }
        </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
    </html>
  `);
  
  printWindow.document.close();
  
  // Wait for resources to load before printing
  printWindow.onload = () => {
    printWindow.print();
    // Optional: close the window after printing
    // printWindow.close();
  };
};
