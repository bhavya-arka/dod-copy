CREATE TABLE "access_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"organization_id" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"used_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"flight_plan_id" integer,
	"insight_type" text NOT NULL,
	"input_hash" text NOT NULL,
	"insight_data" jsonb NOT NULL,
	"token_usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"regenerated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "aircraft_capacity_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"aircraft_type_id" text NOT NULL,
	"version" text DEFAULT 'v1' NOT NULL,
	"max_payload_lb" integer NOT NULL,
	"max_pallet_positions" integer,
	"cargo_bay_dims" jsonb NOT NULL,
	"notes" text,
	"default_cost_params" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aircraft_types" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"capacity_model_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capacity_forecasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"forecast_date" date NOT NULL,
	"projected_utilization" numeric(5, 2) NOT NULL,
	"projected_inbound_lbs" integer DEFAULT 0 NOT NULL,
	"projected_outbound_lbs" integer DEFAULT 0 NOT NULL,
	"confidence_score" numeric(3, 2) DEFAULT '0.8',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargo_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"cargo_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"pallet_position" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargo_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"tcn" text NOT NULL,
	"description" text,
	"weight_lb" numeric(12, 2),
	"length_in" numeric(8, 2),
	"width_in" numeric(8, 2),
	"height_in" numeric(8, 2),
	"cargo_type" text,
	"is_hazmat" boolean DEFAULT false NOT NULL,
	"hazmat_class" text,
	"priority" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_modal_manifests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source_site_id" integer NOT NULL,
	"destination_site_id" integer,
	"destination_address" text,
	"manifest_number" text NOT NULL,
	"name" text NOT NULL,
	"priority" text DEFAULT 'routine' NOT NULL,
	"classification" text DEFAULT 'unclassified' NOT NULL,
	"transport_mode" text,
	"flight_plan_id" integer,
	"convoy_id" integer,
	"voyage_id" integer,
	"estimated_cost_usd" numeric(12, 2),
	"estimated_duration_hours" numeric(8, 2),
	"estimated_distance_miles" numeric(10, 2),
	"total_weight_lbs" integer DEFAULT 0,
	"total_cube_ft" numeric(10, 2) DEFAULT '0',
	"total_items" integer DEFAULT 0,
	"status" text DEFAULT 'draft' NOT NULL,
	"required_delivery_date" timestamp,
	"estimated_departure" timestamp,
	"estimated_arrival" timestamp,
	"actual_departure" timestamp,
	"actual_arrival" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dag_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"cargo_shared" boolean DEFAULT false NOT NULL,
	"edge_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dag_flight_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"flight_node_id" uuid NOT NULL,
	"aircraft_type" text NOT NULL,
	"callsign" text,
	"departure_time" timestamp,
	"arrival_time" timestamp,
	"origin_icao" text,
	"destination_icao" text,
	"route" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dag_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"node_type" text NOT NULL,
	"name" text NOT NULL,
	"icao" text,
	"latitude" numeric(10, 6),
	"longitude" numeric(10, 6),
	"position_x" integer DEFAULT 0 NOT NULL,
	"position_y" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"flight_plan_id" integer NOT NULL,
	"source_node_id" integer NOT NULL,
	"target_node_id" integer NOT NULL,
	"edge_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"flight_plan_id" integer NOT NULL,
	"node_type" text NOT NULL,
	"parent_node_id" integer,
	"position_x" integer DEFAULT 0 NOT NULL,
	"position_y" integer DEFAULT 0 NOT NULL,
	"node_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_departure" timestamp,
	"scheduled_arrival" timestamp,
	"actual_departure" timestamp,
	"actual_arrival" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"allocation_data" jsonb NOT NULL,
	"movement_data" jsonb,
	"movement_items_count" integer NOT NULL,
	"total_weight_lb" integer NOT NULL,
	"aircraft_count" integer NOT NULL,
	"preferred_aircraft_type_id" text,
	"allow_mixed_fleet" boolean DEFAULT true NOT NULL,
	"mixed_fleet_mode" text DEFAULT 'PREFERRED_FIRST' NOT NULL,
	"preference_strength" numeric(3, 2) DEFAULT '0.5' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"flight_plan_id" integer,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"schedule_data" jsonb NOT NULL,
	"total_flights" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_convoy_vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"convoy_id" integer NOT NULL,
	"vehicle_type_id" integer NOT NULL,
	"position_in_convoy" integer DEFAULT 1 NOT NULL,
	"callsign" text,
	"driver_name" text,
	"cargo_manifest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_weight_lbs" integer DEFAULT 0,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_convoys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"route_id" integer,
	"name" text NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"vehicle_count" integer DEFAULT 0 NOT NULL,
	"total_cargo_weight_lbs" integer DEFAULT 0,
	"departure_time" timestamp,
	"arrival_time" timestamp,
	"scheduled_departure" timestamp,
	"scheduled_arrival" timestamp,
	"actual_departure" timestamp,
	"actual_arrival" timestamp,
	"status" text DEFAULT 'planning' NOT NULL,
	"cargo_manifest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"origin_name" text NOT NULL,
	"origin_lat" numeric(10, 6),
	"origin_lng" numeric(10, 6),
	"destination_name" text NOT NULL,
	"destination_lat" numeric(10, 6),
	"destination_lng" numeric(10, 6),
	"waypoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"distance_km" numeric(12, 2),
	"estimated_duration_hrs" numeric(8, 2),
	"status" text DEFAULT 'planned' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_vehicle_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"payload_lbs" integer NOT NULL,
	"curb_weight_lbs" integer,
	"gross_weight_lbs" integer,
	"length_in" numeric(8, 2),
	"width_in" numeric(8, 2),
	"height_in" numeric(8, 2),
	"bed_length_in" numeric(8, 2),
	"bed_width_in" numeric(8, 2),
	"max_speed_mph" integer,
	"range_miles" integer,
	"fuel_capacity_gal" numeric(6, 2),
	"fuel_consumption_mpg" numeric(4, 2),
	"fuel_type" text DEFAULT 'diesel',
	"axle_config" text,
	"can_tow_trailer" boolean DEFAULT false,
	"max_tow_weight_lbs" integer,
	"pallet_capacity_463l" integer DEFAULT 0,
	"pallet_capacity_40x48" integer DEFAULT 0,
	"passenger_capacity" integer DEFAULT 0,
	"model_file" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "land_vehicle_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "manifest_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"manifest_id" integer NOT NULL,
	"inventory_item_id" integer,
	"nsn" text,
	"part_number" text,
	"nomenclature" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_of_issue" text DEFAULT 'EA',
	"weight_lbs" integer,
	"length_in" numeric(8, 2),
	"width_in" numeric(8, 2),
	"height_in" numeric(8, 2),
	"cube_ft" numeric(8, 2),
	"hazmat_class" text,
	"is_hazmat" boolean DEFAULT false,
	"is_sensitive" boolean DEFAULT false,
	"picked" boolean DEFAULT false,
	"packed" boolean DEFAULT false,
	"loaded" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manifests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"flight_plan_id" integer,
	"manifest_data" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_weight_lb" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "plan_aircraft_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"aircraft_type_id" text NOT NULL,
	"available_count" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_solutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text NOT NULL,
	"aircraft_used" jsonb NOT NULL,
	"unallocated_cargo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"explanation" text,
	"comparison_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "port_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"flight_plan_id" integer NOT NULL,
	"airbase_id" text NOT NULL,
	"incoming_cargo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outgoing_cargo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available_cargo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebalancing_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_site_id" integer NOT NULL,
	"destination_site_id" integer NOT NULL,
	"suggested_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_weight_lbs" integer NOT NULL,
	"reason" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"executed_transfer_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sea_containers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"voyage_id" integer,
	"container_number" text NOT NULL,
	"container_type" text NOT NULL,
	"seal_number" text,
	"weight_lbs" integer,
	"tare_weight_lbs" integer,
	"status" text DEFAULT 'empty' NOT NULL,
	"cargo_manifest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sea_vessel_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"hull_prefix" text NOT NULL,
	"category" text NOT NULL,
	"cargo_capacity_lbs" integer NOT NULL,
	"teu_capacity" integer DEFAULT 0,
	"fuel_capacity_barrels" integer DEFAULT 0,
	"vehicle_capacity" integer DEFAULT 0,
	"lane_meters" integer DEFAULT 0,
	"displacement_tons" integer,
	"deadweight_tons" integer,
	"length_ft" integer,
	"beam_ft" integer,
	"draft_ft" integer,
	"max_speed_knots" integer,
	"cruise_speed_knots" integer,
	"range_nm" integer,
	"crew_size" integer,
	"has_crane" boolean DEFAULT false,
	"crane_capacity_tons" integer,
	"has_roro_capability" boolean DEFAULT false,
	"has_helicopter_deck" boolean DEFAULT false,
	"active_fleet_count" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sea_vessel_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sea_voyages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"vessel_name" text,
	"vessel_imo" text,
	"vessel_hull_number" text,
	"vessel_class" text,
	"origin_port" text NOT NULL,
	"destination_port" text NOT NULL,
	"port_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"departure_time" timestamp,
	"arrival_time" timestamp,
	"scheduled_departure" timestamp,
	"scheduled_arrival" timestamp,
	"actual_departure" timestamp,
	"actual_arrival" timestamp,
	"status" text DEFAULT 'planned' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "site_metrics_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"metric_date" date NOT NULL,
	"throughput_lbs" integer DEFAULT 0 NOT NULL,
	"inbound_shipments" integer DEFAULT 0 NOT NULL,
	"outbound_shipments" integer DEFAULT 0 NOT NULL,
	"avg_processing_hours" numeric(5, 2),
	"utilization_percent" numeric(5, 2),
	"items_processed" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"nsn" text NOT NULL,
	"min_quantity" integer DEFAULT 0 NOT NULL,
	"max_quantity" integer DEFAULT 1000 NOT NULL,
	"reorder_point" integer DEFAULT 10 NOT NULL,
	"last_reviewed_at" timestamp,
	"reviewed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"flight_plan_id" integer,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"split_data" jsonb NOT NULL,
	"total_splits" integer NOT NULL,
	"total_pallets" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_operational_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"transport_mode" text NOT NULL,
	"schedule_date" date NOT NULL,
	"plan_count" integer DEFAULT 0 NOT NULL,
	"total_cargo_lbs" integer DEFAULT 0 NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"transport_mode" text NOT NULL,
	"asset_type" text,
	"reserved_capacity_lbs" integer NOT NULL,
	"reservation_date" date NOT NULL,
	"time_slot" text,
	"purpose" text NOT NULL,
	"transfer_id" integer,
	"reserved_by" integer NOT NULL,
	"status" text DEFAULT 'tentative' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"organization_id" integer,
	"role" text DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "warehouse_action_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"optimization_run_id" integer,
	"user_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"plan_type" text NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_aging_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"days" integer NOT NULL,
	"color" text DEFAULT '#fbbf24' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"entity_name" text,
	"message" text NOT NULL,
	"metric_value" numeric(14, 4),
	"threshold_value" numeric(14, 4),
	"trend_change_percent" numeric(8, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_analytics_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"site_id" integer,
	"snapshot_date" date NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_buildings" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"length_m" numeric(10, 3),
	"width_m" numeric(10, 3),
	"height_m" numeric(10, 3),
	"geometry_notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_capacity_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_capacity" integer NOT NULL,
	"used_capacity" integer NOT NULL,
	"utilization_percent" numeric(5, 2) NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"total_weight_lbs" numeric(14, 2),
	"zone_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inbound_count" integer DEFAULT 0 NOT NULL,
	"outbound_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_inventory_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"location_id" integer,
	"zone_id" integer,
	"storage_facility" text,
	"ship" text,
	"ship_class" text,
	"program_code" text,
	"requisition_no" text,
	"authority" text,
	"work_item" text,
	"li" text,
	"matl_ctrl" text,
	"hmic" text,
	"smcc" text,
	"item_audit" text,
	"audit_no" text,
	"ship_ind" text,
	"ship_avail" text,
	"nsn" text,
	"fsc" text,
	"niin" text,
	"description" text NOT NULL,
	"cage" text,
	"manufacturer" text,
	"mfg_date" text,
	"contract_no" text,
	"iuid" text,
	"unit" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_price" numeric(14, 2),
	"receipt_price" numeric(14, 2),
	"receipt_date" text,
	"location" text,
	"lot_no" text,
	"serial_no" text,
	"barcode" text,
	"inventory_type" text,
	"material_disposition" text,
	"condition_code" text,
	"condition" text,
	"asset_type" text,
	"exp_date" text,
	"ext_date" text,
	"insp_date" text,
	"last_audit_date" text,
	"data_user_id" text,
	"remarks" text,
	"in_service_date" text,
	"warranty_item" text,
	"mission_id" text,
	"lin_esd" text,
	"last_moved" timestamp,
	"weight_lbs" numeric(12, 2),
	"raw_row" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"milstrip_number" text,
	"fedlog_code" text,
	"last_received_date" timestamp,
	"aging_days" integer DEFAULT 0,
	"workflow_status" text DEFAULT 'received',
	"workflow_updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "warehouse_item_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"item_description" text,
	"nsn" text,
	"from_zone_id" integer,
	"from_zone_name" text,
	"from_location" text,
	"to_zone_id" integer,
	"to_zone_name" text,
	"to_location" text,
	"quantity_moved" integer DEFAULT 1 NOT NULL,
	"weight_lbs" numeric(12, 2),
	"movement_type" text DEFAULT 'internal' NOT NULL,
	"movement_reason" text,
	"source_type" text,
	"source_id" integer,
	"user_id" integer,
	"moved_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_item_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"requisition_no" text,
	"from_location" text,
	"to_location" text,
	"from_zone_id" integer,
	"to_zone_id" integer,
	"raw_row_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"building_id" integer NOT NULL,
	"zone_id" integer,
	"code" text NOT NULL,
	"location_type" text DEFAULT 'pallet_position' NOT NULL,
	"capacity_pallets" integer DEFAULT 1 NOT NULL,
	"x_m" numeric(10, 3),
	"y_m" numeric(10, 3),
	"z_m" numeric(10, 3),
	"occupied" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"block_length_ft" numeric(5, 2) DEFAULT '4',
	"block_width_ft" numeric(5, 2) DEFAULT '4',
	"block_height_ft" numeric(5, 2) DEFAULT '4',
	"max_weight_lbs" integer DEFAULT 2000,
	"current_weight_lbs" integer DEFAULT 0,
	"is_occupied" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "warehouse_metric_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"metric_key" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_optimization_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"from_location" text,
	"to_location" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_by" integer,
	"completed_at" timestamp,
	"movement_notes" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_optimization_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_optimization_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"parent_plan_id" integer,
	"name" text NOT NULL,
	"algorithm" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"diff_patch" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_actions" integer DEFAULT 0 NOT NULL,
	"completed_actions" integer DEFAULT 0 NOT NULL,
	"comparison_context" jsonb,
	"target_completion_date" timestamp,
	"executed_at" timestamp,
	"executed_by" integer,
	"cancelled_at" timestamp,
	"cancelled_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_optimization_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"algorithm" text NOT NULL,
	"input_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "warehouse_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"date_format" text DEFAULT 'MM/DD/YYYY' NOT NULL,
	"weight_unit" text DEFAULT 'lbs' NOT NULL,
	"default_page_size" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "warehouse_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'UTC',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"country" text DEFAULT 'USA',
	"latitude" numeric(10, 6),
	"longitude" numeric(10, 6),
	"aor" text,
	"shipyard_code" text,
	"dodaac" text,
	"total_pallet_positions" integer DEFAULT 0,
	"open_pallet_positions" integer DEFAULT 0,
	"total_cubic_feet" numeric(12, 2) DEFAULT '0',
	"used_cubic_feet" numeric(12, 2) DEFAULT '0',
	"max_weight_lbs" integer,
	"current_weight_lbs" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "warehouse_state_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" text NOT NULL,
	"source_id" integer,
	"parent_version_id" integer,
	"items_affected" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reverted_at" timestamp,
	"reverted_by" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source_site_id" integer NOT NULL,
	"destination_site_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"transport_mode" text DEFAULT 'land' NOT NULL,
	"transfer_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"air_metadata" jsonb,
	"pacaf_manifest" jsonb,
	"notes" text,
	"scheduled_date" timestamp,
	"completed_date" timestamp,
	"priority_level" text DEFAULT 'routine' NOT NULL,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"escalated_at" timestamp,
	"escalated_by" integer,
	"queue_position" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_zone_capacity_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"total_capacity" integer NOT NULL,
	"current_item_count" integer NOT NULL,
	"current_weight_lbs" integer DEFAULT 0,
	"bulk_used" integer DEFAULT 0,
	"rack_used" integer DEFAULT 0,
	"source" text DEFAULT 'resync' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"building_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"zone_type" text DEFAULT 'rack' NOT NULL,
	"is_outdoor" boolean DEFAULT false,
	"usage_type" text DEFAULT 'general',
	"bulk_available" integer DEFAULT 0,
	"bulk_open" integer DEFAULT 0,
	"rack_available" integer DEFAULT 0,
	"rack_open" integer DEFAULT 0,
	"location_pattern" text,
	"weight_limit_lbs" integer DEFAULT 2000,
	"capacity_pallets" integer,
	"current_item_count" integer DEFAULT 0,
	"current_weight_lbs" integer DEFAULT 0,
	"total_capacity" integer DEFAULT 100,
	"last_synced_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouse_item_versions" ADD CONSTRAINT "warehouse_item_versions_version_id_warehouse_state_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."warehouse_state_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_optimization_actions" ADD CONSTRAINT "warehouse_optimization_actions_plan_id_warehouse_optimization_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."warehouse_optimization_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_optimization_events" ADD CONSTRAINT "warehouse_optimization_events_plan_id_warehouse_optimization_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."warehouse_optimization_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_optimization_plans" ADD CONSTRAINT "warehouse_optimization_plans_site_id_warehouse_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."warehouse_sites"("id") ON DELETE cascade ON UPDATE no action;