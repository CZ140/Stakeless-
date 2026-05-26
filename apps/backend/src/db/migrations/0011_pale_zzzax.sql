CREATE INDEX IF NOT EXISTS "idx_game_logs_user_created" ON "game_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_balance" ON "users" USING btree ("balance" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_total_wagered" ON "users" USING btree ("total_wagered" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_total_profit" ON "users" USING btree ("total_profit" DESC NULLS LAST);