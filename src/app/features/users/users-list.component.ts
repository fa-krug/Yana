/**
 * Users list component - displays and manages users (admin only).
 *
 * @component
 * @standalone
 *
 * Features:
 * - Displays paginated list of users
 * - Search and filter users
 * - User management (create, update, promote to superuser, change password)
 * - Responsive table layout
 */

import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
// Angular Material
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatChipsModule } from "@angular/material/chips";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatMenuModule } from "@angular/material/menu";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTableModule } from "@angular/material/table";
import { MatTooltipModule } from "@angular/material/tooltip";
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from "rxjs";

// Application
import {
  AdminUsersService,
  User,
  PaginatedUsers,
} from "@app/core/services/admin-users.service";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "@app/shared/components/confirm-dialog.component";

import { AdminChangePasswordDialogComponent } from "./admin-change-password-dialog.component";
import { UserCreateDialogComponent } from "./user-create-dialog.component";
import { UserEditDialogComponent } from "./user-edit-dialog.component";

@Component({
  selector: "app-users-list",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatMenuModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatChipsModule,
  ],
  template: `
    <div class="users-list-container container-lg animate-fade-in">
      <div class="header">
        <h1>Users</h1>
      </div>

      <mat-card class="filters-card">
        <mat-card-content>
          <div class="filters">
            <mat-form-field appearance="outline" class="search-field">
              <mat-label>Search users</mat-label>
              <input matInput [formControl]="searchControl" />
              <mat-icon matPrefix>search</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="filter-field">
              <mat-label>User Type</mat-label>
              <mat-select [formControl]="superuserControl">
                <mat-option [value]="null">All Users</mat-option>
                <mat-option [value]="true">Superusers</mat-option>
                <mat-option [value]="false">Regular Users</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
        </mat-card-content>
        <mat-card-actions>
          <button
            mat-raised-button
            color="primary"
            (click)="openCreateDialog()"
          >
            <mat-icon>add</mat-icon>
            Create User
          </button>
        </mat-card-actions>
      </mat-card>

      <mat-card class="users-card">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="50"></mat-spinner>
          </div>
        } @else if (usersData(); as data) {
          <!-- Desktop table view -->
          <table
            mat-table
            [dataSource]="data.items"
            class="users-table desktop-view"
          >
            <ng-container matColumnDef="username">
              <th mat-header-cell *matHeaderCellDef>Username</th>
              <td mat-cell *matCellDef="let user">{{ user.username }}</td>
            </ng-container>

            <ng-container matColumnDef="email">
              <th mat-header-cell *matHeaderCellDef>Email</th>
              <td mat-cell *matCellDef="let user">{{ user.email }}</td>
            </ng-container>

            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let user">
                {{
                  user.firstName || user.lastName
                    ? (user.firstName + " " + user.lastName).trim()
                    : "-"
                }}
              </td>
            </ng-container>

            <ng-container matColumnDef="isSuperuser">
              <th mat-header-cell *matHeaderCellDef>Superuser</th>
              <td mat-cell *matCellDef="let user">
                @if (user.isSuperuser) {
                  <mat-chip>Superuser</mat-chip>
                } @else {
                  <span>-</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="createdAt">
              <th mat-header-cell *matHeaderCellDef>Created</th>
              <td mat-cell *matCellDef="let user">
                {{ formatDate(user.createdAt) }}
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let user">
                <button
                  mat-icon-button
                  [matMenuTriggerFor]="menu"
                  [matTooltip]="'User actions'"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="openEditDialog(user)">
                    <mat-icon>edit</mat-icon>
                    <span>Edit</span>
                  </button>
                  <button
                    mat-menu-item
                    (click)="openChangePasswordDialog(user)"
                  >
                    <mat-icon>lock</mat-icon>
                    <span>Change Password</span>
                  </button>
                  <button
                    mat-menu-item
                    (click)="openDeleteDialog(user)"
                    class="delete-action"
                  >
                    <mat-icon>delete</mat-icon>
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
          </table>

          <!-- Mobile card view -->
          <div class="users-cards mobile-view">
            @for (user of data.items; track user.id) {
              <mat-card class="user-card">
                <mat-card-header>
                  <div class="user-header-content">
                    <mat-card-title>{{ user.username }}</mat-card-title>
                    <mat-card-subtitle>{{ user.email }}</mat-card-subtitle>
                  </div>
                  <button
                    mat-icon-button
                    [matMenuTriggerFor]="mobileMenu"
                    class="card-menu"
                  >
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #mobileMenu="matMenu">
                    <button mat-menu-item (click)="openEditDialog(user)">
                      <mat-icon>edit</mat-icon>
                      <span>Edit</span>
                    </button>
                    <button
                      mat-menu-item
                      (click)="openChangePasswordDialog(user)"
                    >
                      <mat-icon>lock</mat-icon>
                      <span>Change Password</span>
                    </button>
                    <button
                      mat-menu-item
                      (click)="openDeleteDialog(user)"
                      class="delete-action"
                    >
                      <mat-icon>delete</mat-icon>
                      <span>Delete</span>
                    </button>
                  </mat-menu>
                </mat-card-header>
                <mat-card-content>
                  <div class="user-details">
                    <div class="user-detail-row">
                      <span class="detail-label">Name:</span>
                      <span class="detail-value">
                        {{
                          user.firstName || user.lastName
                            ? (user.firstName + " " + user.lastName).trim()
                            : "-"
                        }}
                      </span>
                    </div>
                    <div class="user-detail-row">
                      <span class="detail-label">Superuser:</span>
                      <span class="detail-value">
                        @if (user.isSuperuser) {
                          <mat-chip>Superuser</mat-chip>
                        } @else {
                          <span>-</span>
                        }
                      </span>
                    </div>
                    <div class="user-detail-row">
                      <span class="detail-label">Created:</span>
                      <span class="detail-value">
                        {{ formatDate(user.createdAt) }}
                      </span>
                    </div>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>

          <mat-paginator
            [length]="data.count"
            [pageSize]="data.pageSize"
            [pageIndex]="data.page - 1"
            [pageSizeOptions]="[10, 25, 50, 100]"
            (page)="onPageChange($event)"
            showFirstLastButtons
          ></mat-paginator>
        } @else {
          <div class="empty-state">
            <mat-icon>people</mat-icon>
            <p>No users found</p>
          </div>
        }
      </mat-card>
    </div>
  `,
  styles: [
    `
      .users-list-container {
        padding: 16px;
      }

      .header {
        margin-bottom: 16px;
      }

      .header h1 {
        margin: 0;
        font-size: 2.5rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--mat-sys-on-surface);
      }

      .filters-card {
        margin-bottom: 24px;
      }

      mat-card-actions {
        padding: 0 16px 12px 16px !important;
        display: flex;
        gap: 8px;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: flex-end;
      }

      mat-card-actions button {
        font-weight: 500;
        transition: all 0.2s ease;
      }

      mat-card-actions button mat-icon {
        margin-right: 8px;
      }

      .filters {
        display: flex;
        gap: 16px;
        margin-bottom: 0;
        flex-wrap: wrap;
      }

      .search-field {
        flex: 1;
        min-width: 200px;
      }

      .filter-field {
        min-width: 150px;
      }

      .users-card {
        padding: 0;
        background-color: transparent;
      }

      .users-card ::ng-deep .mat-mdc-card-content {
        padding: 0 !important;
      }

      .users-cards {
        display: flex;
        flex-direction: column;
        background-color: rgba(0, 0, 0, 0.02);
      }

      .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 48px;
      }

      .users-table {
        width: 100%;
      }

      .users-table th,
      .users-table td {
        padding: 12px 16px;
      }

      .desktop-view {
        display: table;
      }

      .mobile-view {
        display: none;
      }

      .users-cards {
        display: flex;
        flex-direction: column;
      }

      .users-cards > * + * {
        margin-top: 16px;
      }

      .user-card {
        border-radius: 0;
        margin: 0;
        display: block;
      }

      .user-card mat-card-header {
        position: relative;
        padding: 12px 56px 8px 16px;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 16px;
      }

      .user-header-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        max-width: calc(100% - 56px);
      }

      .card-menu {
        position: absolute;
        top: 12px;
        right: 12px;
        opacity: 0.7;
        transition: opacity 0.2s ease;
      }

      .user-card:hover .card-menu {
        opacity: 1;
      }

      .user-card mat-card-title {
        font-size: 1.125rem !important;
        font-weight: 500 !important;
        margin: 0 0 2px 0 !important;
        line-height: 1.3 !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
        word-break: break-word;
      }

      .user-card mat-card-subtitle {
        font-size: 0.8125rem !important;
        opacity: 0.7;
        margin: 0 !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .user-card mat-card-content {
        padding: 8px 16px !important;
      }

      .user-details {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .user-detail-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .detail-label {
        font-size: 0.75rem;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .detail-value {
        font-size: 0.875rem;
        color: rgba(0, 0, 0, 0.87);
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px;
        color: rgba(0, 0, 0, 0.54);
      }

      .empty-state mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
      }

      mat-paginator {
        border-top: 1px solid rgba(0, 0, 0, 0.12);
        padding: 16px 0;
      }

      @media (max-width: 600px) {
        .users-list-container {
          padding: 24px 0 !important;
        }

        .header {
          padding: 16px;
          margin-bottom: 12px;
        }

        .header h1 {
          font-size: 1.5rem;
          margin-bottom: 0;
        }

        .filters-card {
          border-radius: 0;
          margin: 0 0 16px 0;
        }

        mat-card-actions {
          flex-wrap: wrap;
          padding: 8px 10px;
        }

        mat-card-actions button {
          width: 100%;
        }

        .filters {
          flex-direction: column;
          padding: 16px;
        }

        .search-field,
        .filter-field {
          width: 100%;
        }

        .users-card {
          border-radius: 0;
          margin: 0 0 16px 0;
        }

        .desktop-view {
          display: none !important;
        }

        .mobile-view {
          display: flex !important;
        }

        .users-cards {
          display: flex !important;
          flex-direction: column !important;
          background-color: rgba(0, 0, 0, 0.02) !important;
          padding: 16px 0 !important;
        }

        .users-cards > * + * {
          margin-top: 16px !important;
        }

        .user-card {
          border-radius: 0;
          margin: 0 !important;
          padding: 0;
          display: block !important;
        }

        .user-card mat-card-header {
          padding: 12px 16px 8px 16px;
        }

        .user-card mat-card-content {
          padding: 8px 16px !important;
        }

        mat-paginator {
          padding: 16px 0 !important;
        }
      }

      .delete-action {
        color: #f44336 !important;
      }

      .delete-action:hover {
        background: rgba(244, 67, 54, 0.08) !important;
      }

      /* Ensure the inner menu text inherits the red color */
      .delete-action .mat-mdc-menu-item-text {
        color: inherit !important;
      }

      /* Ensure the icon inherits the red color too */
      .delete-action mat-icon {
        color: inherit !important;
      }
    `,
  ],
})
export class UsersListComponent implements OnInit, OnDestroy {
  private usersService = inject(AdminUsersService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();

  searchControl = new FormControl("");
  superuserControl = new FormControl<boolean | null>(null);

  loading = signal(false);
  usersData = signal<PaginatedUsers | null>(null);

  displayedColumns: string[] = [
    "username",
    "email",
    "name",
    "isSuperuser",
    "createdAt",
    "actions",
  ];

  ngOnInit(): void {
    // Debounce search input
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadUsers();
      });

