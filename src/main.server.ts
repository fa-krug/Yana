import {
  bootstrapApplication,
  type BootstrapContext,
} from "@angular/platform-browser";
import { config } from "./app/app.server.config";
import { AppComponent } from "./app/app";

export default (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, config, context);
