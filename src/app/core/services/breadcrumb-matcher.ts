/**
 * Route pattern matchers for breadcrumb generation.
 * Each matcher handles a specific route pattern and determines if a breadcrumb should be added.
 */

import { ActivatedRouteSnapshot } from "@angular/router";

import type { BreadcrumbItem } from "./breadcrumb.service";

/**
 * Context for route pattern matching.
 */
export interface MatchContext {
  dynamicLabels: Map<string, string>;
  isArticleDetailRoute(route: ActivatedRouteSnapshot): boolean;
  buildUrl(route: ActivatedRouteSnapshot): string;
}

/**
 * Result of pattern matching.
 */
export interface MatchResult {
  handled: boolean;
  breadcrumb?: BreadcrumbItem;
  shouldRecurse: boolean;
}

/**
 * Matcher for combined route paths like ":id/edit" (feeds context).
 */
export class FeedEditPatternMatcher {
  match(
    routePath: string,
    route: ActivatedRouteSnapshot,
    context: MatchContext,
  ): MatchResult {
    if (!routePath.includes("/") || !routePath.includes(":")) {
      return { handled: false, shouldRecurse: false };
    }

    const parts = routePath.split("/");
    const paramPart = parts.find((p) => p.startsWith(":"));

    // Handle ":id/edit" pattern for feeds
    if (paramPart === ":id" && parts[1] === "edit") {
      // Check if we're in feeds context
      const isFeedsContext = this.isFeedsContext(route);
      if (isFeedsContext) {
        const paramValue = route.params["id"] || route.paramMap.get("id");
        const labelKey = `id:${paramValue}`;
        const dynamicLabel = context.dynamicLabels.get(labelKey);

        const label = dynamicLabel || "Feed";
        return {
          handled: true,
          breadcrumb: { label, url: null },
          shouldRecurse: false,
        };
      }
    }

    return { handled: false, shouldRecurse: false };
  }

  private isFeedsContext(route: ActivatedRouteSnapshot): boolean {
    let parent = route.parent;
    while (parent) {
      const parentPath = parent.routeConfig?.path;
      if (parentPath === "feeds") {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }
}

/**
 * Matcher for article routes like "articles/:articleId".
 */
export class ArticleDetailPatternMatcher {
  match(
    routePath: string,
    _route: ActivatedRouteSnapshot,
    _context: MatchContext,
  ): MatchResult {
    if (!routePath.includes("/") || !routePath.includes(":")) {
      return { handled: false, shouldRecurse: false };
    }

    const parts = routePath.split("/");
    const paramPart = parts.find((p) => p.startsWith(":"));

    // Handle "articles/:articleId" pattern
    if (basePath === "articles" && paramPart) {
      const paramName = paramPart.substring(1);
      if (paramName === "id" || paramName === "articleId") {
        return {
          handled: true,
          breadcrumb: { label: "Article", url: null },
          shouldRecurse: false,
        };
      }
    }

    return { handled: false, shouldRecurse: false };
  }
}

/**
 * Matcher for parameterized routes (like :id without parent pattern).
 */
export class ParameterizedRouteMatcher {
  constructor(private articleMatcher: ArticleDetailPatternMatcher) {}

  match(
    routePath: string,
    route: ActivatedRouteSnapshot,
    context: MatchContext,
  ): MatchResult {
    if (!routePath.startsWith(":")) {
      return { handled: false, shouldRecurse: false };
    }

    const paramName = routePath.substring(1);
    const paramValue = route.params[paramName] || route.paramMap.get(paramName);

    // Check if this is an article detail route
    if (context.isArticleDetailRoute(route)) {
      return {
        handled: true,
        breadcrumb: { label: "Article", url: null },
        shouldRecurse: false,
      };
    }

    // Check for dynamic label
    const labelKey = `${paramName}:${paramValue}`;
    const dynamicLabel = context.dynamicLabels.get(labelKey);

    if (dynamicLabel) {
      const url = context.buildUrl(route);
      return {
        handled: true,
        breadcrumb: { label: dynamicLabel, url },
        shouldRecurse: true,
      };
    }

    // For numeric IDs without labels, skip breadcrumb
    if (paramName === "id" && paramValue && /^\d+$/.test(String(paramValue))) {
      return { handled: false, shouldRecurse: true };
    }

    // Default: use param value as label
    const url = context.buildUrl(route);
    return {
      handled: true,
      breadcrumb: { label: String(paramValue || paramName), url },
      shouldRecurse: true,
    };
  }
}

/**
 * Matcher for regular (non-parameterized) routes.
 */
export class RegularRouteMatcher {
  match(
    routePath: string,
    route: ActivatedRouteSnapshot,
    context: MatchContext,
    labelResolver: (path: string, route: ActivatedRouteSnapshot) => string,
  ): MatchResult {
    if (routePath.startsWith(":")) {
      return { handled: false, shouldRecurse: false };
    }

    // Skip "articles" segment if there's an article detail child
    if (
      routePath === "articles" &&
      this.hasArticleDetailChild(route, context)
    ) {
      return { handled: false, shouldRecurse: true };
    }

    const label = labelResolver(routePath, route);
    const url = context.buildUrl(route);

    return {
      handled: true,
      breadcrumb: { label, url },
      shouldRecurse: true,
    };
  }

  private hasArticleDetailChild(
    route: ActivatedRouteSnapshot,
    context: MatchContext,
  ): boolean {
    let current: ActivatedRouteSnapshot | null = route.firstChild;
    while (current) {
      if (context.isArticleDetailRoute(current)) {
        return true;
      }
      current = current.firstChild;
    }
    return false;
  }
}
