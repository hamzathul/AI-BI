-- CreateEnum
CREATE TYPE "db_object_kind" AS ENUM ('TABLE', 'VIEW');

-- CreateTable
CREATE TABLE "db_objects" (
    "id" UUID NOT NULL,
    "schema_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "db_object_kind" NOT NULL,

    CONSTRAINT "db_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_columns" (
    "id" UUID NOT NULL,
    "object_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "nullable" BOOLEAN NOT NULL,
    "default_value" TEXT,
    "comment" TEXT,
    "primary_key_position" INTEGER,
    "ordinal_position" INTEGER NOT NULL,

    CONSTRAINT "db_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_relations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "from_column_id" UUID NOT NULL,
    "to_column_id" UUID NOT NULL,

    CONSTRAINT "db_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "db_objects_schema_name_name_key" ON "db_objects"("schema_name", "name");

-- CreateIndex
CREATE UNIQUE INDEX "db_columns_object_id_name_key" ON "db_columns"("object_id", "name");

-- CreateIndex
CREATE INDEX "db_relations_from_column_id_idx" ON "db_relations"("from_column_id");

-- CreateIndex
CREATE INDEX "db_relations_to_column_id_idx" ON "db_relations"("to_column_id");

-- CreateIndex
CREATE UNIQUE INDEX "db_relations_name_from_column_id_to_column_id_key" ON "db_relations"("name", "from_column_id", "to_column_id");

-- AddForeignKey
ALTER TABLE "db_columns" ADD CONSTRAINT "db_columns_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "db_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "db_relations" ADD CONSTRAINT "db_relations_from_column_id_fkey" FOREIGN KEY ("from_column_id") REFERENCES "db_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "db_relations" ADD CONSTRAINT "db_relations_to_column_id_fkey" FOREIGN KEY ("to_column_id") REFERENCES "db_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
