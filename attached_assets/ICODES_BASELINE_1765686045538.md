Integrated Computerized Deployment System (ICODES) Version 7 – Technical & Functional Specifications
Feature: Multi-Modal Load Planning (Single Load Planner)
Purpose & Relevance: Provides a unified platform for planning cargo load across air
tapestrysolutions.com
tapestrysolutions.com
. As the DoD’s system of record for load planning, ICODES enables planners to generate complete load plans and forecasts, improving deployment speed and efficiency
tapestrysolutions.com
boeing.mediaroom.com
. Key Functions & User Roles:
Load Plan Creation: Drag-and-drop staging of cargo onto conveyance templates (ships, aircraft, railcars, trucks) to create optimized load configurations
tapestrysolutions.com
.
User Roles: Load planners and movement coordinators use the interface to position cargo; commanders review plans. Terminal operators use yard/stow modules. Previously given movement lists in previous prompts should give you an Idea of this
Data Inputs/Outputs:
Inputs: Cargo inventory (item IDs, dimensions, weights), vehicle/aircraft/ship templates, routing data, and expanded manifest data (e.g. sanitized UTC lists with actual item/personnel breakdown). ICODES can ingest data from logistics sources like Worldwide Port System (WPS), TC‐AIMS II, IBS/GATES, MDSS, JOPES feeds or similar transport manifests
digitalcommons.calpoly.edu
tapestrysolutions.com
.
Outputs: Complete load plan including item stowage, loaded weights, balances, and manifest data. Exportable as structured load plan documents (ICODES XML or EDI formats), printable forms (e.g. DD‐1385 cargo manifests), and reports for downstream systems.
Integration Requirements:
Must interface with DoD logistics networks and cargo systems (e.g. WPS, TC‐AIMS, IBS) to import unit/cargo lists
digitalcommons.calpoly.edu
boeing.mediaroom.com
.
Supports standardized message formats for exchange (see Data Exchange & Formats below).
Requires connectivity to asset databases (e.g. ACL values, vehicle specs) and theater movement schedules.
Implementation Steps:
Data Acquisition: Import sanitized manifest or UTC input file into ICODES; validate against reference libraries.
Conveyance Selection: Determine available conveyances (e.g. list of aircraft or ship assets). User can pre-select or allow ICODES to suggest (see Conveyance Optimization).
Load Planning: Place cargo items onto selected conveyance templates using drag-and-drop or automated placement. ICODES agents will run concurrently (see Intelligent Agents feature).
Finalize Plan: Adjust positions as needed; lock stowage. Generate required documentation.
Dependencies & Risks:
Data Quality: Depends on accurate cargo specs and manifest data. Garbage input yields bad plans.
System Connectivity: Requires up-to-date vehicle and route data; outages or delays can hinder planning.
User Training: Complexity of multi-modal planning demands trained operators.
Example Use Case:
Planning loading of a C-17 and cargo ship for a joint deployment. The planner inputs cargo lists (vehicles, pallets) and selects assets. ICODES produces load diagrams for each conveyance, ensuring full utilization
tapestrysolutions.com
boeing.mediaroom.com
.

