import { describe, expect, it } from 'vitest';
import { PRINT_ITEMS_PER_PAGE, paginatePrintItems } from './print.js';

describe('paginatePrintItems', () => {
  it('uses 25 line items per printed page', () => {
    const items = Array.from({ length: 51 }, (_, index) => ({ id: index + 1 }));
    const pages = paginatePrintItems(items);

    expect(PRINT_ITEMS_PER_PAGE).toBe(25);
    expect(pages).toHaveLength(3);
    expect(pages.map(page => page.length)).toEqual([25, 25, 1]);
    expect(pages[1][0].id).toBe(26);
    expect(pages[1][24].id).toBe(50);
  });

  it('still returns one page for an empty invoice', () => {
    expect(paginatePrintItems([])).toEqual([[]]);
  });
});
