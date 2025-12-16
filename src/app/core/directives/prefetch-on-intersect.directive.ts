/**
 * Directive to prefetch content when element enters viewport.
 * Useful for prefetching articles that are about to be viewed.
 */

import {
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { ArticleService } from "../services/article.service";

@Directive({
  selector: "[appPrefetchOnIntersect]",
  standalone: true,
})
export class PrefetchOnIntersectDirective implements OnInit, OnDestroy {
  private readonly elementRef = inject(ElementRef);
  private readonly articleService = inject(ArticleService);

  readonly articleId = input.required<number>();
  readonly rootMargin = input<string>("200px"); // Prefetch when 200px away

  private observer: IntersectionObserver | null = null;

  ngOnInit() {
    const articleId = this.articleId();
    if (!articleId) {
      return;
    }

    // Only create observer if IntersectionObserver is supported
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && articleId) {
              // Prefetch when element enters viewport
              this.articleService.prefetchArticle(articleId);
              // Disconnect after first intersection to avoid repeated prefetches
              this.observer?.disconnect();
            }
          });
        },
        {
          rootMargin: this.rootMargin(),
        },
      );

      this.observer.observe(this.elementRef.nativeElement);
    }
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
