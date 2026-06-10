import React from "react";
import { Heading, Text, Paragraph, Strong, Link } from "@dynatrace/strato-components/typography";
import { Flex } from "@dynatrace/strato-components/layouts";

export function HelpContent() {
  return (
    <div style={{ padding: "8px 0", maxWidth: 700 }}>
      <Heading level={5}>About Pattern Problems</Heading>
      <Paragraph style={{ marginBottom: 16 }}>
        This app identifies common anti-patterns in distributed application architectures that cause
        unnecessary load on databases, networks, and downstream services. By detecting these patterns
        early, teams can reduce cloud costs, improve latency, and increase scalability.
      </Paragraph>

      <Heading level={5}>Detected Patterns</Heading>

      <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(194,25,48,0.2)", background: "rgba(194,25,48,0.03)" }}>
        <Strong>N+1 Query Pattern</Strong>
        <Paragraph style={{ margin: "4px 0 0" }}>
          The most common performance anti-pattern. Instead of fetching all related data in a single query,
          the application makes 1 query to get a list of N items, then N additional queries to fetch related
          data for each item. This results in N+1 total round-trips to the database.
        </Paragraph>
        <Text style={{ fontSize: 12, opacity: 0.6, display: "block", marginTop: 8 }}>
          Common causes: ORM lazy loading, missing batch fetching, bypassed data caches
        </Text>
      </div>

      <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(255,131,43,0.2)", background: "rgba(255,131,43,0.03)" }}>
        <Strong>Chatty API Pattern</Strong>
        <Paragraph style={{ margin: "4px 0 0" }}>
          Services making excessive fine-grained calls to downstream services instead of batch or
          aggregate calls. Each call adds network latency, serialization overhead, and connection
          pool pressure.
        </Paragraph>
        <Text style={{ fontSize: 12, opacity: 0.6, display: "block", marginTop: 8 }}>
          Common causes: Fine-grained REST APIs, missing BFF (Backend-for-Frontend), micro-service over-decomposition
        </Text>
      </div>

      <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(165,110,255,0.2)", background: "rgba(165,110,255,0.03)" }}>
        <Strong>Circular Dependency Pattern</Strong>
        <Paragraph style={{ margin: "4px 0 0" }}>
          Service A calls Service B which calls back to Service A (directly or via intermediate services).
          This creates deadlock risks, cascading failures, and makes independent deployment impossible.
        </Paragraph>
        <Text style={{ fontSize: 12, opacity: 0.6, display: "block", marginTop: 8 }}>
          Common causes: Improper service boundaries, shared state, event loops without guards
        </Text>
      </div>

      <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(69,137,255,0.2)", background: "rgba(69,137,255,0.03)" }}>
        <Strong>Slow Consumer Pattern</Strong>
        <Paragraph style={{ margin: "4px 0 0" }}>
          A downstream service or consumer processes messages/requests significantly slower than the
          producer sends them. This leads to queue buildup, increased memory usage, timeouts,
          and eventual cascading back-pressure.
        </Paragraph>
        <Text style={{ fontSize: 12, opacity: 0.6, display: "block", marginTop: 8 }}>
          Common causes: Synchronous processing of async events, missing rate limiting, resource contention
        </Text>
      </div>

      <Heading level={5}>How It Works</Heading>
      <Paragraph style={{ marginBottom: 8 }}>
        The app queries Dynatrace distributed traces (spans) and service dependencies to detect:
      </Paragraph>
      <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20, opacity: 0.85 }}>
        <li><Strong>N+1 Queries:</Strong> Spans with <code>aggregation.count &gt; 1</code> on database calls</li>
        <li><Strong>Chatty APIs:</Strong> High fan-out from a single parent span to many child service calls</li>
        <li><Strong>Circular Dependencies:</Strong> Trace paths where the same service appears multiple times</li>
        <li><Strong>Slow Consumers:</Strong> Large duration variance between producer and consumer spans</li>
      </ul>

      <Heading level={5} style={{ marginTop: 20 }}>Impact Analysis</Heading>
      <Paragraph>
        The Impact Analysis tab estimates the business cost of each pattern problem including:
        unnecessary cloud spend (extra compute, network, I/O), increased latency affecting user
        experience, and scalability ceilings that limit growth.
      </Paragraph>

      <Heading level={5} style={{ marginTop: 20 }}>Resources</Heading>
      <Paragraph>
        <Link href="https://www.youtube.com/watch?v=TJtroXEWf6U" target="_blank">Video: Patterns from Logs & Traces</Link>
      </Paragraph>
      <Paragraph>
        <Link href="https://www.google.com/search?q=n%2B1+query+problem" target="_blank">Learn about the N+1 Query Problem</Link>
      </Paragraph>
    </div>
  );
}
