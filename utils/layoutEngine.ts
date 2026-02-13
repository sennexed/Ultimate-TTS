
import { TextItem, BoundingBox } from '../types';

/**
 * Group text items into visual blocks based on proximity and font size.
 */
export function clusterTextItems(items: TextItem[], pageWidth: number, pageHeight: number): string[] {
  if (items.length === 0) return [];

  // Sort by Y coordinate first
  const sortedItems = [...items].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let lastBox: BoundingBox | null = null;

  const Y_THRESHOLD = 15; // Vertical distance threshold
  const X_THRESHOLD = pageWidth * 0.15; // Horizontal gap threshold (multi-column)

  sortedItems.forEach((item) => {
    if (!lastBox) {
      currentBlock.push(item.text);
      lastBox = item.box;
      return;
    }

    const verticalGap = Math.abs(item.box.y - lastBox.y);
    const horizontalGap = Math.abs(item.box.x - (lastBox.x + lastBox.w));

    // If item is far vertically or significantly horizontally separated
    if (verticalGap > Y_THRESHOLD || horizontalGap > X_THRESHOLD) {
      blocks.push(currentBlock);
      currentBlock = [item.text];
    } else {
      currentBlock.push(item.text);
    }
    
    lastBox = item.box;
  });

  if (currentBlock.length > 0) blocks.push(currentBlock);

  return blocks.map(b => b.join(' ').replace(/\s+/g, ' ').trim());
}

/**
 * Reading order logic: Cluster by vertical bands then horizontal.
 */
export function determineReadingOrder(items: TextItem[]): TextItem[] {
  // Simple multi-column heuristic: group by broad vertical bands
  return [...items].sort((a, b) => {
    const bandSize = 20; 
    const aBand = Math.floor(a.box.y / bandSize);
    const bBand = Math.floor(b.box.y / bandSize);
    
    if (aBand !== bBand) return aBand - bBand;
    return a.box.x - b.box.x;
  });
}
