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

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from "rxjs";

// Angular Material
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatTableModule } from "@angular/material/table";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatChipsModule } from "@angular/material/chips";

// Application
import {
  AdminUsersService,
  User,
  PaginatedUsers,
} from "../../core/services/admin-users.service";
import { UserEditDialogComponent } from "./user-edit-dialog.component";
import { UserCreateDialogComponent } from "./user-create-dialog.component";
import { AdminChangePasswordDialogComponent } from "./admin-change-password-dialog.component";

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
        <button mat-raised-button color="primary" (click)="openCreateDialog()">
          <mat-icon>add</mat-icon>
          Create User
        </button>
      </div>

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

      <mat-card class="users-card">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="50"></mat-spinner>
          </div>
        } @else if (usersData(); as data) {
          <table mat-table [dataSource]="data.items" class="users-table">
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
                </mat-menu>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
          </table>

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
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .header h1 {
        margin: 0;
      }

      .filters {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
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
      }

      @media (max-width: 600px) {
        .header {
          flex-direction: column;
          align-items: flex-start;
          gap: 16px;
        }

        .filters {
          flex-direction: column;
        }

        .search-field,
        .filter-field {
          width: 100%;
        }
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

    this.usersService.listUsers(params).subscribe({
      next: (data) => {
        this.usersData.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.snackBar.open("Failed to load users", "Close", { duration: 3000 });
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
    });

    dialogRef.afterClosed().subscribe((result) => {
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

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  openChangePasswordDialog(user: User): void {
    const dialogRef = this.dialog.open(AdminChangePasswordDialogComponent, {
      width: "500px",
      data: { userId: user.id, username: user.username },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.snackBar.open("Password changed successfully", "Close", {
          duration: 3000,
        });
      }
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
