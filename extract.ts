/**
 * Шаг 2 RAG-конвейера: извлечение текста из документа.
 *  • .txt / .md — встроенно; разрыв страницы — символ \f (form feed)
 *  • .pdf       — пакет pdf-parse (optionalDependency), текст постранично
 *  • .docx      — пакет mammoth (optionalDependency), без номеров страниц
 * Сканы PDF без текстового слоя требуют OCR (например, Tesseract) — см. README.
 */
import { HttpError } from '../lib/http.js';

export interface Extracted { pages: string[]; paged: boolean; format: string }

// Динамический импорт по имени-переменной: пакет необязателен и может быть не установлен.
async function optionalImport(name: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    return await import(name);
  } catch {
    throw new HttpError(501, `Для этого формата установите пакет «${name.split('/')[0]}» на сервере (npm i ${name.split('/')[0]}).`);
  }
}

export async function extractPages(buf: Buffer, filename: string, mime: string): Promise<Extracted> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (['txt', 'md', 'markdown'].includes(ext) || mime.startsWith('text/')) {
    const text = buf.toString('utf8').replace(/\r\n/g, '\n');
    const pages = text.split('\f').map((p) => p.trim()).filter(Boolean);
    return { pages: pages.length ? pages : [text], paged: pages.length > 1, format: ext || 'txt' };
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    // lib/pdf-parse.js — чтобы обойти отладочный код в index.js пакета
    const mod = await optionalImport('pdf-parse/lib/pdf-parse.js');
    const pdfParse = mod.default ?? mod;
    const pages: string[] = [];
    await pdfParse(buf, {
      pagerender: async (page: { getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }> }) => {
        const tc = await page.getTextContent();
        let lastY: number | null = null;
        let text = '';
        for (const it of tc.items) {
          const y = it.transform[5];
          text += lastY !== null && Math.abs(y - lastY) > 2 ? `\n${it.str}` : it.str;
          lastY = y;
        }
        pages.push(text);
        return text;
      },
    });
    if (!pages.join('').trim()) throw new HttpError(422, 'В PDF нет текстового слоя (скан). Требуется OCR перед загрузкой.');
    return { pages, paged: true, format: 'pdf' };
  }
  if (ext === 'docx') {
    const mod = await optionalImport('mammoth');
    const mammoth = mod.default ?? mod;
    const r = await mammoth.extractRawText({ buffer: buf });
    return { pages: [String(r.value ?? '')], paged: false, format: 'docx' };
  }
  throw new HttpError(415, 'Поддерживаются форматы: .txt, .md, .pdf, .docx');
}
