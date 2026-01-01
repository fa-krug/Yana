import {
  bootstrapApplication,
  type BootstrapContext,
} from "@angular/platform-browser";

import { AppComponent } from "./app/app";
import { config } from "./app/app.server.config";

export default (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, config, context);
