# WMS Demo Plan - Wow Your Stakeholders

## Pre-Demo Setup (5 minutes before)

### Quick Setup Checklist
1. **Login with test account** - Have credentials ready
2. **Ensure at least 2 warehouse sites exist** (e.g., "San Diego Distribution Center" and "Norfolk Fleet Support")
3. **Have sample inventory data** - Upload a test CSV if needed
4. **Open browser in full-screen mode**

---

## Demo Flow - 15-20 Minute Presentation

### PHASE 1: The Command Center (2 min)
**Tab: Dashboard**

**What to say:** "This is your Mission Dashboard - a real-time command center for all warehouse operations."

**Click/Show:**
1. Point to the **6 KPI cards** at the top:
   - Total Sites
   - Active Shipments  
   - Items in Transit
   - Capacity Used %
   - Aging Items (>5yr)
   - Critical Alerts

2. **Quick Actions panel** - Hover over each:
   - "Import Manifest" - Instant data upload
   - "Run Optimization" - AI-powered recommendations
   - "Generate Load Plan" - Automated planning
   - "Export Report" - Compliance reporting

3. Show the **Warehouse Sites list** with live item counts

**Key Message:** "Everything you need to see at a glance - no digging through spreadsheets."

---

### PHASE 2: Smart Inventory Management (4 min)
**Tab: Inventory**

**What to say:** "This is where your inventory lives. But unlike Excel, this actually scales."

**Click/Show:**
1. **Select a warehouse** from the dropdown
2. Show the **paginated inventory table** with:
   - Scroll to show 1000s of items loading smoothly
   - Point out NSN/NIIN columns (military compliance)
   
3. **Column Customization** (WOW moment):
   - Click the **gear icon** (Column Settings)
   - Toggle columns on/off
   - Drag to reorder
   - Say: "Every user can customize their view. Logistics sees different columns than finance."

4. **Filtering Demo**:
   - Click **Filter** button
   - Add filter: "Description contains 'valve'"
   - Add another: "Quantity greater than 10"
   - Say: "Complex queries in seconds, not SQL required."

5. **Sorting**:
   - Click a column header to sort
   - Say: "Find your highest-value or oldest items instantly."

6. **Bulk Actions**:
   - Select multiple items with checkboxes
   - Show the "Delete Selected" or "Move to Zone" options
   - Say: "Manage hundreds of items at once."

---

### PHASE 3: Transfer Operations (4 min)
**Tab: Operations**

**What to say:** "Transferring inventory between sites? Here's where the magic happens."

**Click/Show:**
1. Click **"+ New Transfer"** button
2. In the transfer modal:
   - Select **Source Site** (e.g., San Diego)
   - Select **Destination Site** (e.g., Norfolk)
   - Choose **Transport Mode**: Ground
   
3. **Item Selection** (WOW moment):
   - Check items to transfer
   - Watch the **Vehicle Preview** update in real-time:
     - "Total Weight: 15,000 lbs"
     - "Vehicles Required: 2x M1078 LMTV"
     - "Utilization: 87%"
   - Say: "The system automatically calculates how many vehicles you need."

4. Click **Create Transfer**

5. Back on the Operations tab:
   - Click on the new transfer order
   - Show the **Transfer Details Modal**:
     - Lifecycle timers (age, days in transit)
     - Status transitions
     - Destination utilization preview

**Key Message:** "No more manual calculations. No more over-allocating vehicles."

---

### PHASE 4: AI-Powered Optimization (3 min)
**Tab: AI Insights**

**What to say:** "This is where AI transforms your warehouse operations."

**Click/Show:**
1. Show the **4 Insight Cards**:
   - **Placement Optimization** - Where to store items
   - **Predictive Load Balancing** - Prevent bottlenecks
   - **Aging Alerts** - Items nearing expiry
   - **Mission Readiness Score** - Are you prepared?

2. Click **"Placement Optimization"** card
3. In the **Optimization Wizard**:
   - Select warehouse
   - Choose algorithm (CardStack for this demo)
   - Set target completion date
   - Click **Preview**
   - Say: "AI analyzes your entire inventory and recommends optimal placement."

