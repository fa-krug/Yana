/**
 * Admin tasks component - container with tabs.
 */

import { CommonModule } from "@angular/common";
import { Component, ChangeDetectionStrategy } from "@angular/core";
import { MatTabsModule } from "@angular/material/tabs";
import { RouterModule } from "@angular/router";

import { MetricsComponent } from "./metrics.component";
import { TaskQueueComponent } from "./task-queue.component";
import { TasksListComponent } from "./tasks-list.component";

@Component({
  selector: "app-admin-tasks",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatTabsModule,
    MetricsComponent,
    TasksListComponent,
    TaskQueueComponent,
  ],
  template: `
    <div class="admin-tasks-container">
      <mat-tab-group>
        <mat-tab label="Metrics">
          <app-metrics></app-metrics>
        </mat-tab>
        <mat-tab label="Scheduled Tasks">
          <app-tasks-list></app-tasks-list>
        </mat-tab>
        <mat-tab label="Task Queue">
          <app-task-queue></app-task-queue>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [
    `
      .admin-tasks-container {
        padding: 0;
      }
    `,
  ],
})
export class AdminTasksComponent {}
