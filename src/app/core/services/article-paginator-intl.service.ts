/**
 * Custom paginator internationalization service for articles.
 * Shows both full count (all articles) and filtered count.
 */

import { Injectable, signal } from "@angular/core";
import { MatPaginatorIntl } from "@angular/material/paginator";

@Injectable()
export class ArticlePaginatorIntl extends MatPaginatorIntl {
  private totalCountAllSignal = signal<number | null>(null);

  /**
   * Set the total count of all articles (without read state filter).
   */
  setTotalCountAll(count: number | null): void {
    this.totalCountAllSignal.set(count);
  }

  override getRangeLabel = (
    page: number,
    pageSize: number,
    length: number,
  ): string => {
    if (length === 0 || pageSize === 0) {
      const totalAll = this.totalCountAllSignal();
      if (totalAll !== null && totalAll !== length) {
        return `0 of ${length} (Total: ${totalAll})`;
      }
      return `0 of ${length}`;
    }

    const startIndex = page * pageSize;
    const endIndex =
      startIndex < length
        ? Math.min(startIndex + pageSize, length)
        : startIndex + pageSize;

    const totalAll = this.totalCountAllSignal();
    if (totalAll !== null && totalAll !== length) {
      return `${startIndex + 1} – ${endIndex} of ${length} (Total: ${totalAll})`;
    }

    return `${startIndex + 1} – ${endIndex} of ${length}`;
  };
}
