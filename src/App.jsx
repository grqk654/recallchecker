import { useState, useEffect, useCallback, useRef } from 'react'

// ─── DESIGN TOKENS ──────────────────────────────────────────────────────────
const C = {
  red: '#C0392B', redLight: '#FCEBEB', redDim: '#a93226',
  navy: '#1a1a2e', navyMid: '#2d2d44',
  bg: '#ffffff', bgSoft: '#f8f8f6', bgCard: '#ffffff',
  border: '#e8e8e4', borderMid: '#d0d0c8',
  text: '#1a1a2e', textMid: '#555550', textMuted: '#999990',
  amber: '#E8951A', amberLight: '#FAEEDA',
  blue: '#378ADD', blueLight: '#E6F1FB',
  green: '#1D9E75', greenLight: '#E1F5EE',
  purple: '#534AB7', purpleLight: '#EEEDFE',
  // category colors
  food: { bg: '#FAEEDA', text: '#8B4A00', badge: '#E8951A' },
  products: { bg: '#E6F1FB', text: '#185FA5', badge: '#378ADD' },
  vehicles: { bg: '#E1F5EE', text: '#0F6E56', badge: '#1D9E75' },
  drugs: { bg: '#EEEDFE', text: '#3C3489', badge: '#534AB7' },
  devices: { bg: '#FCEBEB', text: '#791F1F', badge: '#C0392B' },
}

const FONT = "'DM Sans', system-ui, sans-serif"
const MONO = "'DM Mono', monospace"

