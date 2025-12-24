/**
 * Root application component.
 * Handles service worker updates and initializes keyboard shortcuts.
 */
import {
  Component,
  OnInit,
  inject,
  isDevMode,
  ChangeDetectionStrategy,
} from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { SwUpdate, VersionReadyEvent } from "@angular/service-worker";
import { filter } from "rxjs/operators";

import { KeyboardShortcutsService } from "./core/services/keyboard-shortcuts.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: "<router-outlet></router-outlet>",
  styleUrl: "./app.scss",
})
export class AppComponent implements OnInit {
  private keyboardShortcuts = inject(KeyboardShortcutsService);
  private swUpdate = inject(SwUpdate);

  title = "Yana";

  ngOnInit() {
    this.keyboardShortcuts.init();

    // Handle service worker updates without automatic reload
    if (!isDevMode() && this.swUpdate.isEnabled) {
      // Check for updates periodically, but don't auto-reload
      this.swUpdate.versionUpdates
        .pipe(
          filter(
            (evt): evt is VersionReadyEvent => evt.type === "VERSION_READY",
          ),
        )
        .subscribe(() => {
          // Update is available but don't reload automatically
          // The service worker will use the new version on next page load
          // Version update handled silently
        });
    }
  }
}
