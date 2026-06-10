import { Page } from "@dynatrace/strato-components-preview/layouts";
import React, { useState } from "react";
import { Tabs, Tab } from "@dynatrace/strato-components-preview/navigation";
import { PatternOverview } from "./pages/PatternOverview";
import { NPlus1Details } from "./pages/NPlus1Details";
import { NPlus1Trends } from "./pages/NPlus1Trends";
import { ChattyAPIs } from "./pages/ChattyAPIs";
import { CircularDependencies } from "./pages/CircularDependencies";
import { SlowConsumers } from "./pages/SlowConsumers";
import { ImpactAnalysis } from "./pages/ImpactAnalysis";
import { TimeframeProvider } from "./TimeframeContext";

export const App = () => {
  return (
    <TimeframeProvider>
      <Page>
        <Page.Main>
          <Tabs defaultIndex={0}>
            <Tab title="Overview">
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
            <Tab title="Impact Analysis">
              <ImpactAnalysis />
            </Tab>
          </Tabs>
        </Page.Main>
      </Page>
    </TimeframeProvider>
  );
};
