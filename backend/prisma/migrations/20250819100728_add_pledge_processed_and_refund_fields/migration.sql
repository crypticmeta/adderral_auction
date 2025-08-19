-- AlterTable
ALTER TABLE "public"."Pledge" ADD COLUMN     "needsRefund" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "processed" BOOLEAN NOT NULL DEFAULT false;
