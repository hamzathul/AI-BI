import type { components } from "./schema";

/**
 * Friendly aliases over the generated schema. Components import these instead
 * of reaching into `components["schemas"]` everywhere.
 */
export type ApiErrorBody = components["schemas"]["ApiErrorDto"];
export type ConnectorCode = NonNullable<ApiErrorBody["code"]>;
export type SourceStatus = components["schemas"]["SourceStatusDto"];
export type LastSync = components["schemas"]["LastSyncDto"];
export type ConnectionTest = components["schemas"]["ConnectionTestDto"];
export type SyncCounts = components["schemas"]["SyncCountsDto"];
export type SyncResult = components["schemas"]["SyncResultDto"];
export type MetadataSnapshot = components["schemas"]["MetadataSnapshotDto"];
export type MetadataSchema = components["schemas"]["MetadataSchemaDto"];
export type MetadataObject = components["schemas"]["MetadataObjectDto"];
export type MetadataColumn = components["schemas"]["MetadataColumnDto"];
export type MetadataRelation = components["schemas"]["MetadataRelationDto"];
export type MetadataRelationEndpoint =
  components["schemas"]["MetadataRelationEndpointDto"];
export type SemanticModel = components["schemas"]["SemanticModelDto"];
export type SemanticModelResponse =
  components["schemas"]["SemanticModelResponseDto"];
export type SemanticValidationResult =
  components["schemas"]["SemanticValidationResponseDto"];
export type SemanticExampleResponse =
  components["schemas"]["SemanticExampleResponseDto"];

export type QuerySpec = components["schemas"]["QuerySpecDto"];
export type QueryFilter = components["schemas"]["QueryFilterDto"];
export type QueryOrder = components["schemas"]["QueryOrderByDto"];
export type TimeGrain = components["schemas"]["QueryTimeGrainDto"]["grain"];
export type QueryResult = components["schemas"]["QueryExecutionResultDto"];
export type QueryResultColumn = components["schemas"]["QueryResultColumnDto"];

export type ChartFormat = components["schemas"]["ChartFormatDto"];
export type ChartNumberFormat = components["schemas"]["ChartNumberFormatDto"];
export type NumberStyle = ChartNumberFormat["style"];
export type DateStyle = components["schemas"]["ChartDateFormatDto"]["style"];

export type TableChart = components["schemas"]["TableChartDto"];
export type KpiChart = components["schemas"]["KpiChartDto"];
export type BarChart = components["schemas"]["BarChartDto"];
export type LineChart = components["schemas"]["LineChartDto"];
export type ChartSpec = TableChart | KpiChart | BarChart | LineChart;
export type ChartType = ChartSpec["type"];

export type ChartExecutionRequest =
  components["schemas"]["ChartExecutionRequestDto"];
export type ChartExecutionResponse =
  components["schemas"]["ChartExecutionResponseDto"];
export type ChartExecutionResultItem =
  components["schemas"]["ChartExecutionResultItemDto"];

export type Dashboard = components["schemas"]["DashboardDto"];
export type DashboardSummary = components["schemas"]["DashboardSummaryDto"];
export type DashboardList = components["schemas"]["DashboardListDto"];
export type DashboardWidget = components["schemas"]["DashboardWidgetDto"];
export type WidgetLayout = components["schemas"]["WidgetLayoutDto"];
export type DashboardFilters = components["schemas"]["DashboardFiltersDto"];
export type DashboardWrite = components["schemas"]["DashboardWriteDto"];
