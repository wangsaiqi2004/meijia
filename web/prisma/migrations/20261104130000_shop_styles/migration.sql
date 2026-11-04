ALTER TABLE "StyleLibrary" ADD COLUMN "shopId" TEXT REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "StyleLibrary_shopId_enabled_idx" ON "StyleLibrary"("shopId", "enabled");

CREATE TABLE "ShopHiddenStyle" (
    "shopId" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("shopId", "styleId"),
    CONSTRAINT "ShopHiddenStyle_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShopHiddenStyle_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "StyleLibrary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