4. Show the **Saved Plans** section:
   - "Execute when ready"
   - "Delete if no longer needed"

5. Click **"Run Analysis"** on the Aging Alerts card:
   - Show AI-generated recommendations
   - Point out severity levels

**Key Message:** "AI doesn't replace your team - it gives them superpowers."

---

### PHASE 5: Sites & Storage (2 min)
**Tab: Sites & Storage**

**What to say:** "Every site is fully configurable with zones, locations, and capacity tracking."

**Click/Show:**
1. Click a warehouse site to expand
2. Show **Zone Management**:
   - Zones with capacity meters
   - Color-coded utilization (green/yellow/red)
   
3. Click **"Add Zone"** to show zone creation:
   - Zone code
   - Storage type
   - Max weight capacity

4. Show the **zone capacity bars** filling up

**Key Message:** "Know exactly where every item is and how much room you have left."

---

### PHASE 6: Admin & Compliance (2 min)
**Tab: Admin**

**What to say:** "Full control over system configuration and data management."

**Click/Show:**
1. **Data Import Section**:
   - Select a site
   - Click "Import PDF/CSV File"
   - Show the file picker (don't actually upload)
   - Say: "Handles CSV, PDF manifests, even government-format files."

2. **System Settings**:
   - Click the Settings card
   - Show configurable options

3. **Vehicle Priority Settings** (if selling ground transport):
   - Click "Vehicle Priority Settings"
   - Show how to prioritize vehicle types
   - Say: "System automatically uses your preferred vehicles first."

---

### PHASE 7: Cross-Modal Integration (2 min)
**Go back to Hub (click "Back to Hub")**

**What to say:** "WMS doesn't work in isolation. It connects to all transport modes."

**Show the Operations Hub:**
1. Point to the **Transport Forecast panel**:
   - Expected flights, convoys, voyages
   - 30/60/90 day projections
   - Warehouse utilization
   - Capacity alerts

2. Click **"Land Logistics"**:
   - Show pending warehouse transfers
   - "Create Convoy & Assign" in one click

3. Click **"Sea Freight"**:
   - Same integration for maritime

**Key Message:** "One system. Air, Land, Sea, Warehouse. All connected."

---

## Test Cases to Prep Before Demo

### Test Case 1: Full Transfer Workflow
1. Create transfer from Site A to Site B
2. Select 5-10 items
3. Verify vehicle preview shows correct calculation
4. Create the transfer
5. Open transfer details
6. Mark as "In Transit"
7. Mark as "Completed"

### Test Case 2: Inventory Import
1. Go to Admin tab
2. Select a site
3. Upload sample CSV with 50+ items
4. Verify items appear in Inventory tab

### Test Case 3: AI Optimization
1. Go to AI Insights
2. Run Placement Optimization
3. Save a plan
4. View saved plan

### Test Case 4: Zone Management
1. Go to Sites & Storage
2. Add a new zone to a site
3. Set capacity limits
4. Verify zone appears

---

## Demo Talking Points

### Problem Statement
"Managing military logistics across multiple warehouses and transport modes is complex. Excel breaks. Emails get lost. Compliance suffers."

### Solution Statement  
"ARKA WMS provides a unified platform that:
- Tracks every item across every site
- Automates vehicle allocation
- Uses AI for optimization
- Integrates with Air, Land, and Sea logistics
- Ensures DLA compliance"

### ROI Points
- "Reduce manual data entry by 80%"
- "Eliminate vehicle over-allocation waste"
- "Real-time visibility prevents stockouts"
- "AI optimization improves warehouse efficiency by 15-25%"

---

## Quick Recovery Tips

**If something breaks:**
- "Let me refresh that view" (click Refresh button)
- "The demo environment occasionally needs a moment" (wait 2-3 seconds)

**If asked a hard question:**
- "That's a great question. Let me show you how that works..." (navigate to relevant feature)
- "We can configure that in the Admin section"

**If data looks empty:**
- "In a production environment, this would show your actual inventory data"
- Always have backup screenshots ready

---

## System Requirements Reminder
- Modern browser (Chrome/Edge recommended)
- Stable internet connection
- Screen resolution 1920x1080 or higher for best appearance