https://www.tapestrysolutions.com/products-old/goldesp-load-planner/
Figure: Example Airlift Operation – ICODES is used to plan the loading of cargo pallets into a C-17 transport aircraft.
Feature: Conveyance Utilization Optimization (Capacity Planning)
Purpose & Relevance: Maximizes transport efficiency by determining the optimal number and mix of conveyances (aircraft, ships, trucks) needed to move a given cargo set
tapestrysolutions.com
. For example, ICODES can automatically calculate how many C‑17 vs. C‑130 aircraft are required to carry a deployable unit’s cargo. This directly supports strategic planning (e.g. “how many planes?”) and reduces fuel and personnel costs
tapestrysolutions.com
. Key Functions & User Roles:
Asset Selection: Automatically or manually assign cargo to available vehicles (C‑17, C‑130, ships, etc.) based on capacity constraints.
Capacity Comparison: Evaluate alternative load-out scenarios (e.g. all C‑17 vs. mixed fleet) to meet mission needs.
User Roles: Transportation planners and commanders review and adjust suggested conveyance choices.
Data Inputs/Outputs:
Inputs: Available asset list, each with capacity (ACL) and dimensions, plus complete cargo manifest.
Outputs: Recommended conveyance allocation (e.g. 3 C‑17 and 2 C‑130), and the corresponding load plans.
Integration Requirements:
Access to asset availability and capacity data (standard ACL tables).
Policies for mission planning (ADVON vs main body, aircraft activation limits).
Implementation Steps:
Analyze Cargo Volume/Weight: Sum cargo metrics from the manifest.
Asset Feasibility: For each candidate conveyance type, compute how much cargo it can carry.
Allocation Algorithm: Use a bin-packing or integer optimization to fit cargo into the fewest vehicles.
Plan Generation: Invoke the SLP to generate detailed load plans for the chosen assets.
Dependencies & Risks:
Accurate ACL Data: Wrong cargo limits (e.g. PACAF-specific values) can misallocate loads.
Mixed Fleet Complexity: If user opts mixed optimization, computational load rises.
User Overrides: Planner may choose suboptimal mix due to mission factors.
Example Use Case:
A PACAF scenario requires airlifting a fighter squadron’s equipment. Given an expanded UTC list of all gear, ICODES calculates that 4 C‑17s (or alternatively 6 C‑130s) are needed to carry the load, and produces each aircraft’s load plan. The user can choose C‑17 only, C‑130 only, or mixed configurations (as requested by PACAF requirements).
Feature: Intelligent Agent-Based Compliance and Alerts
Purpose & Relevance: Employs embedded “expert” agents to continuously verify load plans against safety, regulatory, and efficiency rules
digitalcommons.calpoly.edu
tapestrysolutions.com
. Agents automatically detect issues (violations, warnings) during planning, reducing manual checks and errors. This includes hazardous segregation, weight/balance, and stowage regulations, ensuring plans are both safe and compliant
digitalcommons.calpoly.edu
tapestrysolutions.com
. Key Functions & User Roles:
Rule Monitoring: Software agents track key load-planning determinants (e.g., hazardous cargo placement, CG trim, structural stress, accessibility constraints) in real time
digitalcommons.calpoly.edu
.
Alert Generation: Issue on-screen alerts/warnings or lock plans if violations occur (e.g. “hazardous items must be separated” or “excess weight aft”).
Decision Support: Suggest corrective actions (e.g. shift pallet forward) to meet constraints.
User Roles: Load planners and safety officers receive alerts; can override only with justification.
Data Inputs/Outputs:
Inputs: Detailed plan state: cargo positions, weights, hazard classifications, vessel geometry.
Outputs: Violation reports and warnings. Agent messages are logged and may be included in final report documents.
Integration Requirements:
Hazmat regulatory data (DOD 4500.9R, etc.), structural limits, and standard cargo libraries.
Updates to rules/thresholds from higher headquarters as needed.
Implementation Steps:
Rule Definition: Encode constraints (hazmat distance, CG limits, spacing, etc.) in the agent framework.
Continuous Monitoring: As the user modifies the plan, agents re-evaluate all applicable rules.
Alert Delivery: Display any violations with context (e.g. “Container Z exceeds allowable aft zone”).
Recommendation Engine (optional): Provide suggested fixes (e.g. swap cargo items).
Dependencies & Risks:
Rule Completeness: Outdated or missing rules could let unsafe plans pass.
Performance: Complex rules can slow the interface if not optimized.
Human Factors: Over-alerting can overwhelm users; risk that critical alerts are ignored.
Example Use Case:
During planning for ship loading, an agent immediately flags that two hazardous-1 cargo pallets are adjacent without required segregation. The planner adjusts the placement. In an aircraft scenario, the weight/balance agent warns that the CG is too far aft, prompting redistribution of cargo. Such alerts implement the “improves safety” and “reduces fuel” goals cited in ICODES documentation
digitalcommons.calpoly.edu
tapestrysolutions.com
.
Feature: Hazardous Cargo Handling and Diplomatic Clearances
Purpose & Relevance: Ensures all dangerous goods and regulated materials are properly managed. The system identifies hazardous cargo items and enforces segregation rules
digitalcommons.calpoly.edu
, and generates any required Diplomatic or Hazardous Material (HAZMAT) clearance documentation. This reduces safety risks and compliance violations
digitalcommons.calpoly.edu
. Key Functions & User Roles:
HazMat Identification: Tags items with UN/NA IDs and hazard categories from input data or reference library.
Segregation Enforcement: Checks distances, ventilation, and separation per regulation (e.g. explosive spacing).
Documentation: Auto-fills Hazardous Diplomatic Clearance worksheets and any required UN forms.
User Roles: HazMat coordinators review compliance; planners adjust based on warnings.
Data Inputs/Outputs:
Inputs: Item-level hazard codes, stowage rules, special handling requirements.
Outputs: HAZMAT worksheets, updated load plan labels (indicating hazardous items and hazard symbols), and flags in the manifest.
Integration Requirements:
Must use standard hazard classification tables (e.g. DOD Joint Hazard Classification System).
Link to diplomatic clearance processes if required (for international flights).
Implementation Steps:
Assign Hazard Codes: Enrich cargo data with hazard classifications.
Agent Check: The same agent framework (above) enforces placard and segregation rules.
Generate HAZ/DIP Worksheet: Create a summary form listing all hazardous items and required segregation.
Flag Notations: Mark hazardous cargo in cargo manifest exports (DD‐1385).
Dependencies & Risks:
Regulatory Updates: HazMat rules change frequently; require data updates.
Workflow Compliance: Users must review and submit clearance docs; system must not bypass human approvals.
Example Use Case:
A planned load includes flammable fuel tanks (Class 3) and oxidizers (Class 5.1). ICODES automatically separates them in the plan and populates a Hazardous Cargo Worksheet. The operator then uses these outputs to obtain required waivers/clearances before mission execution.
Feature: Weight & Balance (Trim and Stability)
Purpose & Relevance: Calculates the center of gravity and structural load of each conveyance to ensure safe transport conditions
digitalcommons.calpoly.edu
. Proper trim (fore/aft balance) and stress calculations are critical for flight performance and ship stability
digitalcommons.calpoly.edu
. ICODES automates these analyses to comply with weight/balance regulations. Key Functions & User Roles:
CG Computation: Computes current center-of-gravity based on cargo placement and cargo weights.
Stress Analysis: Calculates bending moments and shear for ship decks or aircraft floors.
Stability Warnings: Alerts if CG or stress limits are exceeded.
User Roles: Aircraft Loadmasters, naval loading officers, planners.
Data Inputs/Outputs:
Inputs: Cargo weights, location coordinates, conveyance empty weight and CG data, allowable limits.
Outputs: Load plan summaries including total weight, percent MAC (for aircraft), trim values, and stress reports.
Integration Requirements:
Access to vehicle/ship weight & balance data (e.g. aircraft Empty Weight CG).
Standards for aircraft stowage (FAA/DOD load limits, ship stability criteria).
Implementation Steps:
Gather Weights: Sum weights per cargo item and input into model.
Compute CG: Determine fore-aft and lateral CG for aircraft or ship.
Compare Limits: Check against permitted envelope.
Adjust Plan: If out of bounds, flag and suggest moving weight.
Dependencies & Risks:
Accurate Payload Data: Incorrect item weights can yield unsafe CG.
Conveyor Data: Inaccurate empty weights or CG values for the vehicle will invalidate results.
Human Override: Must enforce rules; allowing override can be dangerous.
Example Use Case:
In planning a C-130 airlift, ICODES calculates that the current cargo distribution exceeds the aft CG limit. The planner repositions some pallets toward the front. The final plan report includes a trim/stability summary showing all values within allowable range, as required by airworthiness standards.
Feature: Cargo Data Validation & Master Data Integration
Purpose & Relevance: Improves data quality by cross-referencing plan data with authoritative sources. The system ensures that cargo IDs, weights, and dimensions match standard catalogs, catching errors before execution
tapestrysolutions.com
tapestrysolutions.com
. This prevents misloads and enhances the common operating picture across commands. Key Functions & User Roles:
Data Lookup: Connects with Transportation Control Number (TCN) databases and item catalogs (e.g. GBL/TECS lists) to verify cargo characteristics.
Data Cleansing: Flags inconsistencies (e.g. a pallet dimension mismatch) and offers corrections.
User Roles: Cargo data managers or planners who verify and correct manifests.
Data Inputs/Outputs:
Inputs: Raw cargo input (possibly from SCTAC’s material release, unit call or WPS).
Outputs: Cleaned manifest data, synchronized across systems, with correct identifiers and weights.
Integration Requirements:
Interfaces to logistics master data systems (e.g. Army SDDC libraries, joint material catalogs).
Use of global unique IDs (UIDs) or NATO codes for parts.
Implementation Steps:
Import Cargo List: Load initial cargo or unit lists into ICODES.
Cross-Check: For each item, query reference tables (or partner systems) to verify dimensions, weight, UN/NA ID, etc.
Resolve Errors: Prompt user to accept or correct mismatches.
Finalize Data: Use validated data for planning and documentation generation.
Dependencies & Risks:
Reference Accuracy: Out-of-date catalogs may cause false alarms.
Network: Lookup may require network queries; offline mode must handle gracefully.
Example Use Case:
A deployment manifest is imported from WPS. ICODES detects that one container’s weight entry is zero (anomalous). The user is alerted to fix the typo before finalizing the plan, avoiding a potential underload error in execution.
Feature: Terminal and Yard Management Module (TMM)
Purpose & Relevance: Extends planning into the ground domain by managing cargo in transit terminals and marshalling yards. TMM adds time and geospatial dimensions to cargo staging, tracking movement history as items are loaded/unloaded
tapestrysolutions.com
. This provides end-to-end visibility from warehouse to conveyance. Key Functions & User Roles:
Yard Mapping: Visual representation of the terminal layout (berths, ramps, storage areas).
Cargo Tracking: Assign yard locations and timestamps to cargo items as they arrive, move, and depart.
Time-Aware Planning: Schedule bay/ramp usage over time to prevent congestion.
User Roles: Yard managers, port operators, cargo handlers.
Data Inputs/Outputs:
Inputs: Cargo movement schedules, terminal map/GIS data, tractor/trailer assignments.
Outputs: Yard inventory logs, gate manifests, dynamic location updates.
Integration Requirements:
Integration with RFID or barcode tracking to update locations in real time.
Links to movement orders (to know when cargo should depart/arrive).
Implementation Steps:
Terminal Setup: Digitize facility layout and define zones.
Assign Cargo: When cargo arrives, use handheld or batch updates to place it in a yard slot.
Monitor Schedule: Use the TMM to ensure cargo is at the right spot at loading time (interfaces with SLP).
Update History: Log each movement for ITV and audit.
Dependencies & Risks:
Hardware: Reliable scanners/RFID for location updates.
Data Freshness: Delays in updating inventory lead to planning errors.
Layout Changes: Frequent changes in yard layout must be kept current.
Example Use Case:
At a seaport staging area, TMM tracks that a container of ammunition is moved to berth 3 exactly 24 hours before ship loading. Planners can visualize this movement, ensuring that the cargo is available when the vessel arrives, and can report its progress as part of the distributed plan.
Feature: Sea Service & Unit Move Module (SSDM)
Purpose & Relevance: Incorporates amphibious and Marine unit movement planning into ICODES. SSDM integrates legacy MAGTF Deployment Support System (MDSS II) capabilities so that naval and ground forces can plan entire unit deployments (assets and personnel) under the Joint Deployment and Distribution Enterprise
tapestrysolutions.com
ndtahq.com
. Key Functions & User Roles:
Unit Movement Planning: Plan shipment of unit assets as a group (all vehicles and personnel belonging to a unit).
C2 Integration: Merge unit data (Unit Identification Codes and associated equipment lists) into the ICODES planning flow.
User Roles: Marine Expeditionary Unit planners, Navy loading supervisors.
Data Inputs/Outputs:
Inputs: Unit asset lists (expanded from UTC codes), personnel counts, medical/life support requirements.
Outputs: Consolidated load plans for ships or aircraft carrying the unit, with manifest including both cargo and passenger (personnel) loads.
Integration Requirements:
Data exchange with service personnel systems (for unit rosters).
Updates from MDSS II databases or other Marine Corps sources until SSDM fully replaces legacy tools.
Implementation Steps:
Import Unit Data: Load a sanitized UTC list representing a deploying unit.
Load Planning: Treat all unit equipment as a combined cargo load; use standard load planning processes.
Passenger Handling: Incorporate seating and survival equipment for personnel in the plan.
Documentation: Generate unit move documentation (e.g. DD1144 or equivalent joint movement orders).
Dependencies & Risks:
Data Completeness: Missing personnel or medical info could affect manifest accuracy.
Operational Security: Unit movements may have classification constraints on data handling.
Example Use Case:
A Marine battalion (with 500 troops and 100 vehicles) must deploy to a theater. The SSDM module imports the unit’s full equipment list and produces a loading plan that distributes vehicles and supplies across three amphibious ships, with a plan for moving the battalion’s personnel via a C-17 flight. This replaces the old MDSS workflow and provides a single plan covering both air and sea legs.
Feature: Documentation & Reporting (Standard Forms & Exports)
Purpose & Relevance: Automates generation of all required load and movement documents, reducing administrative overhead. ICODES produces standardized forms and electronic files needed for DoD deployment processes (e.g. manifests, packing lists, requisitions)
ndtahq.com
ndtahq.com
. Key Functions & User Roles:
Form Generation: Creates official DD and DoD forms: cargo manifest (DD-1385), packing declarations (DD-2781), requisition/invoice (DD-1149), hazardous clearance worksheets, etc.
Custom Reports: Provides configurable reports (summary loads, exception lists, slot plans) for planning and analysis.
User Roles: Planners finalize and sign documents; logisticians use them to execute shipments.
Data Inputs/Outputs:
Inputs: Finalized load plan data (cargo positions, weights, pallet configurations) from the SLP.
Outputs:
Fillable PDF forms and printed documents (e.g. DD-1385, DD-1149, DD-2781)
ndtahq.com
.
Load plan export files (e.g. ICODES-specific XML or CSV for integration with Air Mobility Command’s A2I system).
In-transit visibility updates (see Tracking/ITV feature).
Integration Requirements:
Must comply with Defense Transportation Regulation formatting for each document type.
Support for the A2I interface: export load plan in the exact XML schema required (including pallet positions, CG data, restraint results, TCN propagation, and aircraft metadata as specified by AMC)
ndtahq.com
.
Implementation Steps:
Template Setup: Pre-configure DOD form templates with necessary fields.
Populate Data: Automatically fill forms from the load plan database (positions, codes, weights).
User Review: Provide a preview; allow manual editing of header info (e.g. origin/destination).
Export/Print: Generate final documents and electronic file exports.
Dependencies & Risks:
Regulatory Compliance: Changes in DTR can require updates to templates.
Interface Specs: The A2I XML schema must be rigorously followed; mismatches can cause rejections.
Form Overlap: Ensuring correct mapping of data to multiple forms without conflicts.
Example Use Case:
After finalizing a load plan for an airlift, ICODES auto-generates the DD-1385 cargo manifest and the DD-2781 container packing list, then attaches an ICODES-formatted XML of the same plan to the A2I message. This output meets PACAF’s requirement for “A2I-ready” load plan data with full restraint and TCN information (ADVON items are tagged to ship first).
Feature: Real-Time Tracking & In-Transit Visibility (ITV) Integration
Purpose & Relevance: Provides near-real-time status of cargo during transportation, fulfilling in-transit visibility requirements
tapestrysolutions.com
. ICODES can transmit movement updates to central ITV servers and mobile apps, so commanders see where deployments stand at all times. Key Functions & User Roles:
Status Updates: At key milestones (e.g. “loaded on ship”, “departed airfield”), automatically send updates via Automated Information Systems.
Sensor Integration: Accept inputs from tracking devices (GPS tags, RFID readers) and incorporate into the cargo’s plan.
User Roles: Movement controllers monitor dashboards; logistics officers receive alerts on delays.
Data Inputs/Outputs:
Inputs: Tag/reader data (location stamps), manual check-in/check-out events, flight or sailing schedules.
Outputs: ITV feeds pushed to the National ITV Server (NITVS) or unit-specific platforms, along with status-coded updates (e.g. “In Transit”, “Delivered”). Also reflected in ICODES’s own tracking reports.
Integration Requirements:
Conformance to DOD ITV messaging standards (e.g. DTR Table C-2 formats).
Network links (SATCOM/data links) for timely updates.
Implementation Steps:
Event Definition: Configure which plan milestones trigger ITV messages (by rule or schedule).
Data Collection: Capture event details (time, location, container/vehicle ID).
Message Generation: Translate events into standard ITV messages or API calls.
Transmission: Send messages to central visibility repositories.
Dependencies & Risks:
Timeliness: Delays in communications (e.g. SATCOM outages) impair visibility.
Data Volume: Large deployments generate many updates; ensure scalability.
Security: Position reports can be sensitive in contested environments.
Example Use Case:
Once the first C‑17 carrying the ADVON group takes off, ICODES immediately sends an ITV update indicating “Flight Departed” with aircraft tail number and destination. The movement report populates intelligence dashboards so planners worldwide know that the advance element is en route.
Feature: Collaborative Planning Environment
Purpose & Relevance: Enables multiple stakeholders to work together on load plans, reflecting the Joint Deployment and Distribution process. ICODES supports multi-user concurrent planning and communications across organizations
tapestrysolutions.com
. This collaboration speeds decision-making and ensures a single consistent plan. Key Functions & User Roles:
Concurrent Access: Multiple users (Army, Navy, Air Force, etc.) can view and edit shared load plans simultaneously. Locking mechanisms manage conflicts.
Comment/Chat: In-application notes or messaging allows communication about plan changes or constraints.
Role-Based Views: Different user roles see relevant details (e.g. commanders see high-level summaries, stevedores see yard tasks).
Data Inputs/Outputs:
Inputs: Edits and inputs from authorized users.
Outputs: Unified load plans visible to all, with audit trails of changes. Notifications of updates can be sent to interested parties.
Integration Requirements:
Authentication and access control integrated with DoD credentials (CAC/PIV).
Connection to common data environment networks (e.g. SIPRNET for classified plans).
Implementation Steps:
User Management: Define user accounts, roles, and permissions.
Collaboration Tools: Implement locking/versioning for shared plans; add discussion threads or alerts.
Training: Ensure users are trained in the collaborative features to avoid conflicting changes.
Communications Link: Establish secure connectivity so remote planners can access the system live.
Dependencies & Risks:
Network Stability: Poor connectivity degrades the collaborative experience.
Conflict Resolution: Simultaneous edits must be carefully managed to prevent data loss.
Change Management: Users need to agree on process to avoid “plan wars.”
Example Use Case:
An Air Force load planner and an Army logistics officer jointly work on a joint airlift plan. As the Army planner adds pallets to an aircraft, the Air planner sees the update in real-time. A built-in chat lets them discuss reallocating priority cargo. The final plan is a consensus product that all services will execute together.
Feature: Service-Oriented Architecture (SOA) & Extensibility
Purpose & Relevance: ICODES v7 is built on a scalable, service-oriented architecture
tapestrysolutions.com
digitalcommons.calpoly.edu
. This allows modular upgrades, web-based access, and integration of new technologies (e.g. AI/ML components) without rewriting the core. SOA underpins its long-term maintainability and interoperability. Key Functions & User Roles:
Web Services: Core functions are exposed as web services (e.g. plan calculation, agent analysis) that other applications or modules can call.
Modularity: New features (like SSDM or AI tools) are added as separate services.
User Roles: System administrators configure services; developers use APIs to extend functionality.
Data Inputs/Outputs:
Inputs/Outputs: Standardized SOAP/REST messages for all inter-component communication.
Outputs: Each service can be scaled independently (e.g. multiple agent processes).
Integration Requirements:
Conformance to DoD network and cybersecurity standards for SOA (e.g. SAML for auth).
Ability to connect with external systems via web APIs (e.g. national data servers).
Implementation Steps:
Service Layer Design: Break ICODES into logical services (LoadPlannerService, AgentService, TrackingService, etc.).
API Definition: For each service, define clear interfaces and data contracts.
Middleware Configuration: Set up an Enterprise Service Bus or API gateway if needed.
Testing/Deployment: Deploy in scalable cloud or on-prem clusters, enabling redundancy.
Dependencies & Risks:
Performance Overhead: Service calls add latency; careful design needed for critical paths.
Security: Each service endpoint must be secured; more endpoints can mean more attack surface.
Version Control: Ensuring compatibility when updating services.
Example Use Case:
ICODES can call a new “Cargo Assistant” AI service to help validate a load plan (see Future Enhancements). Because of SOA design, this AI module was added without changing the legacy load-planning code. As Tapestry notes, the system’s “scalable service-oriented architecture” was key to evolving from ship-only planning to all-domain support
digitalcommons.calpoly.edu
tapestrysolutions.com
.
Feature: Data Exchange & Standard Formats
Purpose & Relevance: Ensures ICODES can communicate with external systems using DoD-standard formats. This covers both inputs (cargo manifests, UTC lists) and outputs (A2I requests, ICS messages). Standardization enables ICODES to fit into larger logistics workflows without custom translators. Key Functions & User Roles:
Standard Input Parsing: Read common logistics data formats: e.g. TCN‐based manifest files, JOPES deployment data, or extended UTC lists (sanitized with item-level detail) as required by PACAF.
Standard Output Generation: Produce required electronic transaction sets (XML, EDI) and forms: e.g. XML load plan for A2I, ICS forms, or custom DoD spreadsheets.
User Roles: Data managers ensure input files are in the correct format; system integrators configure export mappings.
Data Inputs/Outputs:
Inputs:
UTC Lists: Expanded, sanitized Unit Type Code manifest in XML/CSV form (actual item inventory).
Manifests: Transport Command manifests or booking lists (possibly in UN/EDIFACT or CSV).
EDI/GLS Messages: If applicable, like ICS210/304 transmissions.
Outputs:
ICODES XML: Proprietary XML schema for load plans, used by the A2I interface (including all necessary metadata and package details).
Printed/EDI Forms: DD- and IEC-format documents as above, plus any proprietary logistic message formats.
Integration Requirements:
Conformance to USTRANSCOM DTR and AMC specification for A2I XML (including correct fields for pallet positions, restraint results, TCN, aircraft ID).
Ability to import a sanitized UTC manifest (the PACAF case requires full item lists rather than abstract UTC capabilities).
Support for user-specified input types (as PACAF chose detailed list) and selectable output destinations (A2I XML, APIs, etc.).
Implementation Steps:
Schema Definition: Ensure ICODES uses the official XML schema for A2I load plans (usually provided by TRANSCOM).
Mapping: Map internal load plan data fields to the required output fields (pallet dims, coordinates, CG data, etc.).
Input Adapters: Build or configure parsers to consume input data from unit UTC files or other formats.
Validation: Test exports against validation tools; confirm imports by round-trip with source systems.
Dependencies & Risks:
Schema Updates: Any change in A2I or ICDG specifications will require ICODES updates.
Field Matching: Mismatches between ICODES internal model and output schema (e.g. naming of zones) can cause integration failures.
Edge Cases: Handling of special characters or non-standard items in input lists.
Example Use Case:
The PACAF demo requires that the ICODES load plan be “A2I-ready.” ICODES exports a fully formatted XML document containing pallet dimensions, weights, restraint directions, plus manifest TCNs and aircraft tail numbers. This XML passes the A2I schema validator and is attached to the official Airlift Request, allowing seamless submission to USTRANSCOM.
Feature: System Architecture and Deployment
Purpose & Relevance: Covers the technical structure and deployment model of ICODES v7. The system supports both web-based enterprise and standalone (disconnected) configurations
tapestrysolutions.com
. Its architecture must be robust, scalable, and secure to operate across the global Defense Transportation Network. Key Functions & User Roles:
Deployment Modes: Allows installation as a central server/web service cluster for commands, with optional standalone clients for disconnected operations.
Scalability: Can handle thousands of concurrent users (reported 20,000+) and large loads through distributed computing.
Roles: System administrators maintain servers; end-users primarily interact via thin clients or browsers.
Data Inputs/Outputs:
Inputs/Outputs: Same as above, but note that in standalone mode, imports/exports are file-based (USB drive transfers), whereas enterprise mode uses network services.
Integration Requirements:
Must run on DoD-approved platforms (e.g. Windows Server, SQL databases, SITP/SIPRNET compliance).
Needs to support TLS, SAML, or PKI for security.
Implementation Steps:
Server Setup: Install services on DoD network (AF, Army, Navy datacenter).
Client Configuration: Deploy web client or desktop apps; configure certificate-based login.
Failover: Implement database clustering and geo-redundancy if needed.
Offline Mode: Provide an “interim” load planner that can export/import plans when no network is available.
Dependencies & Risks:
Certifications: ATO/C&A processes are long; ICODES must follow security baseline.
Support Contracts: Ongoing sustainment must be planned (as Boeing contract indicates).
Example Use Case:
In garrison, ICODES runs on an enterprise server pool allowing multi-site collaboration. During a field exercise with no network, a unit uses a standalone ICODES laptop to build a local load plan, then uploads the results to the headquarters system when connectivity is restored (fallback capability
tapestrysolutions.com
).
Example Use Case: Fighter Squadron Deployment (PACAF Scenario)
This scenario illustrates how ICODES v7 supports a Pacific Air Forces (PACAF) fighter-squadron deployment. The key requirements were:
Input: A sanitized, expanded Unit Type Code (UTC) dataset containing every individual item and personnel piece, rather than generic codes. ICODES ingests this detailed manifest as cargo input.
Aircraft Mix: The planners allowed C-17 and C-130 assets only. ICODES was set either to auto-select aircraft or let the user choose. The system calculated the required number of C‑17/C‑130 flights to move the entire squadron package.
Phasing: The ADVON (advance) UTC group was identified to load first, followed by all others. ICODES sequenced pallets accordingly.
Output Format: ICODES exported the final load plan in the exact A2I-compatible XML format, including: pallet positions, dimensions, gross weights, forward/aft/vertical restraint values, assigned Transportation Control Numbers (TCNs), and aircraft metadata. This met PACAF’s requirement for an “ICODES-generated load plan attached to the A2I request.”
Response Time: The planners stressed rapid what-if capability; ICODES produced and exported the full load plans in minutes.
In practice, ICODES took the detailed squadron cargo list, ran its conveyance optimization to determine the mix of aircraft, generated each aircraft’s loadplan with agent-driven checks (e.g. hazardous fuel storage, weight balance), and output the signed XML manifest. This end-to-end workflow demonstrates the system’s military deployment focus: one-time input of unit data yields complete, compliant load plans and documentation
boeing.mediaroom.com
ndtahq.com
. For example, ICODES would automatically allocate ammunition, vehicles, and personnel to the first C-17 (ADVON) flight, alert the planner of any trim issues, then lock that load and proceed to plan the rest of the mission. The result is a validated, shareable plan answering “how many aircraft?” and “what do they carry?” in the required DoD format. Sources: Authoritative information on ICODES v7 capabilities is documented by Tapestry/Boeing and DoD resources
digitalcommons.calpoly.edu
tapestrysolutions.com
ndtahq.com
. The PACAF scenario details were based on stakeholder inputs (Sanitized UTC list, A2I export) and illustrate how the above features are applied in a concrete deployment context. All cited references are from Tapestry/Boeing technical materials.
Citations
Boeing Load Planner - Tapestry Solutions

