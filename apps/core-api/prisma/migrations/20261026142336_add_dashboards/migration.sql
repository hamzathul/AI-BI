-- CreateTable
CREATE TABLE "dashboards" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "filters" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widgets" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "chart" JSONB NOT NULL,
    "layout_x" INTEGER NOT NULL,
    "layout_y" INTEGER NOT NULL,
    "layout_w" INTEGER NOT NULL,
    "layout_h" INTEGER NOT NULL,

    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboards_name_key" ON "dashboards"("name");

-- CreateIndex
CREATE INDEX "widgets_dashboard_id_idx" ON "widgets"("dashboard_id");

-- AddForeignKey
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
