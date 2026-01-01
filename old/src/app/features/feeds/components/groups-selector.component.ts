/**
 * Groups selector component - handles group selection with autocomplete and chip display.
 */

import { CommonModule } from "@angular/common";
import { Component, input, output } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatChipsModule } from "@angular/material/chips";
import { MatDividerModule } from "@angular/material/divider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

import { Group } from "@app/core/models";

@Component({
  selector: "app-groups-selector",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  template: `
    <div class="groups-section">
      <h4>Groups</h4>
      <p class="section-description">
        Organize this feed into groups for easier filtering and management. Type
        to search existing groups or create a new one.
      </p>

      @if (selectedGroupIds().length > 0) {
        <div class="selected-groups">
          <mat-chip-set>
            @for (groupId of selectedGroupIds(); track groupId) {
              @let group = getGroupById(groupId);
              @if (group) {
                <mat-chip (removed)="onRemoveGroup(groupId)" class="group-chip">
                  {{ group.name }}
                  <button
                    matChipRemove
                    [attr.aria-label]="'remove ' + group.name"
                  >
                    <mat-icon>cancel</mat-icon>
                  </button>
                </mat-chip>
              }
            }
          </mat-chip-set>
        </div>
      }

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Add Group</mat-label>
        <input
          matInput
          [formControl]="groupInputControl()"
          [matAutocomplete]="groupAuto"
          (keydown.enter)="onGroupInputEnter($event)"
        />
        <mat-icon matPrefix>search</mat-icon>
        @if (creatingGroup()) {
          <mat-spinner matSuffix diameter="20"></mat-spinner>
        }
        <mat-autocomplete
          #groupAuto="matAutocomplete"
          [displayWith]="displayGroup"
          (optionSelected)="onGroupSelected($event)"
        >
          @for (group of filteredGroups(); track group.id) {
            <mat-option [value]="group">
              <mat-icon>folder</mat-icon>
              <span>{{ group.name }}</span>
            </mat-option>
          }
          @if (getCreateGroupOption() && filteredGroups().length > 0) {
            <mat-divider></mat-divider>
          }
          @if (getCreateGroupOption()) {
            <mat-option
              [value]="null"
              (onSelectionChange)="
                $event.isUserInput && onCreateGroupFromInput()
              "
              class="create-option"
            >
              <mat-icon>add_circle</mat-icon>
              <span>Create new group: "{{ getCreateGroupOption() }}"</span>
            </mat-option>
          }
          @if (
            filteredGroups().length === 0 &&
            !getCreateGroupOption() &&
            groupInputControl().value &&
            groupInputControl().value!.length > 0
          ) {
            <mat-option disabled>
              No groups found. Type a name and press Enter to create.
            </mat-option>
          }
        </mat-autocomplete>
        <mat-hint
          >Type to search existing groups or create a new one. Press Enter to
          create.</mat-hint
        >
      </mat-form-field>
    </div>
  `,
  styles: [
    `
      .groups-section {
        margin: 24px 0;
        padding: 16px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
      }

      .groups-section h4 {
        margin: 0 0 8px 0;
        font-size: 1.125rem;
        font-weight: 500;
      }

      .section-description {
        margin: 0 0 16px 0;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .selected-groups {
        margin-bottom: 16px;
      }

      .group-chip {
        background-color: #2196f3 !important;
        color: white !important;
      }

      .full-width {
        width: 100%;
      }

      .create-option {
        color: var(--mat-sys-primary);
      }
    `,
  ],
})
export class GroupsSelectorComponent {
  readonly groupInputControl = input.required<FormControl<string | null>>();
  readonly selectedGroupIds = input.required<number[]>();
  readonly filteredGroups = input.required<Group[]>();
  readonly creatingGroup = input.required<boolean>();
  readonly allGroups = input.required<Group[]>();

  readonly groupSelected = output<Group>();
  readonly groupRemoved = output<number>();
  readonly groupInputEnter = output<Event>();
  readonly createGroupFromInput = output<void>();

  protected getGroupById(groupId: number): Group | undefined {
    return this.allGroups().find((g) => g.id === groupId);
  }

  protected displayGroup(group: Group | null): string {
    return group?.name || "";
  }

  protected getCreateGroupOption(): string | null {
    const value = this.groupInputControl()?.value?.trim();
    if (!value || value.length === 0) {
      return null;
    }
    const exists = this.allGroups().some(
      (g) => g.name.toLowerCase() === value.toLowerCase(),
    );
    if (exists) {
      return null;
    }
    const alreadySelected = this.selectedGroupIds().some((id) => {
      const group = this.getGroupById(id);
      return group?.name.toLowerCase() === value.toLowerCase();
    });
    if (alreadySelected) {
      return null;
    }
    return value;
  }

  protected onGroupSelected(event: { option: { value: Group } } | Group): void {
    const group =
      typeof event === "object" && event != null && "option" in event
        ? event.option.value
        : event;
    if (group && typeof group === "object" && "id" in group && group.id) {
      this.groupSelected.emit(group);
    }
  }

  protected onRemoveGroup(groupId: number): void {
    this.groupRemoved.emit(groupId);
  }

  protected onGroupInputEnter(event: Event): void {
    this.groupInputEnter.emit(event);
  }

  protected onCreateGroupFromInput(): void {
    this.createGroupFromInput.emit();
  }
}
