// Three made-up Colorado deals, dated around `today`, for tests and for a fixture's Today page. Never seeded on a real
// install: only tests and scripts/seed-demo-deals.ts call this. Every name, address, email and phone number is invented.
import { addDays, type DealStore } from "./store.ts";

export function seedDemoDeals(store: DealStore, today: string): string[] {
  const day = (offset: number) => addDays(today, offset);

  const aspen = store.saveDeal({
    address: "1847 Larkspur Ln, Boulder, CO 80304",
    side: "buyer",
    price: 875_000,
    status: "under_contract",
    contract_date: day(-12),
    closing_date: day(18),
    transaction_url: "https://example.com/ctm/transactions/demo-1001",
    transaction_id: "demo-1001",
    notes: "Buyers relocating from Austin; lender wants the appraisal ordered this week.",
  });
  store.saveParty({ deal_id: aspen.id, role: "buyer", name: "Jordan Avery", email: "jordan.avery@example.com", phone: "303-555-0142" });
  store.saveParty({ deal_id: aspen.id, role: "listing_agent", name: "Casey Moreno", email: "casey.moreno@example.com" });
  store.saveParty({ deal_id: aspen.id, role: "lender", name: "Front Range Lending (demo)", email: "loans@example.com" });
  store.saveParty({ deal_id: aspen.id, role: "title", name: "Flatirons Title (demo)", email: "closings@example.com" });
  store.saveDeadline({ deal_id: aspen.id, label: "Inspection objection", due_date: day(-1), due_time: "17:00", kind: "inspection_objection" });
  store.saveDeadline({ deal_id: aspen.id, label: "Appraisal deadline", due_date: day(3), kind: "appraisal" });
  store.saveDeadline({ deal_id: aspen.id, label: "Loan terms deadline", due_date: day(9), kind: "loan" });
  store.saveDeadline({ deal_id: aspen.id, label: "Closing", due_date: day(18), due_time: "10:00", kind: "closing" });
  store.saveDocument({ deal_id: aspen.id, name: "Contract to Buy and Sell Real Estate", status: "signed" });
  store.saveDocument({ deal_id: aspen.id, name: "Earnest money receipt", status: "received" });
  store.saveDocument({ deal_id: aspen.id, name: "Lead-based paint disclosure", status: "needs_signature" });

  const pine = store.saveDeal({
    address: "622 W Pine St, Fort Collins, CO 80521",
    side: "seller",
    price: 549_900,
    status: "under_contract",
    contract_date: day(-20),
    closing_date: day(6),
    transaction_id: "demo-1002",
  });
  store.saveParty({ deal_id: pine.id, role: "seller", name: "Morgan Ellis", phone: "970-555-0188" });
  store.saveParty({ deal_id: pine.id, role: "buyer_agent", name: "Riley Chen", email: "riley.chen@example.com" });
  store.saveDeadline({ deal_id: pine.id, label: "Title objection", due_date: day(0), kind: "title" });
  store.saveDeadline({ deal_id: pine.id, label: "Inspection resolution", due_date: day(-4), kind: "inspection_resolution", status: "done" });
  store.saveDeadline({ deal_id: pine.id, label: "Closing", due_date: day(6), due_time: "14:00", kind: "closing" });
  store.saveDocument({ deal_id: pine.id, name: "Seller's Property Disclosure", status: "signed" });
  store.saveDocument({ deal_id: pine.id, name: "Inspection resolution", status: "needs_signature" });
  store.saveDocument({ deal_id: pine.id, name: "Closing instructions", status: "missing" });

  const ridge = store.saveDeal({
    address: "3310 Ridge View Dr, Colorado Springs, CO 80904",
    side: "seller",
    price: 689_000,
    status: "pre_contract",
    notes: "Listing goes live once photos are back.",
  });
  store.saveParty({ deal_id: ridge.id, role: "seller", name: "Sam Okafor", email: "sam.okafor@example.com" });
  store.saveDeadline({ deal_id: ridge.id, label: "Listing photos", due_date: day(2), kind: "other" });
  store.saveDocument({ deal_id: ridge.id, name: "Exclusive Right-to-Sell Listing Contract", status: "signed" });

  store.addActivity({ deal_id: aspen.id, summary: "Read the contract and added its deadlines.", botId: "demo-deal-desk", botName: "Deal Desk" });
  store.addActivity({ deal_id: pine.id, summary: "Asked the buyer's agent for the signed inspection resolution.", botId: "demo-deal-desk", botName: "Deal Desk" });
  store.addActivity({ deal_id: aspen.id, summary: "Flagged the lead-based paint disclosure as unsigned.", botId: "demo-compliance-desk", botName: "Compliance Desk" });
  store.addActivity({ deal_id: ridge.id, summary: "Sent the seller this week's prep checklist.", botId: "demo-listing-desk", botName: "Listing Desk" });
  return [aspen.id, pine.id, ridge.id];
}
