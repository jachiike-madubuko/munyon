import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  savePlanToAirtable,
  fetchPlanFromAirtable,
} from "../lib/airtablePlan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const seed = {
  payAmount: 1760,
  fixed: [{ id: "f1", name: "Fixed obligations", cost: 1100 }],
  paychecks: [
    { id: "p1", label: "Jul 15" },
    { id: "p2", label: "Jul 29" },
    { id: "p3", label: "Aug 12" },
    { id: "p4", label: "Aug 26" },
  ],
  categories: [
    { id: "c1", name: "Transport", color: "#E11D2E" },
    { id: "c2", name: "Tech", color: "#FF6B6B" },
    { id: "c3", name: "Food", color: "#C41E3A" },
    { id: "c4", name: "Health", color: "#FF8A80" },
  ],
  items: [
    { id: "i1", name: "E-bike", cost: 300, pc: "p1", paid: false, categoryIds: ["c1"] },
    { id: "i2", name: "Phone pay off 1/4", cost: 150, pc: "p1", paid: false, categoryIds: ["c2"], splitGroup: "sg-phone", splitIndex: 1, splitOf: 4 },
    { id: "i3", name: "Instacart", cost: 80, pc: "p1", paid: false, categoryIds: ["c3"] },
    { id: "i4", name: "Smart water bottle", cost: 130, pc: "p1", paid: false, categoryIds: ["c4"] },
    { id: "i5", name: "Free the root", cost: 70, pc: "p2", paid: false, categoryIds: ["c4"] },
    { id: "i6", name: "Relaxator", cost: 43.25, pc: "p2", paid: false, categoryIds: ["c4"] },
    { id: "i7", name: "Vivobarefoot", cost: 180, pc: "p2", paid: false, categoryIds: ["c1"] },
    { id: "i8", name: "Food", cost: 100, pc: "p2", paid: false, categoryIds: ["c3"] },
    { id: "i9", name: "Phone pay off 2/4", cost: 150, pc: "p2", paid: false, categoryIds: ["c2"], splitGroup: "sg-phone", splitIndex: 2, splitOf: 4 },
    { id: "i10", name: "Phone pay off 3/4", cost: 150, pc: "p3", paid: false, categoryIds: ["c2"], splitGroup: "sg-phone", splitIndex: 3, splitOf: 4 },
    { id: "i11", name: "Food", cost: 100, pc: "p3", paid: false, categoryIds: ["c3"] },
    { id: "i12", name: "Phone pay off 4/4", cost: 150, pc: "p4", paid: false, categoryIds: ["c2"], splitGroup: "sg-phone", splitIndex: 4, splitOf: 4 },
    { id: "i13", name: "Food", cost: 100, pc: "p4", paid: false, categoryIds: ["c3"] },
  ],
  savings: [],
  savingsPlacements: {},
};

async function main() {
  console.log("Saving seed to Airtable...");
  await savePlanToAirtable(seed);

  const plan = await fetchPlanFromAirtable();
  if (!plan) {
    console.error("fetchPlanFromAirtable returned null");
    process.exit(1);
  }

  console.log("Import complete. Record counts:");
  console.log(`  payAmount: ${plan.payAmount}`);
  console.log(`  paychecks: ${plan.paychecks.length}`);
  console.log(`  items: ${plan.items.length}`);
  console.log(`  fixed: ${plan.fixed.length}`);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
