/**
 * Custom route preloading strategy.
 * Preloads frequently accessed routes when the browser is idle.
 */

import { Injectable } from "@angular/core";
import { PreloadingStrategy, Route } from "@angular/router";
import { Observable, timer } from "rxjs";
import { mergeMap } from "rxjs/operators";

@Injectable({
  providedIn: "root",
})
export class CustomPreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    // Preload routes that have data.preload = true
    if (route.data && route.data["preload"]) {
      // Wait for browser to be idle (500ms delay)
      return timer(500).pipe(mergeMap(() => load()));
    }
    // Don't preload other routes
    return new Observable((subscriber) => subscriber.complete());
  }
}
