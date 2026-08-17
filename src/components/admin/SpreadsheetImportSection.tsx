import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Database, Loader2, Table } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { articleService } from '../../services/articleService';

export default function SpreadsheetImportSection() {
  const [data, setData] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    reader.onload = (evt) => {
      if (fileExt === 'csv') {
        Papa.parse(file, { header: true, complete: (res) => setData(res.data) });
      } else {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        setData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
      }
    };
    reader.readAsBinaryString(file);
  };

  const processImport = async () => {
    setImporting(true);
    let succeeded = 0;
    let failed = 0;
    for (const row of data) {
      if (!row.title) continue;
      try {
        await articleService.createArticle({
          title: row.title,
          slug: articleService.generateSlug(row.title),
          status: 'draft',
          content: row.full_story
            ? [{
                id: '1',
                type: 'paragraph',
                text: row.full_story,
                style: { bold: false, italic: false, underline: false, fontSize: 'medium', alignment: 'left' },
              }]
            : [],
        } as any);
        succeeded++;
      } catch (error) {
        console.error(`Failed to import row "${row.title}":`, error);
        failed++;
      }
    }
    setImporting(false);
    setData([]);
    alert(failed === 0
      ? `Import complete: ${succeeded} ${succeeded === 1 ? 'story' : 'stories'} created.`
      : `Import finished with errors: ${succeeded} created, ${failed} failed. Check the console for details.`);
  };

  return (
    <div className="space-y-8 bg-zinc-900/30 p-8 border border-white/5">
      <h2 className="text-xl font-serif">Spreadsheet Ingestion</h2>
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.xlsx" />
      
      {!data.length ? (
        <button onClick={() => fileInputRef.current?.click()} className="p-12 border border-dashed border-white/10 w-full flex flex-col items-center gap-4 hover:border-reserve-accent transition-all">
          <FileSpreadsheet size={32} />
          <span className="uppercase text-[10px] tracking-widest">Select CSV or Excel File</span>
        </button>
      ) : (
        <div className="space-y-4">
          <p className="text-[10px] uppercase text-zinc-500">{data.length} rows ready to import</p>
          <button onClick={processImport} disabled={importing} className="bg-white text-black px-8 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
            {importing ? <Loader2 className="animate-spin" size={14}/> : <Database size={14}/>}
            Execute Import
          </button>
        </div>
      )}
    </div>
  );
}
