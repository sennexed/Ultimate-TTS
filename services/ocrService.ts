
// Tesseract is loaded via CDN in index.html
declare var Tesseract: any;

export async function performOCR(imageSrc: string): Promise<string> {
  const worker = await Tesseract.createWorker('eng');
  const { data: { text } } = await worker.recognize(imageSrc);
  await worker.terminate();
  return text;
}
