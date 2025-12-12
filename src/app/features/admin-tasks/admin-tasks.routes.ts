import { Routes } from "@angular/router";
import { adminGuard } from "@app/core/guards/admin.guard";
import { AdminTasksComponent } from "./admin-tasks.component";

export const ADMIN_TASKS_ROUTES: Routes = [
  {
    path: "",
    component: AdminTasksComponent,
    canActivate: [adminGuard],
  },
];
