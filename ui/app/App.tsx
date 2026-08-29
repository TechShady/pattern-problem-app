import { Page } from "@dynatrace/strato-components-preview/layouts";
import React, { useState } from "react";
import { Tabs, Tab } from "@dynatrace/strato-components-preview/navigation";
import { PatternOverview } from "./pages/PatternOverview";
import { NPlus1Details } from "./pages/NPlus1Details";
import { NPlus1Trends } from "./pages/NPlus1Trends";
import { ChattyAPIs } from "./pages/ChattyAPIs";
import { CircularDependencies } from "./pages/CircularDependencies";
import { SlowConsumers } from "./pages/SlowConsumers";
import { TimeframeProvider } from "./TimeframeContext";
import { DisclaimerModal } from "./components/DisclaimerModal";

export const App = () => {
  return (
    <TimeframeProvider>
      <DisclaimerModal />
      <Page>
        <Page.Main>
          <Tabs defaultIndex={0}>
            <Tab title="N+1 Overview">
              <PatternOverview />
            </Tab>
            <Tab title="N+1 Query Details">
              <NPlus1Details />
            </Tab>
            <Tab title="N+1 Trends">
              <NPlus1Trends />
            </Tab>
            <Tab title="Chatty APIs">
              <ChattyAPIs />
            </Tab>
            <Tab title="Circular Dependencies">
              <CircularDependencies />
            </Tab>
            <Tab title="Slow Consumers">
              <SlowConsumers />
            </Tab>
          </Tabs>
        </Page.Main>
      </Page>
    </TimeframeProvider>
  );
};
