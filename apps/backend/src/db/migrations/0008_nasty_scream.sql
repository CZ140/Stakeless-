CREATE TABLE IF NOT EXISTS "poker_seats" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"seat_index" integer NOT NULL,
	"stack" bigint NOT NULL,
	"sitting_out" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poker_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"type" varchar(20) DEFAULT 'public' NOT NULL,
	"owner_id" integer,
	"group_id" integer,
	"small_blind" bigint NOT NULL,
	"big_blind" bigint NOT NULL,
	"max_seats" integer DEFAULT 6 NOT NULL,
	"min_buy_in" bigint NOT NULL,
	"max_buy_in" bigint NOT NULL,
	"bot_target" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poker_seats" ADD CONSTRAINT "poker_seats_table_id_poker_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."poker_tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poker_seats" ADD CONSTRAINT "poker_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poker_tables" ADD CONSTRAINT "poker_tables_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poker_tables" ADD CONSTRAINT "poker_tables_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "poker_seat_unique" ON "poker_seats" USING btree ("table_id","seat_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "poker_seat_user_unique" ON "poker_seats" USING btree ("table_id","user_id");