// ─── URL ROUTING ─────────────────────────────────────────────────────────────
const urlToPage = (pathname) => pathname.replace(/^\//, '') || 'home'
const pageToUrl = (page) => page === 'home' ? '/' : '/' + page

// ─── API HELPERS ─────────────────────────────────────────────────────────────
function formatDate(raw) {
  if (!raw) return 'Unknown'
  // openFDA dates: "20260101"
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4), m = raw.slice(4, 6), d = raw.slice(6, 8)
    return new Date(`${y}-${m}-${d}`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  // ISO or other
  const d = new Date(raw)
  if (isNaN(d)) return raw
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

function normalizeClass(cls) {
  if (!cls) return 'Unknown'
  const c = cls.toLowerCase()
  if (c.includes('class i') && !c.includes('ii') && !c.includes('iii')) return 'Class I'
  if (c.includes('class ii') && !c.includes('iii')) return 'Class II'
  if (c.includes('class iii')) return 'Class III'
  if (c.includes('safety')) return 'Safety'
  return cls
}

async function fetchFDA(type) {
  try {
    const res = await fetch(`https://api.fda.gov/${type}/enforcement.json?limit=20&sort=recall_initiation_date:desc`)
    const data = await res.json()
    if (!data.results) return []
    const cat = type === 'food' ? 'food' : type === 'drug' ? 'drugs' : 'devices'
    return data.results.map((r, i) => ({
      id: `${cat}-${r.recall_number || i}`,
      title: r.product_description ? r.product_description.slice(0, 120) : 'Unnamed Product',
      description: r.reason_for_recall || 'No details available.',
      category: cat,
      severity: normalizeClass(r.classification),
      agency: 'FDA',
      company: r.recalling_firm || 'Unknown',
      date: formatDate(r.recall_initiation_date),
      dateRaw: r.recall_initiation_date || '',
      status: r.status || 'Ongoing',
      url: `https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts`,
      slug: slugify((r.product_description || 'recall') + '-' + (r.recall_number || i)),
      quantity: r.product_quantity || '',
      distribution: r.distribution_pattern || '',
    }))
  } catch { return [] }
}

async function fetchCPSC() {
  try {
    const res = await fetch('https://www.saferproducts.gov/RestWebServices/Recall?format=json&pageIndex=0&pageSize=20')
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((r, i) => ({
      id: `products-cpsc-${r.RecallID || i}`,
      title: r.Title || 'Consumer Product Recall',
      description: r.Description || 'No details available.',
      category: 'products',
      severity: 'Safety',
      agency: 'CPSC',
      company: r.Manufacturers?.[0]?.Name || 'Unknown',
      date: formatDate(r.RecallDate),
      dateRaw: r.RecallDate || '',
      status: 'Active',
      url: r.URL || 'https://www.cpsc.gov/Recalls',
      slug: slugify((r.Title || 'cpsc-recall') + '-' + (r.RecallID || i)),
      quantity: '',
      distribution: '',
    }))
  } catch { return [] }
}

async function fetchNHTSA() {
  try {
    const res = await fetch('https://api.nhtsa.gov/recalls/recallsByType/vehicle?startYear=2023&endYear=2026')
    const data = await res.json()
    const results = data.results || data.Results || []
    return results.slice(0, 20).map((r, i) => ({
      id: `vehicles-${r.NHTSAId || r.NHTSACampaignNumber || i}`,
      title: `${r.Manufacturer || 'Vehicle'}: ${r.Subject || r.Component || 'Safety Recall'}`.slice(0, 120),
      description: r.Summary || r.Consequence || 'No details available.',
      category: 'vehicles',
      severity: 'Safety',
      agency: 'NHTSA',
      company: r.Manufacturer || 'Unknown',
      date: formatDate(r.ReportReceivedDate || r.RecallDate || ''),
      dateRaw: r.ReportReceivedDate || '',
      status: 'Active',
      url: `https://www.nhtsa.gov/vehicle-safety/recalls`,
      slug: slugify((r.Manufacturer || 'vehicle') + '-' + (r.Subject || 'recall') + '-' + i),
      quantity: r.PotentialNumberOfUnitsAffected ? String(r.PotentialNumberOfUnitsAffected) : '',
      distribution: r.Component || '',
    }))
  } catch { return [] }
}

// Fallback demo data if APIs are unavailable
const DEMO_RECALLS = [
  { id: 'food-demo-1', title: 'Organic Valley Whole Milk Recalled for Listeria Risk', description: 'Product may be contaminated with Listeria monocytogenes, which can cause serious illness in pregnant women, elderly, and immunocompromised individuals.', category: 'food', severity: 'Class I', agency: 'FDA', company: 'Organic Valley', date: 'Mar 20, 2026', dateRaw: '20260320', status: 'Ongoing', url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', slug: 'organic-valley-whole-milk-listeria-demo-1', quantity: '14,500 units', distribution: 'Nationwide' },
  { id: 'food-demo-2', title: 'Quaker Oats Granola Bars Recalled for Salmonella Contamination', description: 'Products may be contaminated with Salmonella, posing serious illness risk to young children, elderly, and immunocompromised individuals across all distribution channels.', category: 'food', severity: 'Class I', agency: 'FDA', company: 'Quaker Oats Company', date: 'Mar 18, 2026', dateRaw: '20260318', status: 'Ongoing', url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', slug: 'quaker-oats-granola-bars-salmonella-demo-2', quantity: '48,000 boxes', distribution: 'Nationwide' },
  { id: 'products-demo-1', title: 'IKEA Recalls SMYCKA Candles Due to Fire and Burn Hazard', description: 'Candles can crack while burning, posing fire and burn hazards to consumers. Approximately 500,000 units were sold in the US between 2023 and 2025.', category: 'products', severity: 'Class II', agency: 'CPSC', company: 'IKEA North America', date: 'Mar 15, 2026', dateRaw: '20260315', status: 'Active', url: 'https://www.cpsc.gov/Recalls', slug: 'ikea-smycka-candles-fire-burn-demo-1', quantity: '500,000 units', distribution: 'IKEA stores nationwide' },
  { id: 'products-demo-2', title: 'Infantino Recalls Baby Carriers Due to Fall and Injury Hazard', description: 'Waist buckle can break unexpectedly while in use, posing a fall hazard to babies being carried. Stop use immediately and contact Infantino for a free replacement.', category: 'products', severity: 'Class I', agency: 'CPSC', company: 'Infantino LLC', date: 'Mar 5, 2026', dateRaw: '20260305', status: 'Active', url: 'https://www.cpsc.gov/Recalls', slug: 'infantino-baby-carriers-fall-injury-demo-2', quantity: '72,000 units', distribution: 'Target, Amazon, Buy Buy Baby' },
  { id: 'products-demo-3', title: 'Aisstxoer Adult Bicycle Helmets Recalled for Serious Injury Risk', description: 'The recalled helmets violate the mandatory safety standard because the helmets may not protect the user from serious head injury during impact.', category: 'products', severity: 'Safety', agency: 'CPSC', company: 'Aisstxoer Adult Bike Helmets', date: 'Mar 18, 2026', dateRaw: '20260318', status: 'Active', url: 'https://www.cpsc.gov/Recalls', slug: 'aisstxoer-adult-bicycle-helmets-demo-3', quantity: '28,000 units', distribution: 'Amazon.com' },
  { id: 'drugs-demo-1', title: 'Pfizer Recalls Blood Pressure Medication for Nitrosamine Impurity', description: 'Nitrosamine impurities found above acceptable daily intake limits set by FDA. Long-term exposure to levels above the acceptable daily intake may increase the risk of cancer.', category: 'drugs', severity: 'Class I', agency: 'FDA', company: 'Pfizer Inc.', date: 'Mar 12, 2026', dateRaw: '20260312', status: 'Ongoing', url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', slug: 'pfizer-blood-pressure-nitrosamine-demo-1', quantity: '86,000 bottles', distribution: 'Retail pharmacies nationwide' },
  { id: 'drugs-demo-2', title: 'Amneal Pharmaceuticals Recalls Metformin HCl Tablets', description: 'Voluntary recall initiated due to the presence of N-Nitrosodimethylamine (NDMA) impurity above the FDA acceptable intake limit.', category: 'drugs', severity: 'Class II', agency: 'FDA', company: 'Amneal Pharmaceuticals', date: 'Mar 3, 2026', dateRaw: '20260303', status: 'Ongoing', url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', slug: 'amneal-metformin-ndma-demo-2', quantity: '32,000 bottles', distribution: 'Retail pharmacies' },
  { id: 'vehicles-demo-1', title: 'Ford Recalls 2024 F-150 for Brake Master Cylinder Defect', description: 'Defective brake master cylinder may cause brake fluid leakage, increasing stopping distance and heightening crash risk. Approximately 84,000 vehicles are affected nationwide.', category: 'vehicles', severity: 'Safety', agency: 'NHTSA', company: 'Ford Motor Company', date: 'Mar 10, 2026', dateRaw: '20260310', status: 'Active', url: 'https://www.nhtsa.gov/vehicle-safety/recalls', slug: 'ford-2024-f150-brake-master-cylinder-demo-1', quantity: '84,000 vehicles', distribution: 'US dealerships' },
  { id: 'vehicles-demo-2', title: 'Toyota Recalls 2023-2025 Camry for Airbag Inflator Defect', description: 'In the event of a crash, the airbag inflator may rupture and send metal fragments toward occupants, posing serious injury or fatality risk.', category: 'vehicles', severity: 'Safety', agency: 'NHTSA', company: 'Toyota Motor Corporation', date: 'Feb 28, 2026', dateRaw: '20260228', status: 'Active', url: 'https://www.nhtsa.gov/vehicle-safety/recalls', slug: 'toyota-camry-airbag-inflator-demo-2', quantity: '143,000 vehicles', distribution: 'US dealerships' },
  { id: 'devices-demo-1', title: 'Philips Recalls CPAP Machines for Sound Abatement Foam Issue', description: 'The polyurethane foam used to reduce sound and vibration may degrade and potentially off-gas chemicals. Users should stop using affected devices and contact Philips immediately.', category: 'devices', severity: 'Class II', agency: 'FDA', company: 'Philips North America', date: 'Mar 8, 2026', dateRaw: '20260308', status: 'Ongoing', url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', slug: 'philips-cpap-foam-degradation-demo-1', quantity: '3.5 million devices', distribution: 'Sleep clinics, retail' },
  { id: 'devices-demo-2', title: 'Medtronic Recalls Insulin Pump for Software Error Risk', description: 'A software error may cause the pump to stop delivering insulin without alerting the user, posing a risk of hyperglycemia and diabetic ketoacidosis.', category: 'devices', severity: 'Class I', agency: 'FDA', company: 'Medtronic Inc.', date: 'Feb 22, 2026', dateRaw: '20260222', status: 'Ongoing', url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', slug: 'medtronic-insulin-pump-software-demo-2', quantity: '322,000 devices', distribution: 'Hospitals, clinics, patients' },
]

// ─── SEO ARTICLES ─────────────────────────────────────────────────────────────
const ARTICLES = [
  {
    id: 'what-is-a-product-recall',
    title: 'What Is a Product Recall? How the System Works',
    category: 'Recall Basics',
    tag: 'ESSENTIAL',
    description: 'A complete guide to how product recalls work in the US, who issues them, and what your rights are as a consumer.',
    content: `A product recall is an official request to return a product after discovering safety defects or quality issues that could endanger the health, safety, or security of consumers or the public.

**Who Issues Recalls?**

In the United States, several government agencies oversee recalls depending on the product type. The Food and Drug Administration (FDA) handles food, drugs, cosmetics, and medical devices. The Consumer Product Safety Commission (CPSC) oversees consumer products like toys, furniture, and electronics. The National Highway Traffic Safety Administration (NHTSA) manages vehicle and auto part recalls.

**Types of Recalls**

Not all recalls carry the same level of risk. The FDA uses a three-class system. Class I recalls involve the most serious health hazards — situations where there is a reasonable probability that the use of a product will cause serious adverse health consequences or death. Class II recalls involve products that may cause temporary adverse health consequences but where the probability of serious harm is remote. Class III recalls involve products that are unlikely to cause adverse health consequences but violate FDA regulations.

**How Are Recalls Initiated?**

Recalls can be voluntary or mandatory. Most recalls in the US are voluntary, meaning the company identifies a problem and notifies the appropriate agency. Mandatory recalls happen when a company refuses to act and the government steps in. Companies are required by law to report product defects to the relevant agency.

**What Happens After a Recall?**

When a recall is issued, the company typically notifies retailers to remove the product from shelves and alerts consumers through press releases, social media, and direct communication if purchase records exist. Consumers are generally offered a repair, replacement, or refund.

**Your Rights as a Consumer**

If you own a recalled product, you have the right to a remedy — usually a free repair, full replacement, or refund of the purchase price. You do not need proof of purchase in most cases. Contact the company directly using the information provided in the recall notice.`,
    faqs: [
      { q: 'Are all recalls mandatory?', a: 'No — the majority of US recalls are voluntary. Companies often recall products themselves after identifying a problem, before regulators require them to.' },
      { q: 'Do I get my money back on a recalled product?', a: 'Usually yes. Recalls typically offer a repair, replacement, or refund. The specific remedy depends on the severity and the company policy.' },
      { q: 'How long does a recall stay active?', a: 'Recalls remain active until the company resolves the issue. Some recalls stay open for years if not all products have been returned.' },
    ]
  },
  {
    id: 'how-to-check-vehicle-recall',
    title: 'How to Check If Your Car Has an Open Recall',
    category: 'Vehicles',
    tag: 'POPULAR',
    description: 'Step-by-step instructions for checking your car, truck, or SUV for open safety recalls using your VIN number and the NHTSA database.',
    content: `Vehicle recalls are more common than most drivers realize — and driving a car with an open recall can be dangerous and in some cases illegal. Here is how to check your vehicle in minutes.

**The Fastest Way: Use Your VIN**

Your Vehicle Identification Number (VIN) is the most reliable way to check for open recalls. You can find your VIN on the dashboard (visible through the windshield on the driver's side), on your insurance card, or on your vehicle registration.

Once you have your VIN, visit the NHTSA website at nhtsa.gov/recalls or use the NHTSA SaferCar app. Enter your 17-character VIN and the system will instantly tell you if your specific vehicle has any open safety recalls.

**What Our Search Tool Shows**

The vehicle recall data on RecallChecker comes directly from the NHTSA database and is updated regularly. You can search by manufacturer, model year, or recall issue. Each recall entry includes the component affected, the safety risk, and the remedy offered.

**How Vehicle Recalls Work**

When NHTSA determines that a vehicle or equipment creates an unreasonable risk to safety, it can order a recall. The manufacturer must then notify owners by first-class mail within 60 days and provide a free repair at any authorized dealership.

**If Your Vehicle Is Recalled**

Contact your dealership as soon as possible. Recall repairs are always free, regardless of whether you are the original owner. You do not need to have bought the car from that dealership. If parts are not yet available, the dealership must provide you with a loaner vehicle or rental reimbursement in some states.

**Checking Used Cars Before You Buy**

Always run a VIN recall check before purchasing a used vehicle. Open recalls do not automatically transfer to new owners in all states, meaning you could buy a car with a dangerous unfixed defect.`,
    faqs: [
      { q: 'Are vehicle recall repairs really free?', a: 'Yes — by federal law, all safety-related vehicle recall repairs must be performed free of charge at any authorized dealership, even if you are not the original owner.' },
      { q: 'Can I still drive my car if it has an open recall?', a: 'It depends on the severity. For Class I safety recalls involving serious crash or injury risk, stop driving immediately. For minor issues, check with your dealer about urgency.' },
      { q: 'How long do I have to get a recall repair?', a: 'There is technically no expiration date on recall repairs for vehicles under 15 years old. However, parts availability may become an issue for older vehicles.' },
    ]
  },
  {
    id: 'how-to-find-fda-food-recalls',
    title: 'How to Find FDA Food Recalls (And What to Do)',
    category: 'Food',
    tag: 'FOOD',
    description: 'How to search for current FDA food recalls, understand contamination risks, and what steps to take if you have a recalled product at home.',
    content: `Food recalls happen more often than most people expect — the FDA issues dozens each year. Here is how to stay informed and protect your household.

**Why Food Recalls Happen**

Most food recalls are triggered by contamination with harmful bacteria like Salmonella, Listeria monocytogenes, or E. coli. Other common reasons include undeclared allergens (products containing peanuts, tree nuts, or milk not listed on the label), foreign material contamination, and manufacturing errors.

**How to Search for Current Recalls**

RecallChecker pulls live food recall data directly from the FDA enforcement database, updated regularly. You can search by brand name, product type, or contamination reason. Each recall entry links directly to the official FDA notice.

You can also visit FDA.gov/recalls directly or sign up for FDA MedWatch email alerts for automatic notifications.

**Understanding Class I Food Recalls**

Class I food recalls are the most serious. They involve products where there is a reasonable probability that consuming the product will cause serious adverse health consequences or death. If you have a Class I recalled food product at home, do not eat it — even if it looks and smells normal. Bacterial contamination is invisible and odorless.

**What to Do With a Recalled Product**

First, stop consuming the product immediately. Check the lot number, UPC, and use-by date on your package against the recall notice — recalls are often limited to specific production runs, not entire product lines. You have several options: return it to the store for a full refund, throw it away sealed in a bag, or follow the specific disposal instructions in the recall notice.

**Protecting Your Household**

Sign up for recall alerts through Recalls.gov, the CPSC, and FDA MedWatch. Check RecallChecker regularly if you have young children, elderly family members, or immunocompromised individuals at home — they face the highest risk from contaminated food.`,
    faqs: [
      { q: 'How do I know if my specific package is recalled?', a: 'Check the lot number and UPC code on your package against the recall notice. Recalls are usually limited to specific production runs, not every product the company makes.' },
      { q: 'Can I get a refund on recalled food?', a: 'Yes — retailers are required to accept returned recalled products for a full refund, even without a receipt in most cases.' },
      { q: 'What is the most common reason for food recalls?', a: 'Undeclared allergens are actually the most common reason for food recalls in the US, followed by Salmonella and Listeria contamination.' },
    ]
  },
  {
    id: 'what-is-class-i-recall',
    title: 'What Is a Class I Recall? Understanding FDA Severity Levels',
    category: 'Recall Basics',
    tag: 'MUST KNOW',
    description: 'FDA recall classifications explained — Class I, Class II, and Class III — and what each severity level means for your safety.',
    content: `When the FDA issues a recall, it assigns a classification that tells you how serious the health risk is. Understanding these classes helps you decide how urgently to act.

**Class I — Highest Severity**

A Class I recall is the most serious type. The FDA defines it as a situation where there is a reasonable probability that the use of or exposure to a product will cause serious adverse health consequences or death. If you see a Class I recall, take immediate action — stop using the product right away.

Class I recalls are most common with contaminated food products (Salmonella, Listeria, E. coli), critical drug impurities, and medical devices that could malfunction in life-threatening ways.

**Class II — Moderate Severity**

Class II recalls cover products that may cause temporary adverse health consequences or where the probability of serious harm is remote. This does not mean the product is safe — it means the worst-case scenario is less severe than Class I. You should still stop using the product and seek a remedy.

Examples include over-the-counter medications with incorrect labeling, food products with quality defects that rarely cause harm, and devices with issues that could cause minor injury.

**Class III — Lowest Severity**

Class III recalls are for products that are unlikely to cause adverse health consequences but still violate FDA labeling or manufacturing regulations. These might include products with minor labeling errors or slight deviations from production standards that pose minimal consumer risk.

**CPSC and NHTSA Classifications**

The CPSC uses a different system — consumer product recalls are classified as Safety recalls, often with severity described in the hazard statement. NHTSA vehicle recalls are all considered safety recalls, but the urgency is communicated through the risk description rather than a class number.

**How to Respond to Each Class**

For Class I: Stop using immediately, follow disposal instructions, seek remedy right away. For Class II: Stop using, request a remedy at your convenience but do not delay. For Class III: Monitor the recall notice and take the offered remedy when convenient.`,
    faqs: [
      { q: 'Are Class III recalls safe to ignore?', a: 'Not entirely. While Class III recalls pose minimal direct health risk, you should still follow the recall instructions and take the offered remedy to comply with safety standards.' },
      { q: 'Who decides the recall classification?', a: 'The FDA\'s Recall Coordinator assigns the classification based on the health hazard evaluation. The company may propose a classification, but the FDA makes the final call.' },
      { q: 'Can a recall be upgraded to a higher class?', a: 'Yes — if new information emerges about the severity of a risk, a recall can be reclassified. This is why monitoring recall updates is important.' },
    ]
  },
  {
    id: 'how-to-report-unsafe-product',
    title: 'How to Report an Unsafe Product to the CPSC',
    category: 'Consumer Rights',
    tag: 'ACTION',
    description: 'A step-by-step guide to reporting dangerous consumer products to the CPSC — and why your report could trigger a recall that protects others.',
    content: `You may be the first person to notice a product defect that could harm thousands of people. Here is how to file a report and what happens when you do.

**Why Consumer Reports Matter**

The CPSC relies heavily on consumer incident reports to identify dangerous products. When enough reports come in about the same product, the CPSC can launch an investigation that ultimately leads to a recall. Your report could directly prevent injury to other consumers.

**How to Report to the CPSC**

The easiest way to file a report is through SaferProducts.gov, the CPSC's official consumer reporting portal. You can report any consumer product — except vehicles, food, drugs, and medical devices, which go to NHTSA and FDA respectively. The process takes about 10 minutes.

Information you will need to provide: product name and manufacturer, where and when you bought it, description of what happened, any injuries or property damage, and photos if available.

**What Happens After You Report**

The CPSC reviews your report within 10 business days. If your report is published on SaferProducts.gov, the manufacturer has 10 days to respond. The CPSC uses aggregated report data to identify patterns that may warrant investigation, testing, or a mandatory recall.

**Reporting to the FDA**

For food, drugs, cosmetics, or medical devices, report through FDA MedWatch at fda.gov/medwatch. You can report adverse events, product problems, and medication errors. These reports feed directly into FDA's surveillance system.

**Reporting Vehicle Issues to NHTSA**

For vehicle safety issues, file a Vehicle Safety Complaint at nhtsa.gov/report-a-safety-problem. NHTSA uses complaint data to open defect investigations that can lead to vehicle recalls.

**You Are Protected**

Consumer protection laws protect you from manufacturer retaliation for filing safety complaints. You have the right to report safety concerns without fear of legal action from manufacturers.`,
    faqs: [
      { q: 'Will my name be made public if I report a product?', a: 'Your personal information is kept confidential by the CPSC. Only the incident description and product information may be published on SaferProducts.gov.' },
      { q: 'What if the product I am reporting has already been recalled?', a: 'Report it anyway. Additional incident reports help the CPSC track the scope of a recall and verify that remedies are effective.' },
      { q: 'Can I report a product that hurt my pet?', a: 'The CPSC covers consumer products but not pet food or veterinary products. Report pet food issues to the FDA. For other products that harmed pets, the CPSC will still accept your report.' },
    ]
  },
  {
    id: 'what-to-do-recalled-product',
    title: 'What to Do If You Own a Recalled Product',
    category: 'Consumer Guide',
    tag: 'GUIDE',
    description: 'Exactly what steps to take when you discover a product you own has been recalled — from verifying the recall to getting your remedy.',
    content: `Finding out you own a recalled product can be alarming. Here is a clear, step-by-step process for handling it.

**Step 1 — Verify the Recall Applies to Your Item**

Not every product recall covers every unit a company ever made. Recalls are usually limited to specific lot numbers, production dates, model numbers, or UPC codes. Find the recall notice (search RecallChecker or the relevant agency website) and carefully compare your product's identifiers against those listed.

Check: the lot number or batch code (usually printed on the bottom or back of the package), the UPC code, the production or use-by date, and the model number for electronics and appliances.

**Step 2 — Stop Using the Product Immediately**

If your product falls within the recall, stop using it right away — especially for Class I recalls involving serious safety risks. Set it aside somewhere it will not be accidentally used by other household members or pets.

**Step 3 — Contact the Company**

Every recall notice includes contact information for the company. Call the number or visit the company's recall webpage. Have your product information ready. The company will tell you exactly how to receive your remedy — whether that is a repair, replacement, or refund.

**Step 4 — Claim Your Remedy**

For product recalls: return the item to the store or mail it back using prepaid shipping provided by the company. For vehicle recalls: call your nearest authorized dealership to schedule a free repair. For food recalls: return it to the store for a refund or dispose of it safely.

**Step 5 — Document Everything**

Keep records of your communication with the company, your remedy request, and any out-of-pocket expenses. If you or a family member was injured by the recalled product before you knew about the recall, consult an attorney — you may have a product liability claim.

**What if the Company is Unresponsive?**

If you cannot get a remedy from the company, contact the relevant agency directly — CPSC at 1-800-638-2772, FDA MedWatch at 1-800-332-1088, or NHTSA at 1-888-327-4236.`,
    faqs: [
      { q: 'Do I need the original receipt to claim a recall remedy?', a: 'Usually no. Most recall programs accept proof of ownership like photos of the product, credit card statements, or even just possession of the product.' },
      { q: 'What if I bought the recalled product used?', a: 'You are still entitled to a remedy. Recall protections apply to all owners of a recalled product, not just original purchasers.' },
      { q: 'How long do I have to claim my recall remedy?', a: 'Remedy availability varies. Some companies close recall programs after 12-18 months, so act quickly once you are notified.' },
    ]
  },
  {
    id: 'drug-recall-guide',
    title: 'Understanding Drug Recalls: What FDA Medication Recalls Mean for You',
    category: 'Drugs',
    tag: 'DRUGS',
    description: 'How FDA drug recalls work, what NDMA and nitrosamine impurities mean, and what to do if your medication has been recalled.',
    content: `Drug recalls happen regularly in the US, often due to contamination or manufacturing defects. Here is what you need to know to stay safe.

**Why Drugs Get Recalled**

The most common reason for drug recalls in recent years has been the presence of nitrosamine impurities — specifically NDMA (N-Nitrosodimethylamine) and NDEA (N-Nitrosodiethylamine). These chemicals are probable human carcinogens that can form during certain manufacturing processes.

Other reasons include subpotency (the drug is weaker than labeled), superpotency (stronger than labeled), contamination with foreign particles, incorrect labeling, and packaging failures that allow moisture or air contamination.

**How to Check If Your Medication Is Recalled**

Search for your medication by brand name, generic name, or manufacturer on RecallChecker. Each drug recall entry shows which specific lot numbers are affected — your medication is only recalled if your bottle's lot number matches. The lot number is typically printed on the side or bottom of the bottle.

You can also check FDA.gov/drugs for the complete list of current drug recalls.

**What to Do If Your Drug Is Recalled**

Do not stop taking a critical medication without consulting your doctor first. This is important — the risks of suddenly stopping many medications (blood pressure drugs, diabetes medications, psychiatric drugs) can be greater than the risk from the recalled product. Call your doctor or pharmacist immediately for guidance.

Your pharmacist can check whether your specific prescription is affected and provide a replacement. Insurance will cover an emergency refill of a recalled medication.

**NDMA — Should You Be Worried?**

The FDA's position is that short-term exposure to NDMA at the levels found in recalled medications is unlikely to cause harm. Long-term exposure above acceptable daily intake levels is what raises cancer risk. If you have been taking a recalled medication for months or years, speak with your doctor about monitoring.`,
    faqs: [
      { q: 'Should I stop taking my blood pressure medication if it was recalled?', a: 'Do not stop without talking to your doctor. Stopping blood pressure medication abruptly can cause serious harm. Contact your doctor or pharmacist for a safe alternative immediately.' },
      { q: 'Will my insurance cover a replacement for a recalled drug?', a: 'Yes — most insurance plans will cover an emergency refill for a recalled medication even if it is too soon for a regular refill.' },
      { q: 'How do I find the lot number on my medication?', a: 'The lot number is usually printed on the side or bottom label of the bottle, often near the expiration date. It may be labeled "LOT" or "Lot #".' },
    ]
  },
  {
    id: 'most-recalled-car-brands',
    title: 'Most Recalled Car Brands in America (And Why)',
    category: 'Vehicles',
    tag: 'DATA',
    description: 'A data-driven look at which vehicle manufacturers issue the most recalls, the most common defects, and what it actually means for reliability.',
    content: `More recalls does not always mean less reliable — in fact, it can mean the opposite. Here is what the recall data actually tells us.

**Why High Recall Numbers Can Be Misleading**

The manufacturers with the most recalls are often the ones selling the most vehicles. A company that sells 3 million vehicles per year will naturally have more recalls than one selling 300,000, even if their defect rate per vehicle is identical. What matters is the defect rate, not the raw number.

Additionally, proactive manufacturers who identify and fix problems quickly tend to issue more voluntary recalls than those who wait for NHTSA to force them.

**Common Vehicle Recall Categories**

The most frequent vehicle recall categories tracked by NHTSA include airbag defects (the Takata airbag scandal affected more than 50 million vehicles across dozens of brands), software and electronic system failures (increasingly common as vehicles add more computing components), fuel system issues, brake system defects, and steering component failures.

**The Takata Effect**

The Takata airbag recall, which began in 2008 and expanded for over a decade, was the largest vehicle recall in history. It affected vehicles from nearly every major manufacturer and accounted for a significant portion of all vehicle recall statistics from 2014 to 2020. When evaluating brand recall histories, the Takata recalls often skew the numbers heavily.

**Electric Vehicle Recalls**

As EVs have grown in market share, they have introduced new recall categories — software over-the-air update failures, battery thermal management defects, and charging system issues. Some EV manufacturers are able to resolve software recalls remotely without the vehicle ever visiting a dealership.

**How to Check Your Specific Vehicle**

Regardless of brand statistics, what matters is whether your specific vehicle has an open recall. Use your 17-character VIN on the NHTSA website or search RecallChecker's vehicles section. Recall repairs are always free at authorized dealerships.`,
    faqs: [
      { q: 'Does a recall mean a car brand is unreliable?', a: 'Not necessarily. High recall counts often reflect high sales volumes. What matters more is how quickly and thoroughly a manufacturer responds to defects.' },
      { q: 'What was the biggest vehicle recall in history?', a: 'The Takata airbag recall affected over 50 million vehicles from dozens of manufacturers and is the largest automotive recall in history.' },
      { q: 'Can electric vehicles be recalled remotely?', a: 'For software-related recalls, yes — many EV manufacturers can push over-the-air updates that resolve the defect without requiring a dealership visit.' },
    ]
  },
  {
    id: 'how-to-check-baby-product-recalls',
    title: 'How to Check If Baby Products Are Recalled',
    category: 'Consumer Guide',
    tag: 'PARENTS',
    description: 'A guide for parents on checking baby gear, car seats, cribs, formula, and toys for active recalls before use.',
    content: `Baby products are subject to some of the strictest safety standards in the US — and some of the most serious recalls. Here is how to protect your child.

**Why Baby Product Recalls Matter More**

Infants and toddlers are uniquely vulnerable to product safety risks. They cannot communicate discomfort or danger. Many baby product recalls involve strangulation, suffocation, entrapment, or choking risks — hazards that can cause harm or death in minutes. Taking recalls seriously is not optional when it comes to baby gear.

**Categories to Check Regularly**

Sleep products (cribs, bassinets, bedside sleepers, and infant loungers) have been the subject of high-profile recalls, particularly following the Consumer Product Safety Improvement Act requirements for infant sleep safety. Car seats and booster seats require periodic recall checks — a recalled car seat may fail in a crash. Baby formula recalls often involve contamination or incorrect nutrient levels. Strollers and high chairs have been recalled for entrapment and tipping hazards. Baby monitors and electronic devices can pose electrical safety risks.

**Before You Buy or Accept Used Baby Gear**

Always check for recalls before using any baby product — especially used items received as gifts or purchased secondhand. Recalls are not automatically communicated to subsequent owners. A recalled crib or bouncer seat that looks perfectly fine may have a documented safety defect.

**How to Register Your Baby Products**

Most baby product manufacturers include a registration card. Fill it out online or by mail so the company can contact you directly in the event of a recall. This is especially important for car seats, cribs, and strollers.

**Where to Check**

Search RecallChecker's products section for the brand name or product type. The CPSC also maintains a dedicated SaferProducts.gov database and offers email alert subscriptions by product category. Sign up for infant and toddler product alerts specifically.

**If a Baby Product You Own Is Recalled**

Stop using it immediately. For sleep products and car seats especially, do not wait. Contact the manufacturer for a free replacement or repair. In the interim, find a safe alternative rather than continuing to use the recalled product.`,
    faqs: [
      { q: 'Is it safe to use secondhand baby furniture?', a: 'Only if you verify it has no open recalls and meets current safety standards. Older cribs may have been recalled years ago and the issue may not have been fixed.' },
      { q: 'How do I register a baby product for recall alerts?', a: 'Fill out the product registration card that came with the item, or register online at the manufacturer website. This is the most reliable way to receive direct recall notifications.' },
      { q: 'Are recalled baby products dangerous to return to stores?', a: 'No — stores are required to safely handle returned recalled products. Return or dispose of the item per the recall instructions rather than giving it to another family.' },
    ]
  },
  {
    id: 'recall-checker-guide',
    title: 'Is There a Free Product Recall Search Tool? Yes, Right Here',
    category: 'Tools',
    tag: 'FREE',
    description: 'RecallChecker.com aggregates live recall data from FDA, CPSC, and NHTSA in one free searchable database — no account required.',
    content: `Checking for product recalls used to mean visiting three separate government websites, each with its own search interface. RecallChecker.com solves that problem.

**What RecallChecker Does**

RecallChecker pulls live recall data directly from the three main US recall agencies — the FDA, the CPSC, and the NHTSA — and displays it in a single, searchable interface. You can search across all categories at once, or filter by Food, Consumer Products, Vehicles, Drugs, or Medical Devices.

The data is sourced directly from official government APIs and is updated regularly, so what you see reflects current active recalls.

**No Account Required**

RecallChecker is completely free and requires no sign-up, no email address, and no account of any kind. Type your search and get results instantly.

**What Data We Show**

For each recall we display the product name and affected items, the reason for the recall and health risk, the issuing agency (FDA, CPSC, or NHTSA), the recall classification (Class I, II, III, or Safety), the recalling company, the recall date, and a direct link to the official government notice.

**How to Use the Search**

Type any product name, brand, manufacturer, or keyword into the search bar. Results filter instantly as you type. You can also use the category pills to filter by type — Food, Products, Vehicles, Drugs, or Medical Devices.

**Limitations to Know**

RecallChecker is an aggregation tool. We do not make independent safety determinations — all recall decisions come from the relevant government agency. For the most complete and authoritative information, always follow the link to the official agency recall notice. Some recalls may take time to appear after being issued by the agency.

**Staying Updated**

Bookmark RecallChecker and check it whenever you purchase a new product, especially for high-risk categories like food, baby products, and vehicles. We recommend a quick check when you hear news about a product safety issue involving something you own.`,
    faqs: [
      { q: 'Is RecallChecker affiliated with the FDA, CPSC, or NHTSA?', a: 'No — RecallChecker is an independent aggregation tool that uses public government data. We are not affiliated with any government agency.' },
      { q: 'How current is the recall data?', a: 'We pull data directly from official government APIs. The data reflects what is currently in the official databases, though there may be a short lag after a new recall is issued.' },
      { q: 'Why are some recalls not showing up in search?', a: 'Recall data is sourced from official APIs which may not include every historical recall. For older recalls, visit the specific agency website directly.' },
    ]
  },
]

// ─── SVG CHARTS (no external library) ────────────────────────────────────────
function BarChart({ data, colors }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const h = 160, padTop = 10, padBot = 28, padL = 32, padR = 10
  const chartH = h - padTop - padBot
  const barW = Math.min(40, (300 - padL - padR) / data.length - 8)

  return (
    <svg viewBox={`0 0 300 ${h}`} style={{ width: '100%', height: h }}>
      {/* Y axis gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = padTop + chartH - (pct * chartH)
        const val = Math.round(pct * max)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={290} y2={y} stroke="#e8e8e4" strokeWidth="0.5" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#999990">{val}</text>
          </g>
        )
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const slotW = (290 - padL) / data.length
        const x = padL + i * slotW + (slotW - barW) / 2
        const barH = Math.max((d.value / max) * chartH, 2)
        const y = padTop + chartH - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={colors[i]} rx="3" />
            <text x={x + barW / 2} y={h - 6} textAnchor="middle" fontSize="9" fill="#999990">{d.label}</text>
            <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="9" fill={colors[i]} fontWeight="500">{d.value}</text>
          </g>
        )
      })}
    </svg>
  )
}

function DonutChart({ segments }) {
  const total = segments.reduce((s, d) => s + d.value, 0)
  const cx = 80, cy = 75, r = 58, inner = 36
  let angle = -Math.PI / 2

  const arcs = segments.map(seg => {
    const pct = seg.value / total
    const sweep = pct * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const xi1 = cx + inner * Math.cos(angle - sweep)
    const yi1 = cy + inner * Math.sin(angle - sweep)
    const xi2 = cx + inner * Math.cos(angle)
    const yi2 = cy + inner * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { path: `M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${large},0 ${xi1},${yi1} Z`, color: seg.color, label: seg.label, pct: Math.round(pct * 100) }
  })

  return (
    <svg viewBox="0 0 220 150" style={{ width: '100%', height: 150 }}>
      {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} />)}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" fontWeight="500" fill="#1a1a2e">{total}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="8" fill="#999990">recalls</text>
      {/* Legend */}
      {arcs.map((a, i) => (
        <g key={i} transform={`translate(168, ${14 + i * 22})`}>
          <rect width="10" height="10" rx="2" fill={a.color} />
          <text x="14" y="9" fontSize="9" fill="#555550">{a.label}</text>
          <text x="14" y="18" fontSize="8" fill="#999990">{a.pct}%</text>
        </g>
      ))}
    </svg>
  )
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Badge({ children, style }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '3px 8px',
      borderRadius: 20, fontWeight: 500, fontFamily: MONO, ...style
    }}>{children}</span>
  )
}

function catStyle(cat) {
  const m = C[cat] || { bg: C.bgSoft, text: C.textMuted, badge: C.textMuted }
  return { background: m.bg, color: m.text }
}

function severityStyle(sev) {
  if (sev === 'Class I') return { background: C.redLight, color: C.red }
  if (sev === 'Class II') return { background: C.amberLight, color: '#8B4A00' }
  if (sev === 'Class III') return { background: C.blueLight, color: C.blue }
  return { background: '#E1F5EE', color: '#0F6E56' }
}

function agencyStyle(ag) {
  return { background: '#f0f0ee', color: C.textMid }
}

function RecallCard({ recall, onSelect }) {
  const cs = catStyle(recall.category)
  const catLabel = recall.category === 'devices' ? 'Devices' : recall.category.charAt(0).toUpperCase() + recall.category.slice(1)
  return (
    <div
      onClick={() => onSelect(recall)}
      style={{
        border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 16,
        cursor: 'pointer', background: C.bgCard, transition: 'border-color 0.15s, box-shadow 0.15s'
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderMid; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        <Badge style={cs}>{catLabel}</Badge>
        <Badge style={severityStyle(recall.severity)}>{recall.severity}</Badge>
        <Badge style={agencyStyle(recall.agency)}>{recall.agency}</Badge>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.4, marginBottom: 7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {recall.title}
      </div>
      <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.55, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {recall.description}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `0.5px solid ${C.border}`, paddingTop: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMid }}>{recall.company}</div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{recall.date}</div>
        </div>
        <span style={{ fontSize: 11, color: C.red, fontFamily: MONO }}>View →</span>
      </div>
    </div>
  )
}

function StatBar({ counts }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 10, padding: '16px 24px', borderBottom: `0.5px solid ${C.border}` }}>
      {[
        { label: 'Total', val: counts.total, color: C.text },
        { label: 'Food', val: counts.food, color: C.amber },
        { label: 'Products', val: counts.products, color: C.blue },
        { label: 'Vehicles', val: counts.vehicles, color: C.green },
        { label: 'Drugs', val: counts.drugs, color: C.purple },
        { label: 'Devices', val: counts.devices, color: C.red },
      ].map(s => (
        <div key={s.label} style={{ background: C.bgSoft, borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: s.color, fontFamily: MONO }}>{s.val}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function Nav({ page, navigate, searchQuery, setSearchQuery }) {
  const links = [
    { label: 'All Recalls', page: 'home' },
    { label: 'Food', page: 'food' },
    { label: 'Products', page: 'products' },
    { label: 'Vehicles', page: 'vehicles' },
    { label: 'Drugs', page: 'drugs' },
    { label: 'Devices', page: 'devices' },
    { label: 'Guides', page: 'guides' },
  ]
  const isActive = (p) => p === 'home' ? (page === 'home' || page === '') : page === p

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '13px 24px', borderBottom: `0.5px solid ${C.border}`, flexWrap: 'wrap', background: C.bg, position: 'sticky', top: 0, zIndex: 100 }}>
      <div
        onClick={() => navigate('home')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600, color: C.navy, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none' }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 1L2 4.5v5.5c0 4.7 3.4 9.1 8 10.2 4.6-1.1 8-5.5 8-10.2V4.5L10 1z" fill={C.red} opacity="0.15" />
          <path d="M10 1L2 4.5v5.5c0 4.7 3.4 9.1 8 10.2 4.6-1.1 8-5.5 8-10.2V4.5L10 1z" stroke={C.red} strokeWidth="1.4" fill="none" />
          <path d="M6.5 10l2.5 2.5 4.5-4.5" stroke={C.red} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        RecallChecker
      </div>
      <div style={{ display: 'flex', gap: 18, flex: 1, flexWrap: 'wrap' }}>
        {links.map(l => (
          <button
            key={l.page}
            onClick={() => navigate(l.page)}
            style={{
              fontSize: 13, color: isActive(l.page) ? C.red : C.textMid,
              cursor: 'pointer', border: 'none', background: 'none', padding: 0,
              fontWeight: isActive(l.page) ? 500 : 400, fontFamily: FONT
            }}
          >{l.label}</button>
        ))}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.redLight, color: C.red, fontSize: 11, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'rc-pulse 1.5s infinite' }} />
        Live data
      </div>
      <style>{`@keyframes rc-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </nav>
  )
}

function SearchHero({ searchQuery, setSearchQuery, activeCat, setActiveCat, onSearch }) {
  const pills = ['All', 'Food', 'Products', 'Vehicles', 'Drugs', 'Devices']
  return (
    <div style={{ padding: '40px 24px 28px', textAlign: 'center', borderBottom: `0.5px solid ${C.border}` }}>
      <h1 style={{ fontSize: 30, fontWeight: 600, color: C.navy, lineHeight: 1.2, maxWidth: 480, margin: '0 auto 8px' }}>
        Check any product recall instantly
      </h1>
      <p style={{ fontSize: 14, color: C.textMid, maxWidth: 440, margin: '0 auto 22px', lineHeight: 1.6 }}>
        Live data from FDA, CPSC &amp; NHTSA — updated continuously. Search by product name, brand, or keyword.
      </p>
      <div style={{ maxWidth: 580, margin: '0 auto' }}>
        <div style={{ display: 'flex', border: `0.5px solid ${C.borderMid}`, borderRadius: 12, overflow: 'hidden', marginBottom: 10, background: C.bg }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
            placeholder="Search recalls — e.g. Ford, Quaker Oats, Pfizer, baby monitor..."
            style={{ border: 'none', padding: '13px 16px', flex: 1, fontSize: 14, background: 'transparent', color: C.text, outline: 'none', minWidth: 0, fontFamily: FONT }}
          />
          <button
            onClick={onSearch}
            style={{ border: 'none', background: C.red, color: '#fff', padding: '0 22px', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0, fontFamily: FONT }}
          >Search</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {pills.map(p => {
            const val = p === 'All' ? 'all' : p.toLowerCase()
            const active = activeCat === val
            return (
              <div
                key={p}
                onClick={() => setActiveCat(val)}
                style={{
                  fontSize: 12, padding: '5px 13px', borderRadius: 20, cursor: 'pointer',
                  border: `0.5px solid ${active ? C.red : C.border}`,
                  background: active ? C.red : C.bg,
                  color: active ? '#fff' : C.textMid,
                  transition: 'all 0.15s'
                }}
              >{p}</div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── PAGES ───────────────────────────────────────────────────────────────────
function HomePage({ recalls, loading, navigate }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const [searched, setSearched] = useState(false)

  const filtered = recalls.filter(r => {
    const catMatch = activeCat === 'all' || r.category === activeCat
    const q = searchQuery.toLowerCase()
    const textMatch = !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.company.toLowerCase().includes(q)
    return catMatch && textMatch
  })

  const counts = {
    total: recalls.length,
    food: recalls.filter(r => r.category === 'food').length,
    products: recalls.filter(r => r.category === 'products').length,
    vehicles: recalls.filter(r => r.category === 'vehicles').length,
    drugs: recalls.filter(r => r.category === 'drugs').length,
    devices: recalls.filter(r => r.category === 'devices').length,
  }

  const barData = [
    { label: 'Food', value: counts.food },
    { label: 'Products', value: counts.products },
    { label: 'Vehicles', value: counts.vehicles },
    { label: 'Drugs', value: counts.drugs },
    { label: 'Devices', value: counts.devices },
  ]
  const barColors = [C.amber, C.blue, C.green, C.purple, C.red]

  const classI = recalls.filter(r => r.severity === 'Class I').length
  const classII = recalls.filter(r => r.severity === 'Class II').length
  const classIII = recalls.filter(r => r.severity === 'Class III').length
  const safety = recalls.filter(r => r.severity === 'Safety' || r.severity === 'Unknown').length

  const donutSegments = [
    { label: 'Class I', value: classI || 1, color: C.red },
    { label: 'Class II', value: classII || 1, color: C.amber },
    { label: 'Safety', value: safety || 1, color: C.green },
    { label: 'Class III', value: classIII || 1, color: C.blue },
  ]

  const cats = [
    { key: 'food', label: 'Food & Beverages', count: counts.food, bg: C.amberLight, color: '#8B4A00' },
    { key: 'products', label: 'Consumer Products', count: counts.products, bg: C.blueLight, color: C.blue },
    { key: 'vehicles', label: 'Vehicles', count: counts.vehicles, bg: C.greenLight, color: C.green },
    { key: 'drugs', label: 'Drugs', count: counts.drugs, bg: C.purpleLight, color: C.purple },
    { key: 'devices', label: 'Medical Devices', count: counts.devices, bg: C.redLight, color: C.red },
  ]

  return (
    <div>
      <SearchHero searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeCat={activeCat} setActiveCat={setActiveCat} onSearch={() => setSearched(true)} />
      <StatBar counts={counts} />

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, padding: '20px 24px', borderBottom: `0.5px solid ${C.border}` }}>
        <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 10 }}>Recalls by category</div>
          {loading ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
            : <BarChart data={barData} colors={barColors} />}
        </div>
        <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 10 }}>Severity breakdown</div>
          {loading ? <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
            : <DonutChart segments={donutSegments} />}
        </div>
      </div>

      {/* Category cards */}
      <div style={{ padding: '20px 24px', borderBottom: `0.5px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: C.text, marginBottom: 14 }}>Browse by category</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>
          {cats.map(cat => (
            <div
              key={cat.key}
              onClick={() => navigate(cat.key)}
              style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 14, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.borderMid}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: cat.color, fontFamily: MONO }}>{cat.key[0].toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.3 }}>{cat.label}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{cat.count} active recalls</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>View all →</div>
            </div>
          ))}
        </div>
      </div>

      {/* Latest recalls */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: C.text, marginBottom: 14 }}>
          {searchQuery || activeCat !== 'all' ? `Results (${filtered.length})` : 'Latest recalls'}
        </div>
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.textMuted, fontSize: 14 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            Loading live recall data from FDA, CPSC &amp; NHTSA…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.textMuted, fontSize: 14 }}>
            No recalls found matching your search. Try a different keyword or category.
          </div>
        )}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
            {filtered.slice(0, 12).map(r => (
              <RecallCard key={r.id} recall={r} onSelect={recall => navigate('recall-' + recall.slug)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryPage({ cat, recalls, navigate }) {
  const [searchQuery, setSearchQuery] = useState('')
  const catRecalls = recalls.filter(r => r.category === cat)
  const filtered = catRecalls.filter(r => {
    const q = searchQuery.toLowerCase()
    return !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.company.toLowerCase().includes(q)
  })
  const labels = { food: 'Food & Beverage Recalls', products: 'Consumer Product Recalls', vehicles: 'Vehicle Recalls', drugs: 'Drug Recalls', devices: 'Medical Device Recalls' }
  const descs = {
    food: 'Live food and beverage recall data from the FDA. Includes contamination, allergen, and quality recalls.',
    products: 'Consumer product recalls from the CPSC covering electronics, furniture, toys, clothing, and more.',
    vehicles: 'Vehicle safety recalls from NHTSA covering cars, trucks, SUVs, motorcycles, and auto parts.',
    drugs: 'Prescription and over-the-counter drug recalls from the FDA including contamination and labeling issues.',
    devices: 'Medical device recalls from the FDA covering implants, diagnostic equipment, and consumer health devices.',
  }

  return (
    <div>
      <div style={{ padding: '32px 24px 24px', borderBottom: `0.5px solid ${C.border}` }}>
        <button onClick={() => navigate('home')} style={{ border: 'none', background: 'none', color: C.textMid, cursor: 'pointer', fontSize: 13, marginBottom: 12, padding: 0, fontFamily: FONT }}>← Back to all recalls</button>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: C.navy, marginBottom: 8 }}>{labels[cat]}</h1>
        <p style={{ fontSize: 14, color: C.textMid, maxWidth: 560, lineHeight: 1.6, marginBottom: 20 }}>{descs[cat]}</p>
        <div style={{ display: 'flex', border: `0.5px solid ${C.borderMid}`, borderRadius: 12, overflow: 'hidden', maxWidth: 480, background: C.bg }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Search ${cat} recalls…`}
            style={{ border: 'none', padding: '11px 16px', flex: 1, fontSize: 13, background: 'transparent', color: C.text, outline: 'none', fontFamily: FONT }}
          />
        </div>
      </div>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>{filtered.length} recalls found</div>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '48px 0', color: C.textMuted }}>No recalls found.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
          {filtered.map(r => (
            <RecallCard key={r.id} recall={r} onSelect={recall => navigate('recall-' + recall.slug)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RecallDetailPage({ slug, recalls, navigate }) {
  const recall = recalls.find(r => r.slug === slug) || recalls.find(r => 'recall-' + r.slug === slug)
  if (!recall) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontSize: 20, color: C.navy, marginBottom: 8 }}>Recall not found</h2>
      <p style={{ color: C.textMid, marginBottom: 20 }}>This recall may no longer be in our database.</p>
      <button onClick={() => navigate('home')} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>Back to all recalls</button>
    </div>
  )

  const cs = catStyle(recall.category)
  const catLabel = recall.category === 'devices' ? 'Devices' : recall.category.charAt(0).toUpperCase() + recall.category.slice(1)
  const related = recalls.filter(r => r.category === recall.category && r.id !== recall.id).slice(0, 3)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ padding: '24px 0 20px' }}>
        <button onClick={() => navigate(recall.category)} style={{ border: 'none', background: 'none', color: C.textMid, cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0, fontFamily: FONT }}>← Back to {catLabel} recalls</button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <Badge style={cs}>{catLabel}</Badge>
          <Badge style={severityStyle(recall.severity)}>{recall.severity}</Badge>
          <Badge style={agencyStyle(recall.agency)}>{recall.agency}</Badge>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: C.navy, lineHeight: 1.3, marginBottom: 16 }}>{recall.title}</h1>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: C.textMid, marginBottom: 24 }}>
          <span><strong style={{ color: C.text }}>Company:</strong> {recall.company}</span>
          <span><strong style={{ color: C.text }}>Date:</strong> {recall.date}</span>
          <span><strong style={{ color: C.text }}>Status:</strong> {recall.status}</span>
          <span><strong style={{ color: C.text }}>Agency:</strong> {recall.agency}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, paddingBottom: 40 }}>
        <div>
          <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: C.navy, marginBottom: 12 }}>Reason for recall</h2>
            <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7 }}>{recall.description}</p>
          </div>

          {(recall.quantity || recall.distribution) && (
            <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, color: C.navy, marginBottom: 12 }}>Recall details</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {recall.quantity && (
                  <div style={{ background: C.bgSoft, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontFamily: MONO, textTransform: 'uppercase' }}>Quantity affected</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{recall.quantity}</div>
                  </div>
                )}
                {recall.distribution && (
                  <div style={{ background: C.bgSoft, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontFamily: MONO, textTransform: 'uppercase' }}>Distribution</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{recall.distribution}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: C.navy, marginBottom: 12 }}>What to do</h2>
            <ul style={{ paddingLeft: 18, fontSize: 14, color: C.textMid, lineHeight: 1.8 }}>
              <li>Stop using the product immediately if it matches the recall criteria</li>
              <li>Check the lot number, UPC, and date codes against the official recall notice</li>
              <li>Contact the company directly using the information in the official recall notice</li>
              <li>Return the product to the store or follow disposal instructions provided</li>
              <li>Request your remedy — repair, replacement, or refund</li>
            </ul>
            <a
              href={recall.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 16, background: C.red, color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}
            >View official {recall.agency} notice →</a>
          </div>
        </div>

        <div>
          <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.navy, marginBottom: 14 }}>Recall summary</div>
            {[
              ['Severity', recall.severity],
              ['Agency', recall.agency],
              ['Company', recall.company],
              ['Category', catLabel],
              ['Date Issued', recall.date],
              ['Status', recall.status],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: `0.5px solid ${C.border}` }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.text, textAlign: 'right', maxWidth: 160 }}>{v}</span>
              </div>
            ))}
          </div>

          {related.length > 0 && (
            <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.navy, marginBottom: 12 }}>Related {catLabel} recalls</div>
              {related.map(r => (
                <div
                  key={r.id}
                  onClick={() => navigate('recall-' + r.slug)}
                  style={{ padding: '10px 0', borderBottom: `0.5px solid ${C.border}`, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.text, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{r.date}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GuidesPage({ navigate }) {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ padding: '40px 0 24px', borderBottom: `0.5px solid ${C.border}`, marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: C.navy, marginBottom: 8 }}>Recall Guides & Resources</h1>
        <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.6, maxWidth: 520 }}>
          Plain-English guides to understanding product recalls, your consumer rights, and how to protect your household.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16, paddingBottom: 48 }}>
        {ARTICLES.map(a => (
          <div
            key={a.id}
            onClick={() => navigate(a.id)}
            style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.borderMid}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: C.redLight, color: C.red, fontFamily: MONO, fontWeight: 500 }}>{a.tag}</span>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: C.bgSoft, color: C.textMuted, fontFamily: MONO }}>{a.category}</span>
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 500, color: C.navy, lineHeight: 1.4, marginBottom: 8 }}>{a.title}</h2>
            <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.description}</p>
            <div style={{ marginTop: 12, fontSize: 12, color: C.red }}>Read guide →</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArticlePage({ articleId, navigate }) {
  const article = ARTICLES.find(a => a.id === articleId)
  if (!article) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ color: C.textMid }}>Article not found.</p>
      <button onClick={() => navigate('guides')} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontFamily: FONT, marginTop: 16 }}>Back to Guides</button>
    </div>
  )

  const relatedArticles = ARTICLES.filter(a => a.id !== article.id).slice(0, 3)

  const renderContent = (text) => text.split('\n\n').map((para, i) => {
    if (para.startsWith('**') && para.endsWith('**')) {
      return <h3 key={i} style={{ fontSize: 16, fontWeight: 500, color: C.navy, margin: '24px 0 8px' }}>{para.replace(/\*\*/g, '')}</h3>
    }
    const html = para.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    return <p key={i} style={{ fontSize: 15, color: C.textMid, lineHeight: 1.8, marginBottom: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
  })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ padding: '28px 0 32px' }}>
        <button onClick={() => navigate('guides')} style={{ border: 'none', background: 'none', color: C.textMid, cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0, fontFamily: FONT }}>← Back to Guides</button>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: C.redLight, color: C.red, fontFamily: MONO, fontWeight: 500 }}>{article.tag}</span>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: C.bgSoft, color: C.textMuted, fontFamily: MONO }}>{article.category}</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: C.navy, lineHeight: 1.3, marginBottom: 12 }}>{article.title}</h1>
        <p style={{ fontSize: 15, color: C.textMid, lineHeight: 1.7, maxWidth: 640 }}>{article.description}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 32, paddingBottom: 48 }}>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {renderContent(article.content)}
          </div>

          {article.faqs && (
            <div style={{ marginTop: 40 }}>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: C.navy, marginBottom: 16 }}>Frequently asked questions</h2>
              {article.faqs.map((faq, i) => (
                <FAQItem key={i} q={faq.q} a={faq.a} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 32, background: C.redLight, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.navy, marginBottom: 6 }}>Check for recalls now</div>
            <p style={{ fontSize: 13, color: C.textMid, marginBottom: 12 }}>Search live data from FDA, CPSC, and NHTSA — free, no sign-up required.</p>
            <button onClick={() => navigate('home')} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 500 }}>Search recalls →</button>
          </div>
        </div>

        <div style={{ paddingTop: 8 }}>
          <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.navy, marginBottom: 12 }}>More guides</div>
            {relatedArticles.map(a => (
              <div key={a.id} onClick={() => navigate(a.id)} style={{ padding: '10px 0', borderBottom: `0.5px solid ${C.border}`, cursor: 'pointer' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{a.category}</div>
              </div>
            ))}
          </div>
          <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.navy, marginBottom: 10 }}>Browse recalls</div>
            {['food', 'products', 'vehicles', 'drugs', 'devices'].map(cat => (
              <button key={cat} onClick={() => navigate(cat)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 0', fontSize: 13, color: C.textMid, cursor: 'pointer', fontFamily: FONT, borderBottom: `0.5px solid ${C.border}` }}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)} recalls →
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderTop: `0.5px solid ${C.border}`, padding: '14px 0' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: C.navy, lineHeight: 1.4 }}>{q}</span>
        <span style={{ fontSize: 18, color: C.textMuted, flexShrink: 0, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
      </div>
      {open && <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7, marginTop: 10 }}>{a}</p>}
    </div>
  )
}

function Footer({ navigate }) {
  return (
    <footer style={{ borderTop: `0.5px solid ${C.border}`, padding: '24px', background: C.bgSoft }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 6 }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M10 1L2 4.5v5.5c0 4.7 3.4 9.1 8 10.2 4.6-1.1 8-5.5 8-10.2V4.5L10 1z" fill={C.red} opacity="0.15" />
                <path d="M10 1L2 4.5v5.5c0 4.7 3.4 9.1 8 10.2 4.6-1.1 8-5.5 8-10.2V4.5L10 1z" stroke={C.red} strokeWidth="1.4" fill="none" />
                <path d="M6.5 10l2.5 2.5 4.5-4.5" stroke={C.red} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              RecallChecker
            </div>
            <p style={{ fontSize: 12, color: C.textMuted, maxWidth: 260, lineHeight: 1.6 }}>Free product recall search powered by live FDA, CPSC &amp; NHTSA data.</p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.textMid, marginBottom: 8, fontFamily: MONO, textTransform: 'uppercase' }}>Categories</div>
            {['food', 'products', 'vehicles', 'drugs', 'devices'].map(cat => (
              <button key={cat} onClick={() => navigate(cat)} style={{ display: 'block', border: 'none', background: 'none', fontSize: 13, color: C.textMid, cursor: 'pointer', padding: '3px 0', fontFamily: FONT }}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)} recalls
              </button>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.textMid, marginBottom: 8, fontFamily: MONO, textTransform: 'uppercase' }}>Resources</div>
            <button onClick={() => navigate('guides')} style={{ display: 'block', border: 'none', background: 'none', fontSize: 13, color: C.textMid, cursor: 'pointer', padding: '3px 0', fontFamily: FONT }}>Recall guides</button>
            <a href="https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts" target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 13, color: C.textMid, padding: '3px 0', textDecoration: 'none' }}>FDA recalls</a>
            <a href="https://www.cpsc.gov/Recalls" target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 13, color: C.textMid, padding: '3px 0', textDecoration: 'none' }}>CPSC recalls</a>
            <a href="https://www.nhtsa.gov/vehicle-safety/recalls" target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 13, color: C.textMid, padding: '3px 0', textDecoration: 'none' }}>NHTSA recalls</a>
          </div>
        </div>
        <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>© 2026 RecallChecker.com</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>·</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>Not affiliated with any government agency</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>·</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>Data: FDA, CPSC, NHTSA</span>
        </div>
      </div>
    </footer>
  )
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState(() => urlToPage(window.location.pathname))
  const [recalls, setRecalls] = useState([])
  const [loading, setLoading] = useState(true)

  // URL routing
  useEffect(() => {
    const handlePop = () => setPage(urlToPage(window.location.pathname))
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  const navigate = useCallback((newPage) => {
    window.history.pushState({}, '', pageToUrl(newPage))
    setPage(newPage)
    window.scrollTo(0, 0)
  }, [])

  // Fetch recalls from all APIs in parallel
  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      try {
        const [food, drugs, devices, products, vehicles] = await Promise.all([
          fetchFDA('food'),
          fetchFDA('drug'),
          fetchFDA('device'),
          fetchCPSC(),
          fetchNHTSA(),
        ])
        const all = [...food, ...drugs, ...devices, ...products, ...vehicles]
        if (all.length > 0) {
          // Sort by date (most recent first)
          all.sort((a, b) => (b.dateRaw > a.dateRaw ? 1 : -1))
          setRecalls(all)
        } else {
          setRecalls(DEMO_RECALLS)
        }
      } catch {
        setRecalls(DEMO_RECALLS)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [])

  // Determine which page to render
  const renderPage = () => {
    if (page === 'home' || page === '') return <HomePage recalls={recalls} loading={loading} navigate={navigate} />
    if (['food', 'products', 'vehicles', 'drugs', 'devices'].includes(page)) return <CategoryPage cat={page} recalls={recalls} navigate={navigate} />
    if (page === 'guides') return <GuidesPage navigate={navigate} />
    if (page.startsWith('recall-')) return <RecallDetailPage slug={page.slice(7)} recalls={recalls} navigate={navigate} />
    const article = ARTICLES.find(a => a.id === page)
    if (article) return <ArticlePage articleId={page} navigate={navigate} />
    return <HomePage recalls={recalls} loading={loading} navigate={navigate} />
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Nav page={page} navigate={navigate} />
      <main style={{ flex: 1 }}>
        {renderPage()}
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
