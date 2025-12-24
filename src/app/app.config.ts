import { provideHttpClient, withFetch } from "@angular/common/http";
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideClientHydration } from "@angular/platform-browser";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { provideRouter, withPreloading } from "@angular/router";
import { provideServiceWorker } from "@angular/service-worker";
import { HotkeysService } from "@ngneat/hotkeys";

import { routes } from "./app.routes";
import { CustomPreloadingStrategy } from "./core/strategies/custom-preloading.strategy";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withPreloading(CustomPreloadingStrategy)),
    provideAnimationsAsync(),
    // HttpClient still needed for non-tRPC endpoints (rss, greader, etc.)
    // Use withFetch() for better SSR performance and compatibility
    provideHttpClient(withFetch()),
    provideClientHydration(),
    HotkeysService,
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000",
    }),
  ],
};
