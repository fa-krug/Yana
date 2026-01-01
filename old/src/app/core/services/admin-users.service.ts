import { Injectable, inject } from "@angular/core";
import { Observable, from, map } from "rxjs";

import { TRPCService } from "../trpc/trpc.service";

export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperuser: boolean;
  isStaff: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUsers {
  items: User[];
  count: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  isSuperuser?: boolean;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isSuperuser?: boolean;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isSuperuser?: boolean;
}

export interface MessageResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: "root",
})
export class AdminUsersService {
  private trpc = inject(TRPCService);

  listUsers(params: ListUsersParams = {}): Observable<PaginatedUsers> {
    return from(
      this.trpc.client.admin.user.list.query({
        page: params.page || 1,
        pageSize: params.pageSize || 50,
        search: params.search,
        isSuperuser: params.isSuperuser,
      }),
    ).pipe(
      map((response) => ({
        items: response.items || [],
        count: response.count || 0,
        page: response.page || 1,
        pageSize: response.pageSize || 50,
        pages: response.pages || 0,
      })),
    );
  }

  getUser(id: number): Observable<User> {
    return from(this.trpc.client.admin.user.getById.query({ id })).pipe(
      map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        isSuperuser: user.isSuperuser,
        isStaff: user.isStaff,
        createdAt: String(user.createdAt),
        updatedAt: String(user.updatedAt),
      })),
    );
  }

  createUser(data: CreateUserRequest): Observable<User> {
    return from(
      this.trpc.client.admin.user.create.mutate({
        username: data.username,
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        isSuperuser: data.isSuperuser,
      }),
    ).pipe(
      map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        isSuperuser: user.isSuperuser,
        isStaff: user.isStaff,
        createdAt: String(user.createdAt),
        updatedAt: String(user.updatedAt),
      })),
    );
  }

  updateUser(id: number, data: UpdateUserRequest): Observable<User> {
    return from(
      this.trpc.client.admin.user.update.mutate({
        id,
        data: {
          username: data.username,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          isSuperuser: data.isSuperuser,
        },
      }),
    ).pipe(
      map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        isSuperuser: user.isSuperuser,
        isStaff: user.isStaff,
        createdAt: String(user.createdAt),
        updatedAt: String(user.updatedAt),
      })),
    );
  }

  changePassword(
    id: number,
    data: ChangePasswordRequest,
  ): Observable<MessageResponse> {
    return from(
      this.trpc.client.admin.user.resetPassword.mutate({
        id,
        newPassword: data.newPassword,
      }),
    );
  }

  deleteUser(id: number): Observable<MessageResponse> {
    return from(this.trpc.client.admin.user.delete.mutate({ id }));
  }
}