    // Reload when filter changes
    this.superuserControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadUsers();
      });

    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(page?: number, pageSize?: number): void {
    this.loading.set(true);
    const currentData = this.usersData();
    const params = {
      page: page ?? currentData?.page ?? 1,
      pageSize: pageSize ?? currentData?.pageSize ?? 50,
      search: this.searchControl.value || undefined,
      isSuperuser: this.superuserControl.value ?? undefined,
    };

    this.usersService
      .listUsers(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.usersData.set(data);
          this.loading.set(false);
        },
        error: (_error) => {
          this.snackBar.open("Failed to load users", "Close", {
            duration: 3000,
          });
          this.loading.set(false);
        },
      });
  }

  onPageChange(event: PageEvent): void {
    this.loadUsers(event.pageIndex + 1, event.pageSize);
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(UserCreateDialogComponent, {
      width: "600px",
      maxWidth: "95vw",
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        if (result) {
          this.loadUsers();
        }
      });
  }

  openEditDialog(user: User): void {
    const dialogRef = this.dialog.open(UserEditDialogComponent, {
      width: "600px",
      data: user,
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        if (result) {
          // If user was deleted, refresh the list
          if (result === "deleted") {
            this.snackBar.open("User deleted successfully", "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
          }
          this.loadUsers();
        }
      });
  }

  openChangePasswordDialog(user: User): void {
    const dialogRef = this.dialog.open(AdminChangePasswordDialogComponent, {
      width: "500px",
      data: { userId: user.id, username: user.username },
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        if (result) {
          this.snackBar.open("Password changed successfully", "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
        }
      });
  }

  openDeleteDialog(user: User): void {
    const dialogData: ConfirmDialogData = {
      title: "Delete User",
      message: `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmColor: "warn",
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: "500px",
      data: dialogData,
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.deleteUser(user);
        }
      });
  }

  deleteUser(user: User): void {
    this.loading.set(true);
    this.usersService
      .deleteUser(user.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open("User deleted successfully", "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
          this.loadUsers();
        },
        error: (error) => {
          this.snackBar.open(
            error?.message || "Failed to delete user",
            "Close",
            {
              duration: 3000,
            },
          );
          this.loading.set(false);
        },
      });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  }
}

// Admin change password dialog component will be in a separate file
