import * as pdfjsLib from 'pdfjs-dist';
import { TextItem, PageContent } from '../types';
import { clusterTextItems, determineReadingOrder } from '../utils/layoutEngine';

// Stable worker initialization for bundled environments. 
// This must match the version in package.json exactly.
const PDFJS_VERSION = '4.10.38';
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.mjs`;

export async function parsePdf(file: File): Promise<PageContent[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      disableAutoFetch: true,
      disableStream: true
    });
    
    const pdf = await loadingTask.promise;
    const pages: PageContent[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      const items: TextItem[] = textContent.items.map((item: any) => ({
        text: item.str,
        box: {
          x: item.transform[4],
          y: viewport.height - item.transform[5],
          w: item.width,
          h: item.height
        },
        fontSize: item.transform[0],
        fontName: item.fontName
      }));

      const sortedItems = determineReadingOrder(items);
      const clusteredBlocks = clusterTextItems(sortedItems, viewport.width, viewport.height);

      pages.push({
        pageNumber: i,
        blocks: clusteredBlocks.map((c, idx) => ({
          type: 'paragraph',
          content: c,
          order: idx,
          confidence: 1.0
        })),
        rawText: clusteredBlocks.join('\n')
      });
    }

    return pages;
  } catch (error: any) {
    console.error("PDF Parsing Error:", error);
    if (error.name === 'InvalidPDFException' || error.message.includes('structure')) {
      throw new Error("This PDF appears to be corrupted or encrypted. Try converting it to images.");
    }
    throw error;
  }
}

export async function renderPageToCanvas(file: File, pageNum: number, scale: number = 2.0): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
}