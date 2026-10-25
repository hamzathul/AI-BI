-- CreateEnum
CREATE TYPE "join_type" AS ENUM ('LEFT', 'INNER');

-- CreateEnum
CREATE TYPE "aggregation" AS ENUM ('COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX');

-- CreateEnum
CREATE TYPE "filter_operator" AS ENUM ('EQ', 'NEQ', 'IN', 'NOT_IN', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN', 'IS_NULL', 'IS_NOT_NULL');

-- CreateTable
CREATE TABLE "semantic_models" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "semantic_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datasets" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "object_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dimensions" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "column_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aggregation" "aggregation" NOT NULL,
    "expression" TEXT,
    "description" TEXT,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_filters" (
    "id" UUID NOT NULL,
    "metric_id" UUID NOT NULL,
    "dimension_id" UUID NOT NULL,
    "operator" "filter_operator" NOT NULL,
    "value" JSONB NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "metric_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_joins" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "from_dataset_id" UUID NOT NULL,
    "from_column" TEXT NOT NULL,
    "to_dataset_id" UUID NOT NULL,
    "to_column" TEXT NOT NULL,
    "join_type" "join_type" NOT NULL DEFAULT 'LEFT',

    CONSTRAINT "semantic_joins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "semantic_models_name_key" ON "semantic_models"("name");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_model_id_name_key" ON "datasets"("model_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_model_id_schema_name_object_name_key" ON "datasets"("model_id", "schema_name", "object_name");

-- CreateIndex
CREATE UNIQUE INDEX "dimensions_dataset_id_name_key" ON "dimensions"("dataset_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "metrics_dataset_id_name_key" ON "metrics"("dataset_id", "name");

-- CreateIndex
CREATE INDEX "metric_filters_dimension_id_idx" ON "metric_filters"("dimension_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_filters_metric_id_position_key" ON "metric_filters"("metric_id", "position");

-- CreateIndex
CREATE INDEX "semantic_joins_from_dataset_id_idx" ON "semantic_joins"("from_dataset_id");

-- CreateIndex
CREATE INDEX "semantic_joins_to_dataset_id_idx" ON "semantic_joins"("to_dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_joins_model_id_name_key" ON "semantic_joins"("model_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_joins_model_id_from_dataset_id_from_column_to_data_key" ON "semantic_joins"("model_id", "from_dataset_id", "from_column", "to_dataset_id", "to_column");

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "semantic_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dimensions" ADD CONSTRAINT "dimensions_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_filters" ADD CONSTRAINT "metric_filters_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_filters" ADD CONSTRAINT "metric_filters_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "dimensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_joins" ADD CONSTRAINT "semantic_joins_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "semantic_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_joins" ADD CONSTRAINT "semantic_joins_from_dataset_id_fkey" FOREIGN KEY ("from_dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_joins" ADD CONSTRAINT "semantic_joins_to_dataset_id_fkey" FOREIGN KEY ("to_dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
