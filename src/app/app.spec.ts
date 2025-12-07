import { TestBed } from "@angular/core/testing";
import { AppComponent } from "./app";
import { SwUpdate } from "@angular/service-worker";
import { KeyboardShortcutsService } from "./core/services/keyboard-shortcuts.service";

describe("AppComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: false,
            versionUpdates: {
              pipe: () => ({
                subscribe: () => {},
              }),
            },
          },
        },
        {
          provide: KeyboardShortcutsService,
          useValue: {
            init: () => {},
          },
        },
      ],
    }).compileComponents();
  });

  it("should create the app", () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
