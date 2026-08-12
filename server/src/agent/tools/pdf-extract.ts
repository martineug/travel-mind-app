import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { Tool } from '../tool';

const MAX_CHARS = 5000;

async function extractPdfContent(filepath: string, displayName?: string): Promise<string> {
  if (!fs.existsSync(filepath)) {
    return `File not found: ${filepath}`;
  }

  const name = displayName || path.basename(filepath);

  const parser = new PDFParse({ data: fs.readFileSync(filepath) });
  const result = await parser.getText();

  return `[PDF: ${name}]\n${result.text.slice(0, MAX_CHARS)}`;
}

export const pdfExtractTool = new Tool(
  'read_uploaded_pdf',
  'Extract text content from an uploaded file. Supports pdf (returns text).',
  {
    filepath: { type: 'string', description: 'Absolute path to the uploaded file.' },
  },
  (args: Record<string, any>) => extractPdfContent(args['filepath'] as string, args['display_name'] as string | undefined),
);
