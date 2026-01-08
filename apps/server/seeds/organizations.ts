import { db } from "../db";
import { organizations } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEFAULT_ORGANIZATIONS = [
  { name: 'PACAF', description: 'Pacific Air Forces' },
  { name: 'DLA', description: 'Defense Logistics Agency' },
  { name: 'MSC', description: 'Military Sealift Command' },
  { name: 'TRANSCOM', description: 'United States Transportation Command' }
];

export async function seedOrganizations(): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];

  for (const org of DEFAULT_ORGANIZATIONS) {
    const [existingOrg] = await db.select().from(organizations).where(eq(organizations.name, org.name));
    
    if (existingOrg) {
      existing.push(org.name);
    } else {
      await db.insert(organizations).values(org);
      created.push(org.name);
    }
  }

  console.log(`[Organizations Seed] Created: ${created.join(', ') || 'none'}`);
  console.log(`[Organizations Seed] Already existed: ${existing.join(', ') || 'none'}`);

  return { created, existing };
}
