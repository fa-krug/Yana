/**
 * Breadcrumb service for tracking navigation hierarchy.
 */

import { Injectable, inject, signal } from "@angular/core";
import { Router, NavigationEnd, ActivatedRouteSnapshot } from "@angular/router";
import { filter, map } from "rxjs/operators";

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

    // Check if route path is a combined path with parameter (e.g., ":id/edit", "articles/:articleId")
    if (routePath.includes("/") && routePath.includes(":")) {
      const parts = routePath.split("/");
      const paramPart = parts.find((p) => p.startsWith(":"));
      const basePath = parts[0];

      // Handle ":id/edit" pattern for feeds
      if (paramPart === ":id" && parts[1] === "edit") {
        // Check if we're in feeds context by checking all ancestor routes
        let parent = children.parent;
        let isFeedsContext = false;
        while (parent) {
          const parentPath = parent.routeConfig?.path;
          if (parentPath === "feeds") {
            isFeedsContext = true;
            break;
          }
          parent = parent.parent;
        }
        if (isFeedsContext) {
          // Check if we have a dynamic label for this feed (feed name)
          const paramValue =
            children.params["id"] || children.paramMap.get("id");
          const labelKey = `id:${paramValue}`;
          const dynamicLabel = this.dynamicLabels().get(labelKey);

          // Use feed name if available, otherwise fall back to "Feed"
          const label = dynamicLabel || "Feed";
          breadcrumbs.push({ label, url: null }); // null URL makes it non-clickable (current page)
          return;
        }
      }

      // Handle "articles/:articleId" pattern
      if (basePath === "articles" && paramPart) {
        const paramName = paramPart.substring(1);
        // Check if this is an article ID parameter
        if (paramName === "id" || paramName === "articleId") {
          // Use "Article" as the label for article detail pages
          breadcrumbs.push({ label: "Article", url: null }); // null URL makes it non-clickable (current page)
          // Don't recurse further - article detail is the final breadcrumb
          return;
        }
      }
    }

    // Skip if it's a parameterized route without a label
    if (routePath.startsWith(":")) {
      const paramName = routePath.substring(1);
      // Get param value from children params (Angular stores params on the route with the param)
      const paramValue =
        children.params[paramName] || children.paramMap.get(paramName);

      // Check if this is an article detail route
      const isArticleDetail = this.isArticleDetailRoute(children);
      if (isArticleDetail) {
        // Use "Article" as the label for article detail pages
        breadcrumbs.push({ label: "Article", url: null }); // null URL makes it non-clickable (current page)
        // Don't recurse further - article detail is the final breadcrumb
        return;
      }

      // Check if we have a dynamic label for this parameter
      // Component uses "id:${feed.id}" format
      const labelKey = `${paramName}:${paramValue}`;
      const dynamicLabel = this.dynamicLabels().get(labelKey);

      if (dynamicLabel) {
        const url = this.buildUrl(children);
        breadcrumbs.push({ label: dynamicLabel, url });
        // Continue to recurse into child routes
        this.buildBreadcrumbs(children, breadcrumbs);
        return;
      } else {
        // For numeric IDs without labels, skip adding breadcrumb
        // The parent route (e.g., "Feeds") will be shown instead
        if (
          paramName === "id" &&
          paramValue &&
          /^\d+$/.test(String(paramValue))
        ) {
          // Don't add a breadcrumb for numeric IDs without labels
          // Just recurse to child routes (e.g., "edit")
          this.buildBreadcrumbs(children, breadcrumbs);
          return;
        } else {
          const url = this.buildUrl(children);
          breadcrumbs.push({ label: paramValue || paramName, url });
        }
      }
    } else {
      // Regular route segment
      // Skip "articles" segment if we're going to show an article detail
      if (routePath === "articles" && this.hasArticleDetailChild(children)) {
        // Don't add "Articles" breadcrumb, just recurse
        this.buildBreadcrumbs(children, breadcrumbs);
        return;
      }

      const label = this.getRouteLabel(routePath, children);
      const url = this.buildUrl(children);
      breadcrumbs.push({ label, url });
    }

    // Recurse into child routes
    this.buildBreadcrumbs(children, breadcrumbs);
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
