import React from "react";
import ReactDOM from "react-dom/client";
import { AppRoot } from "@dynatrace/strato-components/core";
import { IntlProvider } from "react-intl";
import { App } from "./app/App";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <IntlProvider locale="en" defaultLocale="en">
    <AppRoot>
      <App />
    </AppRoot>
  </IntlProvider>
);