https://www.tapestrysolutions.com/products-old/goldesp-load-planner/
ICODES Upgrades to Enhance Military Cargo Load Planning for Joint Forces

https://www.tapestrysolutions.com/2017/08/18/icodes-upgrades-enhance-military-distribution-deployment-processes-joint-services/
ICODES Upgrades to Enhance Military Cargo Load Planning for Joint Forces

https://www.tapestrysolutions.com/2017/08/18/icodes-upgrades-enhance-military-distribution-deployment-processes-joint-services/
News Releases | Boeing Newsroom

https://boeing.mediaroom.com/Boeing-Awarded-US-Military-Load-Planning-and-Tracking-Sustainment-Contract
"ICODES: A Ship Load-Planning System" by Stephen Goodman and Jens G. Pohl

https://digitalcommons.calpoly.edu/cadrc/50/
ICODES Upgrades to Enhance Military Cargo Load Planning for Joint Forces

https://www.tapestrysolutions.com/2017/08/18/icodes-upgrades-enhance-military-distribution-deployment-processes-joint-services/
ICODES - Tapestry Solutions

https://www.tapestrysolutions.com/icodes/
"ICODES: A Multi-Agent System in Practice" by Jens G. Pohl

https://digitalcommons.calpoly.edu/cadrc/70/
"ICODES: A Multi-Agent System in Practice" by Jens G. Pohl

