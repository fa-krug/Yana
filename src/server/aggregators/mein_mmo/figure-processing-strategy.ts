/**
 * Figure element processing strategy pattern for Mein-MMO content extraction.
 */

import type { Cheerio, AnyNode } from "cheerio";
import type pino from "pino";

/**
 * Context passed to each figure processing strategy.
 */
export interface FigureProcessingContext {
  figure: Cheerio<AnyNode>;
  $: any; // Cheerio instance
  logger: pino.Logger;
  aggregatorId: string;
  feedId: number | null | undefined;
}

/**
 * Result of figure processing.
 */
export interface FigureProcessingResult {
  replacementHtml: string | null;
  success: boolean;
}

/**
 * Strategy interface for processing figure elements.
 */
export interface FigureProcessingStrategy {
  /**
   * Check if this strategy can handle the figure element.
   */
  canHandle(context: FigureProcessingContext): boolean;

  /**
   * Process the figure element and return replacement HTML.
   * Return null if the figure should remain unchanged.
   */
  process(context: FigureProcessingContext): FigureProcessingResult;
}

/**
 * Orchestrator for chaining multiple figure processing strategies.
 */
export class FigureProcessingOrchestrator {
  constructor(private strategies: FigureProcessingStrategy[]) {}

  /**
   * Process all figures in content using registered strategies.
   * Strategies are tried in order - first match wins.
   */
  processAllFigures(
    $: any,
    content: Cheerio<AnyNode>,
    context: Omit<FigureProcessingContext, "figure">,
  ): void {
    content.find("figure").each((_, figureEl) => {
      const $figure = $(figureEl);

      const figureContext: FigureProcessingContext = {
        ...context,
        figure: $figure,
      };

      // Try each strategy in order
      for (const strategy of this.strategies) {
        if (!strategy.canHandle(figureContext)) {
          continue;
        }

        const result = strategy.process(figureContext);
        if (result.success && result.replacementHtml) {
          $figure.replaceWith($(result.replacementHtml));
          break; // Skip remaining strategies for this figure
        }
      }
    });
  }
}
