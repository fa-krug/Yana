/**
 * Breadcrumb service for tracking navigation hierarchy.
 */

import { Injectable, inject, signal } from "@angular/core";
import { Router, NavigationEnd, ActivatedRouteSnapshot } from "@angular/router";
import { filter, map } from "rxjs/operators";

import {
  FeedEditPatternMatcher,
  ArticleDetailPatternMatcher,
  ParameterizedRouteMatcher,
  RegularRouteMatcher,
  type MatchContext,
} from "./breadcrumb-matcher";

export interface BreadcrumbItem {
  label: string;
  url: string | null;
}

@Injectable({
  providedIn: "root",
})
export class BreadcrumbService {
  private router = inject(Router);

  // Store dynamic labels (e.g., feed names, article titles)
  private dynamicLabels = signal<Map<string, string>>(new Map());

  // Current breadcrumbs
  breadcrumbs = signal<BreadcrumbItem[]>([]);

  // Pattern matchers
  private feedEditMatcher = new FeedEditPatternMatcher();
  private articleDetailMatcher = new ArticleDetailPatternMatcher();
  private parameterizedMatcher = new ParameterizedRouteMatcher(
    this.articleDetailMatcher,
  );
  private regularMatcher = new RegularRouteMatcher();

  constructor() {
    // Listen to route changes
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        map(() => this.router.routerState.snapshot.root),
      )
      .subscribe(() => {
        this.updateBreadcrumbs();
      });

    // Initial breadcrumb update
    this.updateBreadcrumbs();
  }

  /**
   * Set a dynamic label for a route parameter (e.g., feed name, article title).
   */
  setLabel(key: string, label: string) {
    const labels = new Map(this.dynamicLabels());
    labels.set(key, label);
    this.dynamicLabels.set(labels);
    this.updateBreadcrumbs();
  }

  /**
   * Clear a dynamic label.
   */
  clearLabel(key: string) {
    const labels = new Map(this.dynamicLabels());
    labels.delete(key);
    this.dynamicLabels.set(labels);
    this.updateBreadcrumbs();
  }

  /**
   * Update breadcrumbs based on current route.
   */
  private updateBreadcrumbs() {
    const route = this.router.routerState.snapshot.root;
    const breadcrumbs: BreadcrumbItem[] = [];

    // Always start with Home
    breadcrumbs.push({ label: "Home", url: "/" });

    // Build breadcrumbs from route segments
    this.buildBreadcrumbs(route, breadcrumbs);

    this.breadcrumbs.set(breadcrumbs);
  }

  /**
   * Recursively build breadcrumbs from route segments.
   */
  private buildBreadcrumbs(
    route: ActivatedRouteSnapshot,
    breadcrumbs: BreadcrumbItem[],
  ) {
    const children = route.firstChild;

    if (!children) {
      return;
    }

    const routePath = children.routeConfig?.path;

    if (!routePath || routePath === "") {
      // Recurse into child routes
      this.buildBreadcrumbs(children, breadcrumbs);
      return;
    }

    // Create match context for pattern matchers
    const context: MatchContext = {
      dynamicLabels: this.dynamicLabels(),
      isArticleDetailRoute: (route) => this.isArticleDetailRoute(route),
      buildUrl: (route) => this.buildUrl(route),
    };

    // Try pattern matchers in order
    let match = this.feedEditMatcher.match(routePath, children, context);
    if (!match.handled) {
      match = this.articleDetailMatcher.match(routePath, children, context);
    }
    if (!match.handled) {
      match = this.parameterizedMatcher.match(routePath, children, context);
    }
    if (!match.handled) {
      match = this.regularMatcher.match(
        routePath,
        children,
        context,
        (path, route) => this.getRouteLabel(path, route),
      );
    }

    // Add breadcrumb if matched
    if (match.handled && match.breadcrumb) {
      breadcrumbs.push(match.breadcrumb);
    }

    // Recurse if needed
    if (match.shouldRecurse) {
      this.buildBreadcrumbs(children, breadcrumbs);
    }
  }

  /**
   * Check if the current route is an article detail route.
   */
  private isArticleDetailRoute(route: ActivatedRouteSnapshot): boolean {
    const routePath = route.routeConfig?.path;
    if (!routePath?.startsWith(":")) {
      return false;
    }

    const paramName = routePath.substring(1);

    // Check if this is an article ID parameter (id or articleId)
    if (paramName === "id" || paramName === "articleId") {
      // Check if any parent route is "articles"
      let parent = route.parent;
      while (parent) {
        const parentPath = parent.routeConfig?.path;
        if (parentPath === "articles") {
          return true;
        }
        parent = parent.parent;
      }
    }

    return false;
  }

  /**
   * Check if a route has an article detail child route.
   */
  private hasArticleDetailChild(route: ActivatedRouteSnapshot): boolean {
    let current: ActivatedRouteSnapshot | null = route.firstChild;
    while (current) {
      if (this.isArticleDetailRoute(current)) {
        return true;
      }
      current = current.firstChild;
    }
    return false;
  }

  /**
   * Get human-readable label for a route path.
   */
  private getRouteLabel(path: string, route: ActivatedRouteSnapshot): string {
    // Check for dynamic labels first
    if (path.includes(":")) {
      const paramName = path.split(":")[1];
      const paramValue = route.params[paramName];
      const dynamicLabel = this.dynamicLabels().get(
        `${paramName}:${paramValue}`,
      );
      if (dynamicLabel) {
        return dynamicLabel;
      }
    }

    // Check if we're in feeds context and on edit route - show "Feed" instead of "Edit"
    if (path === "edit") {
      let parent = route.parent;
      while (parent) {
        const parentPath = parent.routeConfig?.path;
        if (parentPath === "feeds" || parentPath === "") {
          // We're in feeds context, return "Feed" for edit route
          return "Feed";
        }
        parent = parent.parent;
      }
    }

    // Map route paths to labels
    const labelMap: Record<string, string> = {
      feeds: "Feeds",
      create: "Create Feed",
      edit: "Edit",
      articles: "Articles",
    };

    return labelMap[path] || path.charAt(0).toUpperCase() + path.slice(1);
  }

  /**
   * Build URL from route snapshot.
   */
  private buildUrl(route: ActivatedRouteSnapshot): string {
    const segments: string[] = [];
    let current: ActivatedRouteSnapshot | null = route;

    while (current) {
      const path = current.routeConfig?.path;
      if (path && path !== "") {
        if (path.startsWith(":")) {
          const paramName = path.substring(1);
          segments.push(current.params[paramName] || "");
        } else {
          segments.push(path);
        }
      }
      current = current.parent;
    }

    // Reverse to get correct order and build URL
    segments.reverse();
    return "/" + segments.join("/");
  }
}
