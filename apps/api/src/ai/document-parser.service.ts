import { BadRequestException, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { MAX_EXTRACTED_CHARACTERS } from './rag.utils.js';

const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

@Injectable()
export class DocumentParserService {
  async extract(file: Express.Multer.File) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a non-empty PDF, DOCX, or UTF-8 TXT file.');
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('The file must not exceed 5 MB.');
    const detected = await fileTypeFromBuffer(file.buffer);
    const mime = detected?.mime ?? (looksLikeUtf8(file.buffer) ? 'text/plain' : '');
    if (!ALLOWED.has(mime))
      throw new BadRequestException(
        'The file signature is not a valid PDF, DOCX, or UTF-8 TXT document.'
      );
    try {
      const result = await withTimeout(this.parse(file.buffer, mime), 10_000);
      const text = result.text.split(String.fromCharCode(0)).join('').trim();
      if (result.pages && result.pages > 50)
        throw new BadRequestException('PDF documents must not exceed 50 pages.');
      if (text.length < 20)
        throw new BadRequestException(
          'No usable text was found. Image-only documents require OCR, which is not supported yet.'
        );
      if (text.length > MAX_EXTRACTED_CHARACTERS)
        throw new BadRequestException('Extracted text exceeds the 250,000-character limit.');
      return {
        text,
        pageCount: result.pages,
        mimeType: mime,
        filename: sanitizeFilename(file.originalname)
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'The document is encrypted, malformed, too complex, or could not be parsed.'
      );
    }
  }
  private async parse(buffer: Buffer, mime: string): Promise<{ text: string; pages?: number }> {
    if (mime === 'text/plain')
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer) };
    if (mime.includes('wordprocessingml')) {
      validateDocxArchive(buffer);
      // Mammoth limits extraction to document XML and does not retain embedded files.
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value };
    }
    const parser = new PDFParse({ data: buffer });
    try {
      return await extractPdfText(parser);
    } finally {
      await parser.destroy();
    }
  }
}

export async function extractPdfText(
  parser: Pick<PDFParse, 'getInfo' | 'getText'>
): Promise<{ text: string; pages?: number }> {
  // pdf.js-backed parsers are not safe to invoke concurrently on one document.
  const info = await parser.getInfo();
  const text = await parser.getText();
  return { text: text.text, pages: info.total };
}

export function validateDocxArchive(buffer: Buffer, maxUncompressedBytes = 50 * 1024 * 1024) {
  let offset = 0;
  let entries = 0;
  let total = 0;
  while ((offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset)) >= 0) {
    if (offset + 46 > buffer.length)
      throw new BadRequestException('The DOCX archive is malformed.');
    entries += 1;
    total += buffer.readUInt32LE(offset + 24);
    if (entries > 2_000 || total > maxUncompressedBytes)
      throw new BadRequestException('The DOCX archive expands beyond safe processing limits.');
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  if (!entries) throw new BadRequestException('The DOCX archive is malformed.');
}

function looksLikeUtf8(buffer: Buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return !buffer.includes(0);
  } catch {
    return false;
  }
}
export function sanitizeFilename(name: string) {
  return (
    name
      .replace(/^.*[\\/]/, '')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 180) || 'document'
  );
}
function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Parsing timed out')), ms))
  ]);
}
