import React from "react";
import { Heading, Text, Paragraph, Strong, Link } from "@dynatrace/strato-components/typography";
import { Flex } from "@dynatrace/strato-components/layouts";

type DqlTile = { tile: string; query: string };
type DqlTab = { tab: string; tiles: DqlTile[] };

// The DQL behind every tile, grouped by tab. `{timeframe}` is the selected
// timeframe (e.g. now()-2h) and `{bin}` is the auto-selected sparkline bin size.
const DQL_BY_TAB: DqlTab[] = [
  {
    tab: "N+1 Overview",
    tiles: [
      {
        tile: "KPI — N+1 spans",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| summarize total_spans = count()`,
      },
      {
        tile: "KPI — Total DB queries",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null"
| summarize s = sum(aggregation.count)`,
      },
      {
        tile: "KPI — Avg queries per N+1 span",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| summarize total_aggregation_count = sum(aggregation.count), total_spans = count()
| fieldsAdd average_count = total_aggregation_count / total_spans`,
      },
      {
        tile: "KPI — Max queries per N+1 span",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| summarize total_aggregation_count = max(aggregation.count)`,
      },
      {
        tile: "KPI — Query reduction potential",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null"
| summarize c=count(), s= sum(aggregation.count),
            c1=countif(aggregation.count > 1), s1=sum(if(aggregation.count > 1, aggregation.count))
| fieldsAdd queryReduction = ((toDouble(s1)-toDouble(c1)) / toDouble(s)) * 100,
            reducibleQueries = (toDouble(s1)-toDouble(c1))`,
      },
      {
        tile: "Top N+1 services",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| fields aggregation.count, service_name = entityName(dt.entity.service), service_id = toString(dt.entity.service)
| summarize count=sum(aggregation.count), by:{service_name, service_id}
| sort count desc
| limit 10`,
      },
      {
        tile: "Top N+1 databases",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| fields db.system, aggregation.count
| summarize count=sum(aggregation.count), by:{db.system}
| sort count desc
| limit 10`,
      },
      {
        tile: "KPI sparklines (over time)",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| summarize n1_count = count(), total_queries = sum(aggregation.count), avg_per_span = avg(toDouble(aggregation.count)), max_per_span = max(aggregation.count), by:{timeframe = bin(end_time, {bin})}
| sort timeframe`,
      },
    ],
  },
  {
    tab: "N+1 Query Details",
    tiles: [
      {
        tile: "Top N+1 spans table",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 10
| fieldsAdd trace_id = toString(trace.id), span_id = toString(span.id)
| fields \`N+1 Count\` = aggregation.count,
         \`Query\` = if(isNotNull(db.query.text), db.query.text, else: if(isNotNull(db.operation.name), db.operation.name, else: code.function)),
         trace.id,
         span.id,
         span.name,
         \`Service Name\` = entityName(dt.entity.service),
         \`Endpoint\` = if(isnull(endpoint.name), span.name, else: endpoint.name),
         \`DB\` = db.system,
         dt.entity.service
| sort \`N+1 Count\` desc
| limit 200`,
      },
    ],
  },
  {
    tab: "N+1 Trends",
    tiles: [
      {
        tile: "Scatter / heatmap of N+1 spans",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 10
| fields end_time, aggregation.count, service_name = entityName(dt.entity.service), db.system
| sort aggregation.count desc
| limit 5000`,
      },
      {
        tile: "KPI — Annual projection",
        query: `fetch spans, from: now()-7d
| filter db.system != "null"
| summarize c=count(), s= sum(aggregation.count),
            c1=countif(aggregation.count > 1), s1=sum(if(aggregation.count > 1, aggregation.count))
| fieldsAdd queryReduction = (toDouble(s1)-toDouble(c1))*52`,
      },
    ],
  },
  {
    tab: "Chatty APIs",
    tiles: [
      {
        tile: "Chatty traces (high fan-out per trace)",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller_service = entityName(dt.entity.service),
            caller_id = toString(dt.entity.service),
            trace_id = toString(trace.id)
| summarize call_count = count(),
            distinct_targets = countDistinctExact(span.name),
            by: { caller_service, caller_id, trace_id }
| filter call_count > 20
| sort call_count desc
| limit 100`,
      },
      {
        tile: "Service-level chatty summary",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller_service = entityName(dt.entity.service),
            caller_id = toString(dt.entity.service)
| summarize total_calls = count(),
            by: { caller_service, caller_id }
| filter total_calls > 50
| sort total_calls desc
| limit 20`,
      },
      {
        tile: "KPI sparklines (over time)",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller_service = entityName(dt.entity.service),
            trace_id = toString(trace.id)
| summarize call_count = count(), by: { caller_service, trace_id, timeframe = bin(end_time, {bin}) }
| filter call_count > 20
| summarize chatty_traces = count(), total_calls = sum(call_count), by: { timeframe }
| sort timeframe`,
      },
    ],
  },
  {
    tab: "Circular Dependencies",
    tiles: [
      {
        tile: "Services appearing >1x per trace",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            service_id = toString(dt.entity.service),
            trace_id_str = toString(trace.id)
| summarize service_appearances = count(),
            by: { trace_id_str, service_name, service_id }
| filter service_appearances > 1
| summarize circular_traces = count(),
            avg_revisits = avg(toDouble(service_appearances)),
            max_revisits = max(service_appearances),
            by: { service_name, service_id }
| sort circular_traces desc
| limit 50`,
      },
      {
        tile: "Service call pairs",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd caller = entityName(dt.entity.service),
            caller_id = toString(dt.entity.service),
            callee = span.name
| summarize call_count = count(), by: { caller, caller_id, callee }
| filter call_count > 3
| sort call_count desc
| limit 100`,
      },
      {
        tile: "KPI sparklines (over time)",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            trace_id_str = toString(trace.id)
| summarize service_appearances = count(), by: { trace_id_str, service_name, timeframe = bin(end_time, {bin}) }
| filter service_appearances > 1
| summarize circular_traces = count(), by: { timeframe }
| sort timeframe`,
      },
    ],
  },
  {
    tab: "Slow Consumers",
    tiles: [
      {
        tile: "Slow consumers (high duration variance)",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            service_id = toString(dt.entity.service),
            duration_ms = toDouble(duration) / 1000000.0
| summarize avg_duration_ms = avg(duration_ms),
            p95_duration_ms = percentile(duration_ms, 95),
            p99_duration_ms = percentile(duration_ms, 99),
            max_duration_ms = max(duration_ms),
            total_spans = count(),
            by: { service_name, service_id }
| fieldsAdd variance_ratio = p99_duration_ms / avg_duration_ms
| filter variance_ratio > 5 and total_spans > 10
| sort variance_ratio desc
| limit 50`,
      },
      {
        tile: "Long-tail spans (slow executions)",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd service_name = entityName(dt.entity.service),
            service_id = toString(dt.entity.service),
            duration_ms = toDouble(duration) / 1000000.0
| filter duration_ms > 5000
| fields service_name, service_id, span.name, duration_ms, trace.id
| sort duration_ms desc
| limit 100`,
      },
      {
        tile: "KPI sparklines (over time)",
        query: `fetch spans, from: {timeframe}
| filter isNotNull(dt.entity.service)
| fieldsAdd duration_ms = toDouble(duration) / 1000000.0
| summarize high_variance_count = countif(duration_ms > 5000), total_spans = count(), avg_duration = avg(duration_ms), by:{timeframe = bin(end_time, {bin})}
| sort timeframe`,
      },
    ],
  },
  {
    tab: "Impact Analysis",
    tiles: [
      {
        tile: "N+1 impact metrics",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null"
| summarize total_queries = sum(aggregation.count),
            n1_queries = sum(if(aggregation.count > 1, aggregation.count)),
            n1_spans = countif(aggregation.count > 1),
            total_spans = count()
| fieldsAdd reducible = toDouble(n1_queries) - toDouble(n1_spans),
            reduction_pct = ((toDouble(n1_queries) - toDouble(n1_spans)) / toDouble(total_queries)) * 100`,
      },
      {
        tile: "Service-level impact & cost",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| fieldsAdd service_name = entityName(dt.entity.service),
            service_id = toString(dt.entity.service),
            duration_ms = toDouble(duration) / 1000000.0
| summarize n1_count = sum(aggregation.count),
            total_duration_ms = sum(duration_ms),
            avg_extra_duration_ms = avg(duration_ms),
            span_count = count(),
            by: { service_name, service_id }
| fieldsAdd estimated_wasted_ms = avg_extra_duration_ms * (toDouble(n1_count) - toDouble(span_count)),
            cost_per_week = (toDouble(n1_count) - toDouble(span_count)) * 0.000005
| sort estimated_wasted_ms desc
| limit 20`,
      },
      {
        tile: "KPI sparklines (over time)",
        query: `fetch spans, from: {timeframe}
| filter db.system != "null" and aggregation.count > 1
| summarize reducible_count = count(), total_wasted = sum(toDouble(duration) / 1000000.0), by:{timeframe = bin(end_time, {bin})}
| sort timeframe`,
      },
    ],
  },
];

function DqlBlock({ query }: { query: string }) {
  return (
    <pre
      style={{
        margin: "4px 0 12px",
        padding: "10px 12px",
        borderRadius: 6,
        background: "rgba(127,127,127,0.08)",
        border: "1px solid rgba(127,127,127,0.18)",
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        overflowX: "auto",
      }}
    >
      <code>{query}</code>
    </pre>
  );
}

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

      <Heading level={5} style={{ marginTop: 20 }}>KPI Cards & Forecasting</Heading>
      <Paragraph style={{ marginBottom: 8 }}>
        Every tab features KPI summary cards with:
      </Paragraph>
      <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20, opacity: 0.85 }}>
        <li><Strong>Sparklines:</Strong> Mini trend chart showing metric behavior across the selected timeframe (bin size adapts automatically)</li>
        <li><Strong>Comparison arrows:</Strong> Green/red delta vs the previous equivalent period (e.g. last 7d vs prior 7d)</li>
        <li><Strong>Forecast drill-through:</Strong> Click any KPI card to open a forecast modal with 6 algorithms (Linear Regression, Holt-Winters, Triple Exponential, Moving Average, Prophet, ARIMA/SARIMA)</li>
        <li><Strong>Loading skeletons:</Strong> Cards show a loading state while queries are in-flight</li>
      </ul>

      <Heading level={5} style={{ marginTop: 20 }}>Scatter Plot & Heatmap</Heading>
      <Paragraph>
        The N+1 Trends tab includes a scatter plot of N+1 spans over time. Toggle between
        <Strong> Scatter</Strong> mode (individual dots colored by service) and <Strong>Heatmap</Strong> mode
        (2D density grid showing concentration hotspots). Use the Maximize button for full-screen analysis.
      </Paragraph>

      <Heading level={5} style={{ marginTop: 20 }}>Linked Navigation</Heading>
      <Paragraph>
        Service names and trace IDs in all tables are clickable links. Service names open the
        Dynatrace Services app filtered to that service. Trace IDs open the Distributed Traces
        explorer for that specific trace. Links open in a new tab.
      </Paragraph>

      <Heading level={5} style={{ marginTop: 20 }}>DQL Reference</Heading>
      <Paragraph style={{ marginBottom: 12 }}>
        The exact DQL behind each tile, grouped by tab. <code>{"{timeframe}"}</code> is the
        currently selected timeframe (e.g. <code>now()-2h</code>) and <code>{"{bin}"}</code> is the
        sparkline bin size, which adapts automatically to the timeframe.
      </Paragraph>
      {DQL_BY_TAB.map((tab) => (
        <div key={tab.tab} style={{ marginBottom: 16 }}>
          <Strong style={{ display: "block", marginBottom: 6 }}>{tab.tab}</Strong>
          {tab.tiles.map((t) => (
            <div key={t.tile}>
              <Text style={{ fontSize: 12, opacity: 0.7, display: "block" }}>{t.tile}</Text>
              <DqlBlock query={t.query} />
            </div>
          ))}
        </div>
      ))}

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
