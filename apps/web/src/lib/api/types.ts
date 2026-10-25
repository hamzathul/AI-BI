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
