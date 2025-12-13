import { db } from "../db";
import { cargoItems, CargoItem, InsertCargoItem } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function createCargoItem(item: InsertCargoItem): Promise<CargoItem> {
  const [created] = await db.insert(cargoItems).values(item).returning();
  return created;
}

export async function getCargoItem(cargoId: string, userId: number): Promise<CargoItem | undefined> {
  const [item] = await db.select().from(cargoItems).where(
    and(eq(cargoItems.id, cargoId), eq(cargoItems.user_id, userId))
  );
  return item;
}

export async function getCargoItems(userId: number): Promise<CargoItem[]> {
  return db.select().from(cargoItems).where(eq(cargoItems.user_id, userId));
}

export async function getCargoItemsByIds(cargoIds: string[]): Promise<CargoItem[]> {
  if (cargoIds.length === 0) return [];
  return db.select().from(cargoItems).where(inArray(cargoItems.id, cargoIds));
}

export async function getCargoItemByTcn(tcn: string, userId: number): Promise<CargoItem | undefined> {
  const [item] = await db
    .select()
    .from(cargoItems)
    .where(and(eq(cargoItems.tcn, tcn), eq(cargoItems.user_id, userId)));
  return item;
}

export async function updateCargoItem(
  cargoId: string,
  userId: number,
  data: Partial<InsertCargoItem>
): Promise<CargoItem | undefined> {
  const [updated] = await db
    .update(cargoItems)
    .set(data)
    .where(and(eq(cargoItems.id, cargoId), eq(cargoItems.user_id, userId)))
    .returning();
  return updated;
}

export async function deleteCargoItem(cargoId: string, userId: number): Promise<void> {
  await db.delete(cargoItems).where(
    and(eq(cargoItems.id, cargoId), eq(cargoItems.user_id, userId))
  );
}

export async function getCargoItemsByType(
  cargoType: string,
  userId: number
): Promise<CargoItem[]> {
  return db
    .select()
    .from(cargoItems)
    .where(and(eq(cargoItems.cargo_type, cargoType), eq(cargoItems.user_id, userId)));
}

export async function getHazmatCargoItems(userId: number): Promise<CargoItem[]> {
  return db
    .select()
    .from(cargoItems)
    .where(and(eq(cargoItems.is_hazmat, true), eq(cargoItems.user_id, userId)));
}