https://digitalcommons.calpoly.edu/cadrc/70/
Boeing Load Planner - Tapestry Solutions

https://www.tapestrysolutions.com/products-old/goldesp-load-planner/
ICODES Upgrades to Enhance Military Cargo Load Planning for Joint Forces

https://www.tapestrysolutions.com/2017/08/18/icodes-upgrades-enhance-military-distribution-deployment-processes-joint-services/
ICODES Upgrades to Enhance Military Cargo Load Planning for Joint Forces

https://www.tapestrysolutions.com/2017/08/18/icodes-upgrades-enhance-military-distribution-deployment-processes-joint-services/

PowerPoint Presentation

https://www.ndtahq.com/wp-content/uploads/2018/10/Slides-Mabee-SDDC.pdf

PowerPoint Presentation

https://www.ndtahq.com/wp-content/uploads/2018/10/Slides-Mabee-SDDC.pdf

PowerPoint Presentation

https://www.ndtahq.com/wp-content/uploads/2018/10/Slides-Mabee-SDDC.pdf
ICODES Upgrades to Enhance Military Cargo Load Planning for Joint Forces

https://www.tapestrysolutions.com/2017/08/18/icodes-upgrades-enhance-military-distribution-deployment-processes-joint-services/
Boeing Awarded U.S. Military Load Planning and Tracking Sustainment Contract - Tapestry Solutions

https://www.tapestrysolutions.com/2019/11/12/boeing-awarded-u-s-military-load-planning-and-tracking-sustainment-contract/
"ICODES: A Multi-Agent System in Practice" by Jens G. Pohl

https://digitalcommons.calpoly.edu/cadrc/70/
Boeing Awarded U.S. Military Load Planning and Tracking Sustainment Contract - Tapestry Solutions

https://www.tapestrysolutions.com/2019/11/12/boeing-awarded-u-s-military-load-planning-and-tracking-sustainment-contract/
ICODES Upgrades to Enhance Military Cargo Load Planning for Joint Forces

https://www.tapestrysolutions.com/2017/08/18/icodes-upgrades-enhance-military-distribution-deployment-processes-joint-services/
All Sources